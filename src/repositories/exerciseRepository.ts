import { idbGet, idbSet, idbGetByPrefix } from "../utils/idbStorage";
import { db, doc, setDoc, getDocs, collection } from "../lib/firebase";
import { sanitizeForFirestore } from "../utils/firestoreSync";
import { firestoreTracker } from "../utils/firestoreInstrumentation";
import { isFirestoreQuotaCooldownActive } from "../utils/syncManager";

export interface CustomExerciseItem {
  id: string;
  name: string;
  targetMuscle: string;
  category: string;
  equipment?: string;
  notes?: string;
  isCustom: boolean;
  updatedAt?: string;
  deletedAt?: string;
}

export class ExerciseRepository {
  private getLocalKey(uid: string, exerciseId: string): string {
    const safeUid = uid || "guest";
    return `pulse_${safeUid}_exercise_${exerciseId}`;
  }

  async getAllLocalExercises(uid: string): Promise<CustomExerciseItem[]> {
    const safeUid = uid || "guest";
    const prefix = `pulse_${safeUid}_exercise_`;
    const records = await idbGetByPrefix<CustomExerciseItem>(prefix);

    if (records.length === 0) {
      // Check legacy storage
      try {
        if (typeof localStorage !== "undefined") {
          const raw = localStorage.getItem("pulse_custom_exercises");
          if (raw) {
            const arr = JSON.parse(raw);
            if (Array.isArray(arr)) {
              for (const ex of arr) {
                const exId = ex.id || `ex_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
                await this.saveLocalOnly(safeUid, { ...ex, id: exId, isCustom: true });
              }
              return arr;
            }
          }
        }
      } catch {}
    }

    return records.map((r) => r.value).filter((e) => !e.deletedAt);
  }

  async saveLocalOnly(uid: string, exercise: CustomExerciseItem): Promise<void> {
    const key = this.getLocalKey(uid, exercise.id);
    await idbSet(key, exercise);
  }

  async saveExercise(
    uid: string,
    exercise: CustomExerciseItem,
    options: { skipCloud?: boolean } = {}
  ): Promise<{ success: boolean; cloudWritten: boolean }> {
    const normalized: CustomExerciseItem = {
      ...exercise,
      isCustom: true,
      updatedAt: new Date().toISOString()
    };

    await this.saveLocalOnly(uid, normalized);

    if (options.skipCloud || !uid || uid === "guest" || !navigator.onLine || isFirestoreQuotaCooldownActive()) {
      return { success: true, cloudWritten: false };
    }

    try {
      const docRef = doc(db, "users", uid, "customExercises", exercise.id);
      await setDoc(docRef, sanitizeForFirestore(normalized), { merge: true });
      firestoreTracker.recordWrite(1, `Exercise commit: ${exercise.name}`);
      return { success: true, cloudWritten: true };
    } catch {
      return { success: true, cloudWritten: false };
    }
  }

  async fetchRemoteExercises(uid: string): Promise<CustomExerciseItem[]> {
    if (!uid || uid === "guest" || !navigator.onLine || isFirestoreQuotaCooldownActive()) {
      return [];
    }
    try {
      const colRef = collection(db, "users", uid, "customExercises");
      const snap = await getDocs(colRef);
      firestoreTracker.recordRead(snap.docs.length, "Fetch remote exercises");
      const exercises: CustomExerciseItem[] = [];
      for (const d of snap.docs) {
        const data = d.data() as CustomExerciseItem;
        if (!data.deletedAt) {
          exercises.push(data);
          await this.saveLocalOnly(uid, data);
        }
      }
      return exercises;
    } catch {
      return [];
    }
  }
}

export const exerciseRepository = new ExerciseRepository();
