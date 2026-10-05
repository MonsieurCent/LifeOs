/**
 * Idempotent, Non-Destructive Migration Service
 * Migrates legacy monolithic `users/{uid}/data/fitnessStore` to the modular collection-based architecture:
 * - users/{uid}/profile/main
 * - users/{uid}/workouts/{workoutId}
 * - users/{uid}/programs/{programId}
 * - users/{uid}/plans/week_{weekNumber}
 * - users/{uid}/measurements/{measurementId}
 * - users/{uid}/customExercises/{exerciseId}
 * - users/{uid}/migration/status
 */

import { db, doc, getDoc, setDoc } from "../lib/firebase";
import { workoutRepository } from "../repositories/workoutRepository";
import { programRepository } from "../repositories/programRepository";
import { planRepository } from "../repositories/planRepository";
import { measurementRepository } from "../repositories/measurementRepository";
import { exerciseRepository } from "../repositories/exerciseRepository";
import { profileRepository, ProfileDocument } from "../repositories/profileRepository";
import { sanitizeForFirestore } from "../utils/firestoreSync";
import { firestoreTracker } from "../utils/firestoreInstrumentation";
import { isFirestoreQuotaCooldownActive } from "../utils/syncManager";
import { idbGet, idbSet } from "../utils/idbStorage";

export interface MigrationStatus {
  schemaVersion: number;
  migrationCompletedAt: string;
  source: "fitnessStore_master_document";
  counts: {
    workouts: number;
    programs: number;
    plans: number;
    measurements: number;
    customExercises: number;
  };
  deviceId?: string;
}

export class MigrationService {
  private getLocalVersionKey(uid: string): string {
    return `pulse_${uid || "guest"}_schema_version`;
  }

  /**
   * Checks if user has completed migration to Schema Version 2.
   */
  async getMigrationStatus(uid: string): Promise<MigrationStatus | null> {
    if (!uid || uid === "guest") {
      const localVer = await idbGet<number>(this.getLocalVersionKey(uid));
      if (localVer && localVer >= 2) {
        return {
          schemaVersion: localVer,
          migrationCompletedAt: new Date().toISOString(),
          source: "fitnessStore_master_document",
          counts: { workouts: 0, programs: 0, plans: 0, measurements: 0, customExercises: 0 }
        };
      }
      return null;
    }

    // 1. Check local IndexedDB status first
    const localVer = await idbGet<number>(this.getLocalVersionKey(uid));
    if (localVer && localVer >= 2) {
      return {
        schemaVersion: localVer,
        migrationCompletedAt: new Date().toISOString(),
        source: "fitnessStore_master_document",
        counts: { workouts: 0, programs: 0, plans: 0, measurements: 0, customExercises: 0 }
      };
    }

    // 2. Check remote migration marker
    if (!navigator.onLine || isFirestoreQuotaCooldownActive()) {
      return null;
    }

    try {
      const statusDocRef = doc(db, "users", uid, "migration", "status");
      const snap = await getDoc(statusDocRef);
      if (snap.exists()) {
        const data = snap.data() as MigrationStatus;
        if (data.schemaVersion >= 2) {
          await idbSet(this.getLocalVersionKey(uid), data.schemaVersion);
          return data;
        }
      }
    } catch {
      // Fallback
    }

    return null;
  }

