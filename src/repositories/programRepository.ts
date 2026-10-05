import { TrainingProgram } from "../types";
import { idbGet, idbSet, idbGetByPrefix } from "../utils/idbStorage";
import { db, doc, setDoc, getDocs, collection } from "../lib/firebase";
import { sanitizeForFirestore } from "../utils/firestoreSync";
import { firestoreTracker } from "../utils/firestoreInstrumentation";
import { isFirestoreQuotaCooldownActive } from "../utils/syncManager";

export class ProgramRepository {
  private getLocalKey(uid: string, programId: string): string {
    const safeUid = uid || "guest";
    return `pulse_${safeUid}_program_${programId}`;
  }

  async getAllLocalPrograms(uid: string): Promise<TrainingProgram[]> {
    const safeUid = uid || "guest";
    const prefix = `pulse_${safeUid}_program_`;
    const records = await idbGetByPrefix<TrainingProgram>(prefix);

    if (records.length === 0) {
      const legacyArray = await idbGet<TrainingProgram[]>(`pulse_${safeUid}_training_programs`);
      if (Array.isArray(legacyArray) && legacyArray.length > 0) {
        for (const prog of legacyArray) {
          await this.saveLocalOnly(safeUid, prog);
        }
        return legacyArray.filter((p) => !p.deletedAt);
      }
    }

    return records.map((r) => r.value).filter((p) => !p.deletedAt);
  }

  async saveLocalOnly(uid: string, program: TrainingProgram): Promise<void> {
    const key = this.getLocalKey(uid, program.id);
    await idbSet(key, program);
  }

  async saveProgram(
    uid: string,
    program: TrainingProgram,
    options: { skipCloud?: boolean } = {}
  ): Promise<{ success: boolean; cloudWritten: boolean }> {
    const nowIso = new Date().toISOString();
    const normalized: TrainingProgram = {
      ...program,
      updatedAt: nowIso
    };

    await this.saveLocalOnly(uid, normalized);

    if (options.skipCloud || !uid || uid === "guest" || !navigator.onLine || isFirestoreQuotaCooldownActive()) {
      return { success: true, cloudWritten: false };
    }

    try {
      const progDocRef = doc(db, "users", uid, "programs", program.id);
      await setDoc(progDocRef, sanitizeForFirestore(normalized), { merge: true });
      firestoreTracker.recordWrite(1, `Program commit: ${program.name}`);
      return { success: true, cloudWritten: true };
    } catch {
      return { success: true, cloudWritten: false };
    }
  }

  async deleteProgram(uid: string, programId: string): Promise<void> {
    const key = this.getLocalKey(uid, programId);
    const existing = await idbGet<TrainingProgram>(key);
    const nowIso = new Date().toISOString();

    const tombstoned: TrainingProgram = {
      ...(existing || {
        id: programId,
        name: "Deleted Program",
        goal: "strength",
        description: "",
        primaryObjective: "",
        splitDaysPerWeek: 3,
        durationWeeks: 4,
        matrixPlans: []
      }),
      deletedAt: nowIso,
      updatedAt: nowIso
    };

    await idbSet(key, tombstoned);

    if (uid && uid !== "guest" && navigator.onLine && !isFirestoreQuotaCooldownActive()) {
      try {
        const progDocRef = doc(db, "users", uid, "programs", programId);
        await setDoc(progDocRef, sanitizeForFirestore({ deletedAt: nowIso, updatedAt: nowIso }), { merge: true });
        firestoreTracker.recordWrite(1, `Tombstone program: ${programId}`);
      } catch {}
    }
  }

  async fetchRemotePrograms(uid: string): Promise<TrainingProgram[]> {
    if (!uid || uid === "guest" || !navigator.onLine || isFirestoreQuotaCooldownActive()) {
      return [];
    }
    try {
      const colRef = collection(db, "users", uid, "programs");
      const snap = await getDocs(colRef);
      firestoreTracker.recordRead(snap.docs.length, "Fetch remote programs");
      const programs: TrainingProgram[] = [];
      for (const d of snap.docs) {
        const data = d.data() as TrainingProgram;
        if (!data.deletedAt) {
          programs.push(data);
          await this.saveLocalOnly(uid, data);
        }
      }
      return programs;
    } catch {
      return [];
    }
  }
}

export const programRepository = new ProgramRepository();
