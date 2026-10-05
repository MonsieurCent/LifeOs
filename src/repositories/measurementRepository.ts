import { BodyCompositionRecord } from "../types";
import { idbGet, idbSet, idbGetByPrefix } from "../utils/idbStorage";
import { db, doc, setDoc, getDoc, getDocs, collection } from "../lib/firebase";
import { sanitizeForFirestore, mergeBodyCompRecords } from "../utils/firestoreSync";
import { firestoreTracker } from "../utils/firestoreInstrumentation";
import { isFirestoreQuotaCooldownActive } from "../utils/syncManager";

export class MeasurementRepository {
  private getLocalKey(uid: string, measurementId: string): string {
    const safeUid = uid || "guest";
    return `pulse_${safeUid}_measurement_${measurementId}`;
  }

  private getLocalStorageKey(uid: string): string {
    const safeUid = uid || "guest";
    return `pulse_${safeUid}_body_comp_records`;
  }

  /**
   * Retrieve all local measurements across IndexedDB and LocalStorage,
   * guaranteeing no manual measurement records are dropped across reloads.
   */
  async getAllLocalMeasurements(uid: string): Promise<BodyCompositionRecord[]> {
    const safeUid = uid || "guest";
    const prefix = `pulse_${safeUid}_measurement_`;
    const records = await idbGetByPrefix<BodyCompositionRecord>(prefix);

    const fromIdb = records
      .map((r) => r.value)
      .filter((m) => m && !m.deletedAt);

    // Also check legacy IndexedDB key
    const legacyArray = await idbGet<BodyCompositionRecord[]>(`pulse_${safeUid}_body_comp`);
    const fromLegacyIdb = Array.isArray(legacyArray) ? legacyArray.filter((m) => m && !m.deletedAt) : [];

    // Also check LocalStorage scoped and unscoped
    const fromLocalStorage: BodyCompositionRecord[] = [];
    try {
      const rawScoped = localStorage.getItem(this.getLocalStorageKey(safeUid));
      if (rawScoped) {
        const parsed = JSON.parse(rawScoped);
        if (Array.isArray(parsed)) fromLocalStorage.push(...parsed.filter((m) => m && !m.deletedAt));
      }
      if (safeUid === "guest" || safeUid === "legacy") {
        const rawLegacy = localStorage.getItem("pulse_body_comp_records");
        if (rawLegacy) {
          const parsed = JSON.parse(rawLegacy);
          if (Array.isArray(parsed)) fromLocalStorage.push(...parsed.filter((m) => m && !m.deletedAt));
        }
      }
    } catch {}

    // Merge all local sources
    let merged = mergeBodyCompRecords(fromIdb, fromLegacyIdb);
    merged = mergeBodyCompRecords(merged, fromLocalStorage);

    // Ensure any missing records are backfilled into IndexedDB and LocalStorage
    for (const m of merged) {
      const mId = m.id || `meas_${m.date || Date.now()}`;
      await this.saveLocalOnly(safeUid, { ...m, id: mId });
    }

    return merged.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }

