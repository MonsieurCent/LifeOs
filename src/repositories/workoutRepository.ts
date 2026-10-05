import { WorkoutSession } from "../types";
import { idbGet, idbSet, idbDel, idbGetByPrefix } from "../utils/idbStorage";
import { db, doc, setDoc, getDoc, getDocs, collection, query, orderBy, limit as firestoreLimit } from "../lib/firebase";
import { sanitizeForFirestore, getDeviceId, getDeviceLabel } from "../utils/firestoreSync";
import { firestoreTracker } from "../utils/firestoreInstrumentation";
import { isFirestoreQuotaCooldownActive, calculateDailyQuotaResetTime, setStoredQuotaCooldown } from "../utils/syncManager";
import { disableNetwork } from "firebase/firestore";

export interface WorkoutDraft {
  id: string;
  uid?: string;
  planKey?: string;
  planId?: string;
  programId?: string;
  weekNumber?: number;
  dayOfWeek?: string;
  dayKey?: string;
  title: string;
  date: string;
  durationMinutes: number;
  notes?: string;
  exercises: any[];
  activePlanMeta?: any;
  updatedAt: string;
}

export class WorkoutRepository {
  private getLocalKey(uid: string, workoutId: string): string {
    const safeUid = uid || "guest";
    return `pulse_${safeUid}_workout_${workoutId}`;
  }

  private getDraftKey(uid: string, draftKey: string): string {
    const safeUid = uid || "guest";
    return `pulse_${safeUid}_draft_${draftKey}`;
  }

