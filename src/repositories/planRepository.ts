import { WeeklyMatrixPlan } from "../types";
import { idbGet, idbSet, idbGetByPrefix } from "../utils/idbStorage";
import { db, doc, setDoc, getDocs, collection } from "../lib/firebase";
import { sanitizeForFirestore } from "../utils/firestoreSync";
import { firestoreTracker } from "../utils/firestoreInstrumentation";
import { isFirestoreQuotaCooldownActive } from "../utils/syncManager";

export class PlanRepository {
  private getLocalKey(uid: string, weekNumber: number): string {
    const safeUid = uid || "guest";
    return `pulse_${safeUid}_plan_week_${weekNumber}`;
  }

  async getAllLocalPlans(uid: string): Promise<WeeklyMatrixPlan[]> {
    const safeUid = uid || "guest";
    const prefix = `pulse_${safeUid}_plan_week_`;
    const records = await idbGetByPrefix<WeeklyMatrixPlan>(prefix);

    if (records.length === 0) {
      const legacyArray = await idbGet<WeeklyMatrixPlan[]>(`pulse_${safeUid}_matrix_plans`);
      if (Array.isArray(legacyArray) && legacyArray.length > 0) {
        for (const plan of legacyArray) {
          await this.saveLocalOnly(safeUid, plan);
        }
        return legacyArray;
      }
    }

    return records.map((r) => r.value).sort((a, b) => a.weekNumber - b.weekNumber);
  }

  async saveLocalOnly(uid: string, plan: WeeklyMatrixPlan): Promise<void> {
    const key = this.getLocalKey(uid, plan.weekNumber);
    await idbSet(key, plan);
  }

  async savePlan(
    uid: string,
    plan: WeeklyMatrixPlan,
    options: { skipCloud?: boolean } = {}
  ): Promise<{ success: boolean; cloudWritten: boolean }> {
    await this.saveLocalOnly(uid, plan);

    if (options.skipCloud || !uid || uid === "guest" || !navigator.onLine || isFirestoreQuotaCooldownActive()) {
      return { success: true, cloudWritten: false };
    }

    try {
      const planDocRef = doc(db, "users", uid, "plans", `week_${plan.weekNumber}`);
      await setDoc(planDocRef, sanitizeForFirestore({ ...plan, updatedAt: new Date().toISOString() }), { merge: true });
      firestoreTracker.recordWrite(1, `Plan commit: Week ${plan.weekNumber}`);
      return { success: true, cloudWritten: true };
    } catch {
      return { success: true, cloudWritten: false };
    }
  }

  async fetchRemotePlans(uid: string): Promise<WeeklyMatrixPlan[]> {
    if (!uid || uid === "guest" || !navigator.onLine || isFirestoreQuotaCooldownActive()) {
      return [];
    }
    try {
      const colRef = collection(db, "users", uid, "plans");
      const snap = await getDocs(colRef);
      firestoreTracker.recordRead(snap.docs.length, "Fetch remote plans");
      const plans: WeeklyMatrixPlan[] = [];
      for (const d of snap.docs) {
        const plan = d.data() as WeeklyMatrixPlan;
        plans.push(plan);
        await this.saveLocalOnly(uid, plan);
      }
      return plans.sort((a, b) => a.weekNumber - b.weekNumber);
    } catch {
      return [];
    }
  }
}

export const planRepository = new PlanRepository();