  /**
   * Persist measurement locally into IndexedDB and LocalStorage
   */
  async saveLocalOnly(uid: string, record: BodyCompositionRecord): Promise<void> {
    const safeUid = uid || "guest";
    const id = record.id || `meas_${record.date || Date.now()}`;
    const normalized = { ...record, id };

    // 1. IndexedDB entry
    const key = this.getLocalKey(safeUid, id);
    await idbSet(key, normalized);

    // 2. LocalStorage entry array sync
    try {
      const lsKey = this.getLocalStorageKey(safeUid);
      const raw = localStorage.getItem(lsKey);
      let existingList: BodyCompositionRecord[] = [];
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) existingList = parsed;
      }
      const updatedList = mergeBodyCompRecords(existingList, [normalized]);
      localStorage.setItem(lsKey, JSON.stringify(updatedList));
    } catch {}
  }

  /**
   * Save measurement to local storage and sync to Firestore
   */
  async saveMeasurement(
    uid: string,
    record: BodyCompositionRecord,
    options: { skipCloud?: boolean } = {}
  ): Promise<{ success: boolean; cloudWritten: boolean }> {
    const id = record.id || `meas_${record.date || Date.now()}`;
    const normalized: BodyCompositionRecord = {
      ...record,
      id,
      updatedAt: new Date().toISOString()
    };

    await this.saveLocalOnly(uid, normalized);

    if (options.skipCloud || !uid || uid === "guest" || !navigator.onLine || isFirestoreQuotaCooldownActive()) {
      return { success: true, cloudWritten: false };
    }

    try {
      // 1. Write individual measurement document in subcollection
      const docRef = doc(db, "users", uid, "measurements", id);
      await setDoc(docRef, sanitizeForFirestore(normalized), { merge: true });
      firestoreTracker.recordWrite(1, `Measurement commit: ${record.date}`);

      // 2. Also ensure fitnessStore master document contains this record for cross-device sync
      try {
        const masterDocRef = doc(db, "users", uid, "data", "fitnessStore");
        const masterSnap = await getDoc(masterDocRef);
        const masterData = masterSnap.exists() ? masterSnap.data() : {};
        const existingRecords: BodyCompositionRecord[] = Array.isArray(masterData.bodyCompRecords)
          ? masterData.bodyCompRecords
          : [];
        const mergedMaster = mergeBodyCompRecords(existingRecords, [normalized]);
        await setDoc(masterDocRef, { bodyCompRecords: sanitizeForFirestore(mergedMaster), updatedAt: new Date().toISOString() }, { merge: true });
        firestoreTracker.recordWrite(1, "FitnessStore measurement update");
      } catch (masterErr) {
        console.warn("Notice updating master fitnessStore bodyCompRecords:", masterErr);
      }

      return { success: true, cloudWritten: true };
    } catch {
      return { success: true, cloudWritten: false };
    }
  }

  async deleteMeasurement(uid: string, measurementId: string): Promise<void> {
    const safeUid = uid || "guest";
    const key = this.getLocalKey(safeUid, measurementId);
    const existing = await idbGet<BodyCompositionRecord>(key);
    const nowIso = new Date().toISOString();

    const tombstoned: BodyCompositionRecord = {
      ...(existing || { id: measurementId, date: nowIso.split("T")[0], weightKg: 0 }),
      id: measurementId,
      deletedAt: nowIso,
      updatedAt: nowIso
    };

    await idbSet(key, tombstoned);

    // Update LocalStorage
    try {
      const lsKey = this.getLocalStorageKey(safeUid);
      const raw = localStorage.getItem(lsKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          const filtered = parsed.filter((m: any) => m.id !== measurementId);
          localStorage.setItem(lsKey, JSON.stringify(filtered));
        }
      }
    } catch {}

    if (uid && uid !== "guest" && navigator.onLine && !isFirestoreQuotaCooldownActive()) {
      try {
        const docRef = doc(db, "users", uid, "measurements", measurementId);
        await setDoc(docRef, sanitizeForFirestore({ deletedAt: nowIso, updatedAt: nowIso }), { merge: true });
        firestoreTracker.recordWrite(1, `Tombstone measurement: ${measurementId}`);

        // Also remove from master fitnessStore
        try {
          const masterDocRef = doc(db, "users", uid, "data", "fitnessStore");
          const masterSnap = await getDoc(masterDocRef);
          if (masterSnap.exists()) {
            const masterData = masterSnap.data();
            const existingRecords: BodyCompositionRecord[] = Array.isArray(masterData.bodyCompRecords)
              ? masterData.bodyCompRecords
              : [];
            const filteredMaster = existingRecords.filter((m) => m.id !== measurementId);
            await setDoc(masterDocRef, { bodyCompRecords: sanitizeForFirestore(filteredMaster), updatedAt: nowIso }, { merge: true });
          }
        } catch {}
      } catch {}
    }
  }

  async fetchRemoteMeasurements(uid: string): Promise<BodyCompositionRecord[]> {
    if (!uid || uid === "guest" || !navigator.onLine || isFirestoreQuotaCooldownActive()) {
      return [];
    }
    try {
      const measurements: BodyCompositionRecord[] = [];

      // 1. Fetch from subcollection
      try {
        const colRef = collection(db, "users", uid, "measurements");
        const snap = await getDocs(colRef);
        firestoreTracker.recordRead(snap.docs.length, "Fetch remote measurements");
        for (const d of snap.docs) {
          const data = d.data() as BodyCompositionRecord;
          if (!data.deletedAt) {
            measurements.push(data);
          }
        }
      } catch (subColErr) {
        console.warn("Notice fetching measurements subcollection:", subColErr);
      }

      // 2. Fetch from fitnessStore document bodyCompRecords
      try {
        const masterDocRef = doc(db, "users", uid, "data", "fitnessStore");
        const masterSnap = await getDoc(masterDocRef);
        if (masterSnap.exists()) {
          const masterData = masterSnap.data();
          if (Array.isArray(masterData.bodyCompRecords)) {
            for (const rec of masterData.bodyCompRecords) {
              if (rec && !rec.deletedAt) {
                measurements.push(rec);
              }
            }
          }
        }
      } catch (masterErr) {
        console.warn("Notice fetching fitnessStore bodyCompRecords:", masterErr);
      }

      // Merge and save all local
      const merged = mergeBodyCompRecords([], measurements);
      for (const m of merged) {
        await this.saveLocalOnly(uid, m);
      }

      return merged.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    } catch {
      return [];
    }
  }
}

export const measurementRepository = new MeasurementRepository();