  /**
   * Loads all active (non-tombstoned) workouts for a user from local IndexedDB authority.
   */
  async getAllLocalWorkouts(uid: string): Promise<WorkoutSession[]> {
    const safeUid = uid || "guest";
    const prefix = `pulse_${safeUid}_workout_`;
    const records = await idbGetByPrefix<WorkoutSession>(prefix);
    
    // Also check for legacy array in IndexedDB if prefix scan is empty
    if (records.length === 0) {
      const legacyArray = await idbGet<WorkoutSession[]>(`pulse_${safeUid}_fitness_workouts`);
      if (Array.isArray(legacyArray) && legacyArray.length > 0) {
        // Hydrate individual records non-destructively
        for (const w of legacyArray) {
          const wId = w.id || `sess_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
          await this.saveLocalOnly(safeUid, { ...w, id: wId });
        }
        return legacyArray.filter((w) => !w.deletedAt);
      }
    }

    const workouts = records.map((r) => r.value).filter((w) => !w.deletedAt);
    return workouts.sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
  }

  /**
   * Saves workout strictly locally in IndexedDB without cloud writes.
   */
  async saveLocalOnly(uid: string, workout: WorkoutSession): Promise<void> {
    const workoutId = workout.id;
    if (!workoutId) throw new Error("Workout must have a valid stable id");
    const key = this.getLocalKey(uid, workoutId);
    await idbSet(key, workout);
  }

  /**
   * Persists active workout draft in IndexedDB. Zero cloud writes.
   */
  async saveDraft(uid: string, draft: WorkoutDraft): Promise<void> {
    const primaryKey = draft.id || draft.planKey || "free_workout";
    const key = this.getDraftKey(uid, primaryKey);
    await idbSet(key, draft);
    if (draft.planKey && draft.planKey !== primaryKey) {
      await idbSet(this.getDraftKey(uid, draft.planKey), draft);
    }
    // Record active draft key in lightweight local storage
    try {
      if (typeof localStorage !== "undefined") {
        localStorage.setItem(`pulse_${uid}_active_draft_key`, primaryKey);
      }
    } catch {}
  }

  async getDraft(uid: string, draftKey: string): Promise<WorkoutDraft | null> {
    const key = this.getDraftKey(uid, draftKey);
    return await idbGet<WorkoutDraft>(key);
  }

  async removeDraft(uid: string, draftKey: string): Promise<void> {
    const key = this.getDraftKey(uid, draftKey);
    await idbDel(key);
    try {
      if (typeof localStorage !== "undefined") {
        const active = localStorage.getItem(`pulse_${uid}_active_draft_key`);
        if (active === draftKey) {
          localStorage.removeItem(`pulse_${uid}_active_draft_key`);
        }
      }
    } catch {}
  }

  /**
   * Saves a completed workout record:
   * 1. Updates canonical IndexedDB store.
   * 2. Removes obsolete active workout draft.
   * 3. Performs approximately ONE authoritative document write to users/{uid}/workouts/{workoutId}.
   */
  async saveCompletedWorkout(
    uid: string,
    workout: WorkoutSession,
    options: { skipCloud?: boolean } = {}
  ): Promise<{ success: boolean; cloudWritten: boolean; error?: string }> {
    const workoutId = workout.id || `sess_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const nowIso = new Date().toISOString();

    const deviceId = getDeviceId();
    const deviceName = getDeviceLabel();

    const normalizedWorkout: WorkoutSession = {
      ...workout,
      id: workoutId,
      workoutId: workoutId,
      sessionId: workout.sessionId || workoutId,
      sourcePlanId: workout.sourcePlanId || workout.planId,
      date: workout.date || nowIso.split("T")[0],
      createdAt: workout.createdAt || nowIso,
      completedAt: workout.completedAt || nowIso,
      savedAt: nowIso,
      updatedAt: nowIso,
      deviceId,
      deviceName,
      revision: (workout.revision || 0) + 1,
      status: workout.status || "completed",
      duration: workout.duration || workout.durationMinutes || 0,
      durationMinutes: workout.durationMinutes || workout.duration || 0,
      volume: workout.volume || 0,
      userId: uid
    };

    // 1. Commit to IndexedDB Authority
    await this.saveLocalOnly(uid, normalizedWorkout);

    // 2. Remove obsolete draft
    const draftKey = workout.planId ? `plan_${workout.planId}` : "free_workout";
    await this.removeDraft(uid, draftKey);
    await this.removeDraft(uid, "free_workout");

    // 3. Durably log to Server Append-Only Session Journal (Works across Device A and Device B)
    if (typeof window !== "undefined" && typeof fetch !== "undefined") {
      try {
        fetch(`/api/sync/session/${encodeURIComponent(uid)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            session: normalizedWorkout,
            deviceId,
            deviceName
          })
        }).catch(() => {});
      } catch {}
    }

    if (options.skipCloud || !uid || uid === "guest" || !navigator.onLine || isFirestoreQuotaCooldownActive()) {
      return { success: true, cloudWritten: false };
    }

    // 4. Write individual documents in Firestore: saved_sessions & workouts
    try {
      const payload = sanitizeForFirestore(normalizedWorkout);
      const sessionDocRef = doc(db, "users", uid, "saved_sessions", workoutId);
      const workoutDocRef = doc(db, "users", uid, "workouts", workoutId);
      
      let wroteAny = false;
      try {
        await setDoc(sessionDocRef, payload, { merge: true });
        wroteAny = true;
      } catch (err: any) {
        // Suppress stream assertion / transient errors gracefully
      }

      try {
        await setDoc(workoutDocRef, payload, { merge: true });
        wroteAny = true;
      } catch (err: any) {
        // Suppress stream assertion / transient errors gracefully
      }

      if (wroteAny) {
        firestoreTracker.recordWrite(1, `Session saved: ${workout.title || workoutId} [${deviceName}]`);
      }
      return { success: true, cloudWritten: wroteAny };
    } catch (err: any) {
      const msg = err?.message || String(err || "");
      const isQuota =
        err?.code === "resource-exhausted" ||
        msg.includes("resource-exhausted") ||
        msg.includes("Quota");

      if (isQuota) {
        firestoreTracker.recordQuotaError();
        const resetTime = calculateDailyQuotaResetTime();
        setStoredQuotaCooldown(resetTime);
      }
      return { success: true, cloudWritten: false, error: msg };
    }
  }

  /**
   * Soft-deletes a workout using a tombstone.
   */
  async deleteWorkout(uid: string, workoutId: string): Promise<void> {
    const key = this.getLocalKey(uid, workoutId);
    const existing = await idbGet<WorkoutSession>(key);
    const nowIso = new Date().toISOString();

    const tombstoned: WorkoutSession = {
      ...(existing || { id: workoutId, title: "Deleted Workout", date: nowIso.split("T")[0], durationMinutes: 0, exercises: [] }),
      id: workoutId,
      workoutId,
      deletedAt: nowIso,
      updatedAt: nowIso,
      revision: ((existing?.revision || 0) + 1)
    };

    // Update local tombstone
    await idbSet(key, tombstoned);

    if (uid && uid !== "guest" && navigator.onLine && !isFirestoreQuotaCooldownActive()) {
      try {
        const workoutDocRef = doc(db, "users", uid, "workouts", workoutId);
        await setDoc(workoutDocRef, sanitizeForFirestore({ deletedAt: nowIso, updatedAt: nowIso }), { merge: true });
        firestoreTracker.recordWrite(1, `Tombstone workout: ${workoutId}`);
      } catch {}
    }
  }

  /**
   * Soft-deletes multiple workouts.
   */
  async deleteWorkoutsBulk(uid: string, workoutIds: string[]): Promise<void> {
    for (const id of workoutIds) {
      await this.deleteWorkout(uid, id);
    }
  }

  /**
   * Authoritative query for workouts across Device A and Device B:
   * 1. Reads from Firestore users/{uid}/saved_sessions and workouts.
   * 2. Reads from Server-side append-only journal /api/sync/sessions/:userId.
   * 3. Merges and updates local IndexedDB store.
   */
  async fetchRemoteWorkouts(uid: string, limitCount: number = 50): Promise<WorkoutSession[]> {
    if (!uid || uid === "guest") {
      return [];
    }

    const sessionMap = new Map<string, WorkoutSession>();

    // 1. Fetch from server session journal (works regardless of Firestore quota)
    if (typeof window !== "undefined" && typeof fetch !== "undefined") {
      try {
        const res = await fetch(`/api/sync/sessions/${encodeURIComponent(uid)}`);
        if (res.ok) {
          const body = await res.json();
          if (Array.isArray(body.sessions)) {
            for (const s of body.sessions) {
              if (s && s.id && !s.deletedAt) {
                sessionMap.set(s.id, s);
              }
            }
          }
        }
      } catch {}
    }

    // 2. Fetch from Firestore saved_sessions & workouts if online and not in quota cooldown
    if (navigator.onLine && !isFirestoreQuotaCooldownActive()) {
      try {
        // Query saved_sessions collection
        const savedColRef = collection(db, "users", uid, "saved_sessions");
        const savedQ = query(savedColRef, orderBy("date", "desc"), firestoreLimit(limitCount));
        const savedSnap = await getDocs(savedQ);
        for (const d of savedSnap.docs) {
          const data = d.data() as WorkoutSession;
          if (!data.deletedAt && data.id) {
            const existing = sessionMap.get(data.id);
            if (!existing || new Date(data.savedAt || data.updatedAt || 0).getTime() >= new Date(existing.savedAt || existing.updatedAt || 0).getTime()) {
              sessionMap.set(data.id, data);
            }
          }
        }

        // Query workouts collection
        const colRef = collection(db, "users", uid, "workouts");
        const q = query(colRef, orderBy("date", "desc"), firestoreLimit(limitCount));
        const snap = await getDocs(q);
        firestoreTracker.recordRead(snap.docs.length + savedSnap.docs.length, "Fetch remote workouts & saved sessions");
        
        for (const d of snap.docs) {
          const data = d.data() as WorkoutSession;
          if (!data.deletedAt && data.id) {
            const existing = sessionMap.get(data.id);
            if (!existing || new Date(data.savedAt || data.updatedAt || 0).getTime() >= new Date(existing.savedAt || existing.updatedAt || 0).getTime()) {
              sessionMap.set(data.id, data);
            }
          }
        }
      } catch (err: any) {
        console.warn("Firestore remote workout query notice:", err?.message);
      }
    }

    const merged = Array.from(sessionMap.values()).sort(
      (a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime()
    );

    // Update local cache
    for (const s of merged) {
      await this.saveLocalOnly(uid, s);
    }

    return merged;
  }
}

export const workoutRepository = new WorkoutRepository();
