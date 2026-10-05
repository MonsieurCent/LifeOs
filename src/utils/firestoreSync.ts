/**
 * Firestore Serialization & Cross-Device Sync Utility
 * 
 * Solves:
 * 1. Explicit 'undefined' field errors in Firestore setDoc/updateDoc
 * 2. Race conditions and echo loops (replaced fragile timed gates with mutation tracking)
 * 3. Bidirectional merge conflict resolution (PC & Phone edits preserved without losing weeks or sets)
 * 4. Deletion propagation via tombstones (prevents resurrection of deleted workouts/programs)
 * 5. Accurate sync status tracking (never show "Saved to cloud" when in-flight or failed)
 */

import {
  WorkoutSession,
  BodyCompositionRecord,
  UserProfile,
  SyncedHealthMetrics,
  SupplementEntry,
  ProgressPhoto,
  SessionFeeling,
  TrainingProgram,
  WeeklyMatrixPlan,
  DayOfWeek,
  Gym
} from "../types";
import { TombstoneStore, mergeTombstones, DUMMY_UNLOGGED_WORKOUT_IDS, DUMMY_UNLOGGED_DATES, sanitizeCompletedDaysRecord } from "./userStorage";
import { sanitizeSingleMuscleMatrix, isLegacyPplPlan } from "./fitnessData";

/**
 * Recursively removes all undefined values from an object or array,
 * replacing undefined with null or omitting keys, ensuring Firestore
 * never throws "Unsupported field value: undefined".
 * 
 * Crucially preserves genuine zeros (0, 0.0), false, and empty strings.
 */
export function sanitizeForFirestore<T>(val: T): T {
  if (val === undefined) {
    return null as unknown as T;
  }
  if (val === null || typeof val !== "object") {
    return val;
  }
  if (Array.isArray(val)) {
    return val.map((item) => sanitizeForFirestore(item)) as unknown as T;
  }

  const cleanObj: Record<string, any> = {};
  for (const [key, value] of Object.entries(val)) {
    if (value !== undefined) {
      cleanObj[key] = sanitizeForFirestore(value);
    }
  }
  return cleanObj as T;
}

export interface SyncStorePayload {
  workouts: WorkoutSession[];
  matrixPlans: any[];
  bodyCompRecords: BodyCompositionRecord[];
  userProfile: UserProfile;
  healthMetrics: SyncedHealthMetrics;
  supplements: SupplementEntry[];
  supplementCategories?: string[];
  progressPhotos: ProgressPhoto[];
  sessionFeelings: SessionFeeling[];
  programs: TrainingProgram[];
  activeProgramId: string;
  completedDaysRecord: Record<string, boolean>;
  customExercises: any[];
  gyms?: Gym[];
  tombstones?: TombstoneStore;
  updatedAt: string;
  deviceId: string;
  revision: number;
}

/**
 * Gets or creates a persistent device ID to identify whether an incoming snapshot
 * originated from the local device or a remote device.
 */