  /**
   * Executes the migration safely, idempotently, and non-destructively.
   */
  async runMigration(uid: string, legacyDataOverride?: any): Promise<{
    migrated: boolean;
    alreadyMigrated: boolean;
    counts: MigrationStatus["counts"];
    error?: string;
  }> {
    if (!uid || uid === "guest") {
      await idbSet(this.getLocalVersionKey("guest"), 2);
      return {
        migrated: true,
        alreadyMigrated: false,
        counts: { workouts: 0, programs: 0, plans: 0, measurements: 0, customExercises: 0 }
      };
    }

    // Check if already migrated
    const existingStatus = await this.getMigrationStatus(uid);
    if (existingStatus && existingStatus.schemaVersion >= 2) {
      return {
        migrated: false,
        alreadyMigrated: true,
        counts: existingStatus.counts
      };
    }

    let sourceData = legacyDataOverride;

    // If no override passed, fetch legacy fitnessStore document
    if (!sourceData) {
      if (!navigator.onLine || isFirestoreQuotaCooldownActive()) {
        return {
          migrated: false,
          alreadyMigrated: false,
          counts: { workouts: 0, programs: 0, plans: 0, measurements: 0, customExercises: 0 },
          error: "Cloud offline or in quota cooldown; migration deferred."
        };
      }

      try {
        const legacyDocRef = doc(db, "users", uid, "data", "fitnessStore");
        const legacySnap = await getDoc(legacyDocRef);
        firestoreTracker.recordRead(1, "Read legacy fitnessStore for migration");

        if (!legacySnap.exists()) {
          // New user with no legacy document - mark schemaVersion 2 directly
          await this.finalizeMigration(uid, {
            workouts: 0,
            programs: 0,
            plans: 0,
            measurements: 0,
            customExercises: 0
          });
          return {
            migrated: true,
            alreadyMigrated: false,
            counts: { workouts: 0, programs: 0, plans: 0, measurements: 0, customExercises: 0 }
          };
        }

        sourceData = legacySnap.data();
      } catch (err: any) {
        return {
          migrated: false,
          alreadyMigrated: false,
          counts: { workouts: 0, programs: 0, plans: 0, measurements: 0, customExercises: 0 },
          error: err?.message || "Failed to load legacy document."
        };
      }
    }

    const counts = {
      workouts: 0,
      programs: 0,
      plans: 0,
      measurements: 0,
      customExercises: 0
    };

    try {
      // 1. Migrate Workouts locally into subcollection storage
      const workouts = Array.isArray(sourceData.workouts) ? sourceData.workouts : [];
      for (const w of workouts) {
        const wId = w.id || `sess_${w.date || Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        await workoutRepository.saveCompletedWorkout(uid, { ...w, id: wId }, { skipCloud: true });
        counts.workouts++;
      }

      // 2. Migrate Programs locally into subcollection storage
      const programs = Array.isArray(sourceData.programs) ? sourceData.programs : [];
      for (const p of programs) {
        const pId = p.id || `prog_${Math.random().toString(36).substring(2, 8)}`;
        await programRepository.saveProgram(uid, { ...p, id: pId }, { skipCloud: true });
        counts.programs++;
      }

      // 3. Migrate Plans locally into subcollection storage
      const plans = Array.isArray(sourceData.matrixPlans) ? sourceData.matrixPlans : [];
      for (const pl of plans) {
        if (pl.weekNumber !== undefined) {
          await planRepository.savePlan(uid, pl, { skipCloud: true });
          counts.plans++;
        }
      }

      // 4. Migrate Measurements locally into subcollection storage
      const measurements = Array.isArray(sourceData.bodyCompRecords) ? sourceData.bodyCompRecords : [];
      for (const m of measurements) {
        const mId = m.id || `meas_${m.date || Date.now()}`;
        await measurementRepository.saveMeasurement(uid, { ...m, id: mId }, { skipCloud: true });
        counts.measurements++;
      }

      // 5. Migrate Custom Exercises locally into subcollection storage
      const exercises = Array.isArray(sourceData.customExercises) ? sourceData.customExercises : [];
      for (const ex of exercises) {
        const exId = ex.id || `ex_${Math.random().toString(36).substring(2, 7)}`;
        await exerciseRepository.saveExercise(uid, { ...ex, id: exId }, { skipCloud: true });
        counts.customExercises++;
      }

      // 6. Migrate Profile & Settings Document locally into subcollection storage
      const profileDoc: ProfileDocument = {
        userProfile: sourceData.userProfile || {},
        healthMetrics: sourceData.healthMetrics || {},
        activeProgramId: sourceData.activeProgramId,
        completedDaysRecord: sourceData.completedDaysRecord || {},
        supplements: sourceData.supplements || [],
        supplementCategories: sourceData.supplementCategories || [],
        progressPhotos: sourceData.progressPhotos || [],
        sessionFeelings: sourceData.sessionFeelings || [],
        updatedAt: new Date().toISOString()
      };
      await profileRepository.saveProfile(uid, profileDoc, { skipCloud: true });

      // 7. Write Migration Marker and Verification
      await this.finalizeMigration(uid, counts);

      return {
        migrated: true,
        alreadyMigrated: false,
        counts
      };
    } catch (err: any) {
      console.error("Migration encountered error; safe recovery state preserved:", err);
      return {
        migrated: false,
        alreadyMigrated: false,
        counts,
        error: err?.message
      };
    }
  }

  private async finalizeMigration(uid: string, counts: MigrationStatus["counts"]): Promise<void> {
    const statusPayload: MigrationStatus = {
      schemaVersion: 2,
      migrationCompletedAt: new Date().toISOString(),
      source: "fitnessStore_master_document",
      counts
    };

    // Save locally
    await idbSet(this.getLocalVersionKey(uid), 2);
    try {
      if (typeof localStorage !== "undefined") {
        localStorage.setItem(this.getLocalVersionKey(uid), "2");
      }
    } catch {}

    // Save marker to Firestore
    if (uid && uid !== "guest" && navigator.onLine && !isFirestoreQuotaCooldownActive()) {
      try {
        const statusDocRef = doc(db, "users", uid, "migration", "status");
        await setDoc(statusDocRef, sanitizeForFirestore(statusPayload), { merge: true });
        firestoreTracker.recordWrite(1, "Finalize Schema Version 2 Migration");
      } catch {}
    }
  }
}

export const migrationService = new MigrationService();
