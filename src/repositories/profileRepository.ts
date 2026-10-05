import { UserProfile, SyncedHealthMetrics, SupplementEntry, ProgressPhoto, SessionFeeling } from "../types";
import { idbGet, idbSet } from "../utils/idbStorage";
import { db, doc, setDoc, getDoc } from "../lib/firebase";
import { sanitizeForFirestore } from "../utils/firestoreSync";
import { firestoreTracker } from "../utils/firestoreInstrumentation";
import { isFirestoreQuotaCooldownActive } from "../utils/syncManager";

export interface ProfileDocument {
  userProfile: UserProfile;
  healthMetrics: SyncedHealthMetrics;
  activeProgramId?: string;
  completedDaysRecord?: Record<string, boolean>;
  supplements?: SupplementEntry[];
  supplementCategories?: string[];
  progressPhotos?: ProgressPhoto[];
  sessionFeelings?: SessionFeeling[];
  updatedAt: string;
}

export class ProfileRepository {
  private getLocalKey(uid: string): string {
    const safeUid = uid || "guest";
    return `pulse_${safeUid}_profile_main`;
  }

  async getLocalProfile(uid: string): Promise<ProfileDocument | null> {
    const key = this.getLocalKey(uid);
    return await idbGet<ProfileDocument>(key);
  }

  async saveLocalOnly(uid: string, profileDoc: ProfileDocument): Promise<void> {
    const key = this.getLocalKey(uid);
    await idbSet(key, profileDoc);
  }

  async saveProfile(
    uid: string,
    profileDoc: ProfileDocument,
    options: { skipCloud?: boolean } = {}
  ): Promise<{ success: boolean; cloudWritten: boolean }> {
    const normalized: ProfileDocument = {
      ...profileDoc,
      updatedAt: new Date().toISOString()
    };

    await this.saveLocalOnly(uid, normalized);

    if (options.skipCloud || !uid || uid === "guest" || !navigator.onLine || isFirestoreQuotaCooldownActive()) {
      return { success: true, cloudWritten: false };
    }

    try {
      const docRef = doc(db, "users", uid, "profile", "main");
      await setDoc(docRef, sanitizeForFirestore(normalized), { merge: true });
      firestoreTracker.recordWrite(1, "Profile commit");
      return { success: true, cloudWritten: true };
    } catch {
      return { success: true, cloudWritten: false };
    }
  }

  async fetchRemoteProfile(uid: string): Promise<ProfileDocument | null> {
    if (!uid || uid === "guest" || !navigator.onLine || isFirestoreQuotaCooldownActive()) {
      return null;
    }
    try {
      const docRef = doc(db, "users", uid, "profile", "main");
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        firestoreTracker.recordRead(1, "Fetch remote profile");
        const data = snap.data() as ProfileDocument;
        await this.saveLocalOnly(uid, data);
        return data;
      }
      return null;
    } catch {
      return null;
    }
  }
}

export const profileRepository = new ProfileRepository();