export function getDeviceId(): string {
  let id = localStorage.getItem("pulse_device_id");
  if (!id) {
    id = `dev_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    localStorage.setItem("pulse_device_id", id);
  }
  return id;
}

/**
 * Gets a human-readable device label (e.g., Device A (Mobile) or Device B (Desktop))
 */
export function getDeviceLabel(): string {
  if (typeof window === "undefined" || typeof localStorage === "undefined") {
    return "Device (Server)";
  }
  let label = localStorage.getItem("pulse_device_label");
  if (!label) {
    const isMobile = typeof navigator !== "undefined" && /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
    label = isMobile ? "Device A (Mobile)" : "Device B (Desktop)";
    localStorage.setItem("pulse_device_label", label);
  }
  return label;
}

/**
 * Merges two lists of workout sessions without losing entries from either device.
 * De-duplicates by session id:
 * - Checks deletion tombstones so deleted workouts stay deleted on both devices.
 * - Compares ISO `updatedAt` (or creation timestamp), NOT calendar date, so real edits to
 *   the same day session are never ignored.
 * - If timestamps are equal or missing, compares exercise and set depth to prevent data loss.
 */
export function mergeWorkouts(
  local: WorkoutSession[],
  remote: WorkoutSession[],
  tombstones: Record<string, string> = {}
): WorkoutSession[] {
  const map = new Map<string, WorkoutSession>();

  // Helper to extract comparable millisecond timestamp
  const getTimestamp = (w: WorkoutSession): number => {
    if (w.updatedAt) {
      const t = new Date(w.updatedAt).getTime();
      if (!isNaN(t)) return t;
    }
    if (w.date) {
      const t = new Date(w.date).getTime();
      if (!isNaN(t)) return t;
    }
    return 0;
  };

  // Helper to count total completed sets in a session
  const countSets = (w: WorkoutSession): number => {
    return w.exercises?.reduce((sum, ex) => sum + (ex.sets?.length || 0), 0) || 0;
  };

  // 1. Add all local workouts, filtering out tombstoned deletions and unlogged dummy sessions
  for (const w of local) {
    if (!w || !w.id) continue;
    if (DUMMY_UNLOGGED_WORKOUT_IDS.has(w.id)) continue;
    if (w.date && DUMMY_UNLOGGED_DATES.has(w.date) && w.id !== "workout-1789964641991") continue;
    const deletedAt = tombstones[w.id];
    const wTime = getTimestamp(w);
    if (deletedAt && new Date(deletedAt).getTime() >= wTime) {
      continue; // Exclude deleted workout
    }
    map.set(w.id, w);
  }

  // 2. Merge remote workouts
  for (const r of remote) {
    if (!r || !r.id) continue;
    if (DUMMY_UNLOGGED_WORKOUT_IDS.has(r.id)) continue;
    if (r.date && DUMMY_UNLOGGED_DATES.has(r.date) && r.id !== "workout-1789964641991") continue;
    const deletedAt = tombstones[r.id];
    const rTime = getTimestamp(r);
    if (deletedAt && new Date(deletedAt).getTime() >= rTime) {
      continue; // Exclude deleted workout
    }

    const existing = map.get(r.id);
    if (!existing) {
      map.set(r.id, r);
    } else {
      // Both exist: compare updatedAt timestamps
      const existingTime = getTimestamp(existing);

      if (rTime > existingTime) {
        map.set(r.id, r);
      } else if (rTime < existingTime) {
        map.set(r.id, existing);
      } else {
        // Equal or missing updatedAt: preserve the version with more exercises/sets or notes
        const existingSets = countSets(existing);
        const remoteSets = countSets(r);
        if (remoteSets > existingSets) {
          map.set(r.id, r);
        } else if (remoteSets === existingSets && r.notes && !existing.notes) {
          map.set(r.id, r);
        } else {
          map.set(r.id, existing);
        }
      }
    }
  }

  return Array.from(map.values()).sort((a, b) => {
    return new Date(b.date).getTime() - new Date(a.date).getTime();
  });
}

/**
 * Merges matrix plans week-by-week and day-by-day.
 * Ensures that if PC edited Week 2 and Phone edited Week 8, both edits survive!
 */
export function mergeWeeklyMatrixPlans(
  localPlans: WeeklyMatrixPlan[],
  remotePlans: WeeklyMatrixPlan[],
  targetProgramId?: string
): WeeklyMatrixPlan[] {
  const weekMap = new Map<number, WeeklyMatrixPlan>();

  // 1. Add local weeks
  for (const wp of localPlans) {
    if (wp && typeof wp.weekNumber === "number") {
      weekMap.set(wp.weekNumber, wp);
    }
  }

  // 2. Merge remote weeks
  for (const rp of remotePlans) {
    if (!rp || typeof rp.weekNumber !== "number") continue;
    const existing = weekMap.get(rp.weekNumber);
    if (!existing) {
      weekMap.set(rp.weekNumber, rp);
    } else {
      const localWeekTime = (existing as any).updatedAt ? new Date((existing as any).updatedAt).getTime() : 0;
      const remoteWeekTime = (rp as any).updatedAt ? new Date((rp as any).updatedAt).getTime() : 0;

      // Both devices have this week: merge day by day
      const mergedDays = { ...existing.days };
      if (rp.days) {
        for (const [dayKey, remoteDay] of Object.entries(rp.days)) {
          const typedDayKey = dayKey as DayOfWeek;
          const localDay = existing.days?.[typedDayKey];

          if (!localDay) {
            mergedDays[typedDayKey] = remoteDay;
          } else {
            const localDayTime = (localDay as any).updatedAt ? new Date((localDay as any).updatedAt).getTime() : localWeekTime;
            const remoteDayTime = (remoteDay as any).updatedAt ? new Date((remoteDay as any).updatedAt).getTime() : remoteWeekTime;

            if (remoteDayTime > localDayTime) {
              mergedDays[typedDayKey] = remoteDay;
            } else if (localDayTime > remoteDayTime) {
              mergedDays[typedDayKey] = localDay;
            } else {
              // Timestamps equal: keep localDay to respect recent local edits/deletions
              mergedDays[typedDayKey] = localDay;
            }
          }
        }
      }

      const baseWeek = remoteWeekTime > localWeekTime ? rp : existing;
      const mergedUpdatedAt = (baseWeek as any).updatedAt || (remoteWeekTime > localWeekTime ? (rp as any).updatedAt : (existing as any).updatedAt) || (existing as any).updatedAt || (rp as any).updatedAt;
      weekMap.set(rp.weekNumber, {
        ...existing,
        ...baseWeek,
        updatedAt: mergedUpdatedAt,
        days: mergedDays
      });
    }
  }

  const rawMerged = Array.from(weekMap.values()).sort((a, b) => a.weekNumber - b.weekNumber);
  if (targetProgramId === "prog-single-muscle" || targetProgramId === "prog-hypertrophy-5day") {
    return sanitizeSingleMuscleMatrix(rawMerged, undefined, targetProgramId);
  }
  return rawMerged;
}

/**
 * Merges training programs between devices without deleting custom user programs.
 * Fixes previous bug where an older 8-week plan would overwrite a newer 8-week plan.
 * Preserves independent edits across weeks from both devices and respects tombstones.
 */
export function mergePrograms(
  local: TrainingProgram[],
  remote: TrainingProgram[],
  tombstones: Record<string, string> = {}
): TrainingProgram[] {
  const map = new Map<string, TrainingProgram>();

  for (const p of local) {
    if (!p || !p.id) continue;
    if (p.id === "prog-hypertrophy-5day") continue;
    const deletedAt = tombstones[p.id];
    const pTime = p.createdAt ? new Date(p.createdAt).getTime() : 0;
    if (deletedAt && new Date(deletedAt).getTime() >= pTime) {
      continue;
    }
    map.set(p.id, p);
  }

  for (const r of remote) {
    if (!r || !r.id) continue;
    if (r.id === "prog-hypertrophy-5day") continue;
    const deletedAt = tombstones[r.id];
    const rTime = r.createdAt ? new Date(r.createdAt).getTime() : 0;
    if (deletedAt && new Date(deletedAt).getTime() >= rTime) {
      continue;
    }

    const existing = map.get(r.id);
    if (!existing) {
      map.set(r.id, r);
    } else {
      // Both exist: merge matrix plans week-by-week
      let mergedMatrix = mergeWeeklyMatrixPlans(
        existing.matrixPlans || [],
        r.matrixPlans || [],
        r.id
      );
      if (r.id === "prog-single-muscle" || r.name?.toLowerCase().includes("single muscle")) {
        mergedMatrix = sanitizeSingleMuscleMatrix(mergedMatrix, undefined, r.id, r.name);
      }

      const existingTime = (existing as any).updatedAt ? new Date((existing as any).updatedAt).getTime() : 0;
      const remoteTime = (r as any).updatedAt ? new Date((r as any).updatedAt).getTime() : 0;
      const base = remoteTime > existingTime ? r : existing;

      map.set(r.id, {
        ...base,
        durationWeeks: Math.max(existing.durationWeeks || 0, r.durationWeeks || 0, mergedMatrix.length),
        totalWeeks: Math.max(existing.totalWeeks || 0, r.totalWeeks || 0, mergedMatrix.length),
        matrixPlans: mergedMatrix
      });
    }
  }

  return Array.from(map.values());
}

/**
 * Merges body composition records by id, ensuring no manual entries are lost.
 * Respects deletion tombstones and compares ISO timestamps.
 */
export function mergeBodyCompRecords(
  local: BodyCompositionRecord[],
  remote: BodyCompositionRecord[],
  tombstones: Record<string, string> = {}
): BodyCompositionRecord[] {
  const map = new Map<string, BodyCompositionRecord>();

  const getRecordTime = (b: BodyCompositionRecord): number => {
    if ((b as any).updatedAt) {
      const t = new Date((b as any).updatedAt).getTime();
      if (!isNaN(t)) return t;
    }
    if (b.date) {
      const t = new Date(b.date).getTime();
      if (!isNaN(t)) return t;
    }
    return 0;
  };

  for (const b of local) {
    if (!b || !b.id) continue;
    const deletedAt = tombstones[b.id];
    const bTime = getRecordTime(b);
    if (deletedAt && new Date(deletedAt).getTime() >= bTime) continue;
    map.set(b.id, b);
  }

  for (const r of remote) {
    if (!r || !r.id) continue;
    const deletedAt = tombstones[r.id];
    const rTime = getRecordTime(r);
    if (deletedAt && new Date(deletedAt).getTime() >= rTime) continue;

    const existing = map.get(r.id);
    if (!existing) {
      map.set(r.id, r);
    } else {
      const existingTime = getRecordTime(existing);
      if (rTime >= existingTime) {
        map.set(r.id, r);
      }
    }
  }

  return Array.from(map.values()).sort((a, b) => {
    return new Date(b.date).getTime() - new Date(a.date).getTime();
  });
}

export interface LocalSyncSnapshot {
  workouts: WorkoutSession[];
  matrixPlans: any[];
  bodyCompRecords: BodyCompositionRecord[];
  userProfile: UserProfile;
  healthMetrics: SyncedHealthMetrics;
  supplements: SupplementEntry[];
  supplementCategories?: string[];
  progressPhotos: ProgressPhoto[];
  sessionFeelings: SessionFeeling[];
  programs: TrainingProgram[];
  activeProgramId: string;
  completedDaysRecord: Record<string, boolean>;
  customExercises: any[];
  gyms?: Gym[];
}

/**
 * Pure, deterministic merger between the authoritative server document and local client state.
 * Solves stale whole-document overwrites: Client B merging with a live server document
 * guarantees that workouts/programs committed by Client A are never overwritten, even if
 * Client B started from an older snapshot.
 */
export function mergeLocalWithServerDocument(
  serverData: SyncStorePayload | null | undefined,
  localData: LocalSyncSnapshot,
  localTombstones: TombstoneStore,
  deviceId: string,
  localRevision: number
): {
  finalPayload: SyncStorePayload;
  mergedData: LocalSyncSnapshot;
  mergedTombstones: TombstoneStore;
} {
  const serverTombstones = serverData?.tombstones || { workouts: {}, programs: {}, bodyComp: {} };
  const mergedTombstones = mergeTombstones(localTombstones, serverTombstones);

  if (!serverData) {
    const nextRevision = Math.max(1, localRevision);
    const finalPayload: SyncStorePayload = {
      workouts: localData.workouts || [],
      matrixPlans: localData.matrixPlans || [],
      bodyCompRecords: localData.bodyCompRecords || [],
      userProfile: localData.userProfile,
      healthMetrics: localData.healthMetrics,
      supplements: localData.supplements || [],
      supplementCategories: localData.supplementCategories || [],
      progressPhotos: localData.progressPhotos || [],
      sessionFeelings: localData.sessionFeelings || [],
      programs: localData.programs || [],
      activeProgramId: localData.activeProgramId || "",
      completedDaysRecord: localData.completedDaysRecord || {},
      customExercises: localData.customExercises || [],
      gyms: localData.gyms || [],
      tombstones: mergedTombstones,
      updatedAt: new Date().toISOString(),
      deviceId,
      revision: nextRevision
    };

    return {
      finalPayload,
      mergedData: { ...localData },
      mergedTombstones
    };
  }

  // Server document exists: perform deep, field-by-field and record-by-record merge
  const mergedWorkouts = mergeWorkouts(
    localData.workouts || [],
    serverData.workouts || [],
    mergedTombstones.workouts
  );

  const mergedPrograms = mergePrograms(
    localData.programs || [],
    serverData.programs || [],
    mergedTombstones.programs
  );

  const mergedMatrixPlans = mergeWeeklyMatrixPlans(
    localData.matrixPlans || [],
    serverData.matrixPlans || []
  );

  const mergedBodyComp = mergeBodyCompRecords(
    localData.bodyCompRecords || [],
    serverData.bodyCompRecords || [],
    mergedTombstones.bodyComp
  );

  const mergedCompletedDays = sanitizeCompletedDaysRecord({
    ...(serverData.completedDaysRecord || {}),
    ...(localData.completedDaysRecord || {})
  });

  const mergedActiveProgramId = localData.activeProgramId || serverData.activeProgramId || "";

  // User Profile: merge newer fields or preserve populated fields
  const serverProfileTime = (serverData.userProfile as any)?.updatedAt ? new Date((serverData.userProfile as any).updatedAt).getTime() : 0;
  const localProfileTime = (localData.userProfile as any)?.updatedAt ? new Date((localData.userProfile as any).updatedAt).getTime() : 0;
  const mergedUserProfile: UserProfile = (localProfileTime >= serverProfileTime 
    ? { ...(serverData.userProfile || {}), ...(localData.userProfile || {}) }
    : { ...(localData.userProfile || {}), ...(serverData.userProfile || {}) }) as UserProfile;

  // Health Metrics: merge keys
  const mergedHealthMetrics: SyncedHealthMetrics = {
    ...(serverData.healthMetrics || {}),
    ...(localData.healthMetrics || {})
  } as SyncedHealthMetrics;

  // Supplements: union by id, latest timestamp or local priority
  const suppMap = new Map<string, SupplementEntry>();
  for (const s of (serverData.supplements || [])) {
    if (s && s.id) suppMap.set(s.id, s);
  }
  for (const s of (localData.supplements || [])) {
    if (s && s.id) suppMap.set(s.id, s);
  }
  const mergedSupplements = Array.from(suppMap.values());

  // Supplement Categories: unique union
  const mergedCategories = Array.from(new Set([
    ...(serverData.supplementCategories || []),
    ...(localData.supplementCategories || [])
  ]));

  // Progress Photos: union by id
  const photoMap = new Map<string, ProgressPhoto>();
  for (const p of (serverData.progressPhotos || [])) {
    if (p && p.id) photoMap.set(p.id, p);
  }
  for (const p of (localData.progressPhotos || [])) {
    if (p && p.id) photoMap.set(p.id, p);
  }
  const mergedPhotos = Array.from(photoMap.values());

  // Session Feelings: union by workoutId
  const feelingsMap = new Map<string, SessionFeeling>();
  for (const f of (serverData.sessionFeelings || [])) {
    const fKey = f?.workoutId || (f as any)?.id;
    if (f && fKey) feelingsMap.set(fKey, f);
  }
  for (const f of (localData.sessionFeelings || [])) {
    const fKey = f?.workoutId || (f as any)?.id;
    if (f && fKey) feelingsMap.set(fKey, f);
  }
  const mergedFeelings = Array.from(feelingsMap.values());

  // Custom Exercises: union by id
  const exMap = new Map<string, any>();
  for (const e of (serverData.customExercises || [])) {
    if (e && e.id) exMap.set(e.id, e);
  }
  for (const e of (localData.customExercises || [])) {
    if (e && e.id) exMap.set(e.id, e);
  }
  const mergedExercises = Array.from(exMap.values());

  // Gyms: merge by id or name, preserving latest edits
  const gymMap = new Map<string, Gym>();
  for (const g of (serverData.gyms || [])) {
    if (g && g.id) gymMap.set(g.id, g);
  }
  for (const g of (localData.gyms || [])) {
    if (g && g.id) {
      const existing = gymMap.get(g.id);
      if (!existing || (g.updatedAt && (!existing.updatedAt || g.updatedAt >= existing.updatedAt))) {
        gymMap.set(g.id, g);
      }
    }
  }
  const mergedGyms = Array.from(gymMap.values());

  const nextRevision = Math.max(serverData.revision || 0, localRevision) + 1;

  const finalPayload: SyncStorePayload = {
    workouts: mergedWorkouts,
    matrixPlans: mergedMatrixPlans,
    bodyCompRecords: mergedBodyComp,
    userProfile: mergedUserProfile,
    healthMetrics: mergedHealthMetrics,
    supplements: mergedSupplements,
    supplementCategories: mergedCategories,
    progressPhotos: mergedPhotos,
    sessionFeelings: mergedFeelings,
    programs: mergedPrograms,
    activeProgramId: mergedActiveProgramId,
    completedDaysRecord: mergedCompletedDays,
    customExercises: mergedExercises,
    gyms: mergedGyms,
    tombstones: mergedTombstones,
    updatedAt: new Date().toISOString(),
    deviceId,
    revision: nextRevision
  };

  const mergedData: LocalSyncSnapshot = {
    workouts: mergedWorkouts,
    matrixPlans: mergedMatrixPlans,
    bodyCompRecords: mergedBodyComp,
    userProfile: mergedUserProfile,
    healthMetrics: mergedHealthMetrics,
    supplements: mergedSupplements,
    supplementCategories: mergedCategories,
    progressPhotos: mergedPhotos,
    sessionFeelings: mergedFeelings,
    programs: mergedPrograms,
    activeProgramId: mergedActiveProgramId,
    completedDaysRecord: mergedCompletedDays,
    customExercises: mergedExercises,
    gyms: mergedGyms
  };

  return {
    finalPayload,
    mergedData,
    mergedTombstones
  };
}

/**
 * Executes an atomic Firestore transaction that reads the latest server document,
 * applies mergeLocalWithServerDocument, and writes the combined result back.
 * If another client wrote in between, Firestore automatically retries the transaction.
 */
export async function executeTransactionalSync(
  db: any,
  uid: string,
  docFn: any,
  runTransactionFn: any,
  localData: LocalSyncSnapshot,
  localTombstones: TombstoneStore,
  deviceId: string,
  localRevision: number
): Promise<{
  finalPayload: SyncStorePayload;
  mergedData: LocalSyncSnapshot;
  mergedTombstones: TombstoneStore;
}> {
  const docRef = docFn(db, "users", uid, "data", "fitnessStore");

  return await runTransactionFn(db, async (transaction: any) => {
    const serverSnap = await transaction.get(docRef);
    const serverData = serverSnap.exists() ? (serverSnap.data() as SyncStorePayload) : null;

    const { finalPayload, mergedData, mergedTombstones } = mergeLocalWithServerDocument(
      serverData,
      localData,
      localTombstones,
      deviceId,
      localRevision
    );

    const cleanPayload = sanitizeForFirestore(finalPayload);
    transaction.set(docRef, cleanPayload);
    return { finalPayload, mergedData, mergedTombstones };
  });
}
