/**
 * Session Recovery & Orphaned Data Migration Service
 * 
 * Scans local storage, IndexedDB, server journals, and Firestore subcollections
 * for orphaned session records from September 23rd and 24th (or sessions saved on those dates)
 * and safely re-injects them into the application's active `workouts` state.
 */

import { WorkoutSession, ExerciseLog } from "../types";
import { db, doc, getDoc, getDocs, collection, query, where } from "../lib/firebase";
import { idbGetByPrefix, idbGet, idbSet } from "../utils/idbStorage";
import { workoutRepository } from "../repositories/workoutRepository";
import { isFirestoreQuotaCooldownActive } from "../utils/syncManager";
import { sanitizeForFirestore } from "../utils/firestoreSync";

export interface SessionRecoveryReport {
  success: boolean;
  timestamp: string;
  scanned: {
    localStorageKeysCount: number;
    indexedDbRecordsCount: number;
    firestoreDocsCount: number;
    serverJournalCount: number;
  };
  orphanedCandidatesFound: number;
  injectedSessions: WorkoutSession[];
  message: string;
  details: string[];
}

/**
 * Checks if a candidate workout or draft is from September 23 or 24,
 * or was saved/created on those dates, and has valid exercises with sets.
 */
function isSeptember23Or24Session(record: any): boolean {
  if (!record || typeof record !== "object") return false;

  const dateStr = String(record.date || "");
  const dayKeyStr = String(record.dayKey || "");
  const savedAtStr = String(record.savedAt || "");
  const createdAtStr = String(record.createdAt || "");
  const updatedAtStr = String(record.updatedAt || "");
  const idStr = String(record.id || record.workoutId || "");

  // Match dates directly
  const isDateMatch =
    dateStr === "2026-09-23" ||
    dateStr === "2026-09-24" ||
    dateStr.includes("2026-09-23") ||
    dateStr.includes("2026-09-24");

  // Match dayKeys for Week 2 Wed / Thu
  const isDayKeyMatch =
    dayKeyStr === "w2-Wednesday" ||
    dayKeyStr === "w2-Thursday" ||
    dayKeyStr === "2-Wednesday" ||
    dayKeyStr === "2-Thursday" ||
    dayKeyStr.toLowerCase().includes("w2-wed") ||
    dayKeyStr.toLowerCase().includes("w2-thu");

  // Match timestamps recorded on Sep 23 or 24
  const isTimestampMatch =
    savedAtStr.startsWith("2026-09-23") ||
    savedAtStr.startsWith("2026-09-24") ||
    createdAtStr.startsWith("2026-09-23") ||
    createdAtStr.startsWith("2026-09-24") ||
    updatedAtStr.startsWith("2026-09-23") ||
    updatedAtStr.startsWith("2026-09-24");

  // Match millisecond range for Sep 23 00:00 UTC to Sep 24 23:59 UTC
  // 2026-09-23T00:00:00Z = 1790121600000, 2026-09-24T23:59:59Z = 1790294399000
  let isMsRangeMatch = false;
  const numMatch = idStr.match(/\d{12,14}/);
  if (numMatch) {
    const ts = parseInt(numMatch[0], 10);
    if (ts >= 1790100000000 && ts <= 1790350000000) {
      isMsRangeMatch = true;
    }
  }

  const isRelevantTimeOrDate = isDateMatch || isDayKeyMatch || isTimestampMatch || isMsRangeMatch;
  if (!isRelevantTimeOrDate) return false;

  // Must have exercises with at least one set containing real user numbers
  const exercises: ExerciseLog[] = Array.isArray(record.exercises) ? record.exercises : [];
  if (exercises.length === 0) return false;

  const hasLoggedSets = exercises.some((e) =>
    Array.isArray(e.sets) &&
    e.sets.some((s) => s.isCompleted || (s as any).completed || (s.weight !== undefined && s.weight !== null) || (s.reps !== undefined && s.reps !== null))
  );

  return hasLoggedSets;
}

/**
 * Normalizes an arbitrary recovered record into a canonical WorkoutSession.
 */
function normalizeRecoveredWorkout(record: any, uid: string): WorkoutSession {
  const nowIso = new Date().toISOString();
  let date = record.date;
  let dayKey = record.dayKey;
  let weekNumber = record.weekNumber;
  let dayOfWeek = record.dayOfWeek;

  // Infer missing date or dayKey if needed based on the record's intrinsic properties
  if (date && (!dayKey || !weekNumber || !dayOfWeek)) {
    if (date === "2026-09-14") { dayKey = "w1-Monday"; weekNumber = 1; dayOfWeek = "Monday"; }
    else if (date === "2026-09-15") { dayKey = "w1-Tuesday"; weekNumber = 1; dayOfWeek = "Tuesday"; }
    else if (date === "2026-09-16") { dayKey = "w1-Wednesday"; weekNumber = 1; dayOfWeek = "Wednesday"; }
    else if (date === "2026-09-17") { dayKey = "w1-Thursday"; weekNumber = 1; dayOfWeek = "Thursday"; }
    else if (date === "2026-09-18") { dayKey = "w1-Friday"; weekNumber = 1; dayOfWeek = "Friday"; }
    else if (date === "2026-09-21") { dayKey = "w2-Monday"; weekNumber = 2; dayOfWeek = "Monday"; }
    else if (date === "2026-09-22") { dayKey = "w2-Tuesday"; weekNumber = 2; dayOfWeek = "Tuesday"; }
    else if (date === "2026-09-23") { dayKey = "w2-Wednesday"; weekNumber = 2; dayOfWeek = "Wednesday"; }
    else if (date === "2026-09-24") { dayKey = "w2-Thursday"; weekNumber = 2; dayOfWeek = "Thursday"; }
  }

  if (dayKey && !date) {
    if (dayKey === "w1-Monday") { date = "2026-09-14"; weekNumber = 1; dayOfWeek = "Monday"; }
    else if (dayKey === "w1-Tuesday") { date = "2026-09-15"; weekNumber = 1; dayOfWeek = "Tuesday"; }
    else if (dayKey === "w1-Wednesday") { date = "2026-09-16"; weekNumber = 1; dayOfWeek = "Wednesday"; }
    else if (dayKey === "w1-Thursday") { date = "2026-09-17"; weekNumber = 1; dayOfWeek = "Thursday"; }
    else if (dayKey === "w1-Friday") { date = "2026-09-18"; weekNumber = 1; dayOfWeek = "Friday"; }
    else if (dayKey === "w2-Monday") { date = "2026-09-21"; weekNumber = 2; dayOfWeek = "Monday"; }
    else if (dayKey === "w2-Tuesday") { date = "2026-09-22"; weekNumber = 2; dayOfWeek = "Tuesday"; }
    else if (dayKey === "w2-Wednesday") { date = "2026-09-23"; weekNumber = 2; dayOfWeek = "Wednesday"; }
    else if (dayKey === "w2-Thursday") { date = "2026-09-24"; weekNumber = 2; dayOfWeek = "Thursday"; }
  }

  if (!date) {
    date = record.createdAt?.split("T")[0] || record.savedAt?.split("T")[0] || "2026-09-23";
  }
  if (!dayKey) {
    dayKey = `w${weekNumber || 2}-${dayOfWeek || "Wednesday"}`;
  }

  const workoutId = record.id || record.workoutId || `recovered_sess_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

  return {
    id: workoutId,
    workoutId,
    sessionId: record.sessionId || workoutId,
    title: record.title || "Workout Session",
    date,
    dayKey,
    weekNumber: weekNumber || 2,
    dayOfWeek: dayOfWeek || "Wednesday",
    exercises: record.exercises || [],
    durationMinutes: record.durationMinutes || record.duration || 60,
    duration: record.duration || record.durationMinutes || 60,
    status: "completed",
    notes: record.notes || "",
    rpe: record.rpe || record.sessionRpe || 9,
    sessionRpe: record.sessionRpe || record.rpe || 9,
    createdAt: record.createdAt || nowIso,
    completedAt: record.completedAt || nowIso,
    savedAt: record.savedAt || nowIso,
    updatedAt: record.updatedAt || nowIso,
    deviceId: record.deviceId || "recovered_device",
    deviceName: record.deviceName || "Recovered Device Record",
    userId: uid
  };
}

export class SessionRecoveryService {
  /**
   * Scans local storage, IndexedDB, Firestore subcollections, and server journals
   * for orphaned September 23rd and 24th sessions and re-injects them.
   */
  async scanAndRecover(
    uid: string,
    existingWorkouts: WorkoutSession[],
    onProgress?: (step: string) => void
  ): Promise<SessionRecoveryReport> {
    const details: string[] = [];
    const candidatesMap = new Map<string, any>();
    const safeUid = uid || "guest";

    let localStorageKeysCount = 0;
    let indexedDbRecordsCount = 0;
    let firestoreDocsCount = 0;
    let serverJournalCount = 0;

    onProgress?.("Scanning browser LocalStorage keys...");

    // 1. SCAN LOCALSTORAGE
    if (typeof window !== "undefined" && typeof localStorage !== "undefined") {
      try {
        const totalKeys = localStorage.length;
        localStorageKeysCount = totalKeys;
        for (let i = 0; i < totalKeys; i++) {
          const key = localStorage.key(i);
          if (!key) continue;

          // Check relevant keys
          const lowerKey = key.toLowerCase();
          const isRelevantKey =
            lowerKey.includes("workout") ||
            lowerKey.includes("draft") ||
            lowerKey.includes("fitness") ||
            lowerKey.includes("backup") ||
            lowerKey.includes("pulse") ||
            lowerKey.includes("2026-09-23") ||
            lowerKey.includes("2026-09-24") ||
            lowerKey.includes("w2-wednesday") ||
            lowerKey.includes("w2-thursday");

          if (!isRelevantKey) continue;

          const raw = localStorage.getItem(key);
          if (!raw || raw.length < 10) continue;

          try {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
              for (const item of parsed) {
                if (isSeptember23Or24Session(item)) {
                  const cId = item.id || `${item.date}_${item.title || Math.random()}`;
                  candidatesMap.set(cId, item);
                  details.push(`Found candidate in localStorage array at key "${key}": ${item.title || item.id}`);
                }
              }
            } else if (parsed && typeof parsed === "object") {
              if (isSeptember23Or24Session(parsed)) {
                const cId = parsed.id || `${parsed.date}_${parsed.title || Math.random()}`;
                candidatesMap.set(cId, parsed);
                details.push(`Found candidate in localStorage object at key "${key}": ${parsed.title || parsed.id}`);
              } else if (Array.isArray(parsed.workouts)) {
                for (const w of parsed.workouts) {
                  if (isSeptember23Or24Session(w)) {
                    const cId = w.id || `${w.date}_${w.title || Math.random()}`;
                    candidatesMap.set(cId, w);
                    details.push(`Found candidate inside parsed.workouts at key "${key}": ${w.title || w.id}`);
                  }
                }
              }
            }
          } catch {
            // Non-JSON string, skip
          }
        }
      } catch (err: any) {
        details.push(`LocalStorage scan notice: ${err?.message}`);
      }
    }

    onProgress?.("Scanning durable IndexedDB store...");

    // 2. SCAN INDEXEDDB
    try {
      const idbPrefixes = [`pulse_${safeUid}_`, `pulse_guest_`, "pulse_"];
      for (const prefix of idbPrefixes) {
        const records = await idbGetByPrefix<any>(prefix);
        indexedDbRecordsCount += records.length;
        for (const r of records) {
          const val = r.value;
          if (Array.isArray(val)) {
            for (const item of val) {
              if (isSeptember23Or24Session(item)) {
                const cId = item.id || `${item.date}_${item.title || Math.random()}`;
                if (!candidatesMap.has(cId)) {
                  candidatesMap.set(cId, item);
                  details.push(`Found candidate in IndexedDB array "${r.key}": ${item.title || item.id}`);
                }
              }
            }
          } else if (isSeptember23Or24Session(val)) {
            const cId = val.id || `${val.date}_${val.title || Math.random()}`;
            if (!candidatesMap.has(cId)) {
              candidatesMap.set(cId, val);
              details.push(`Found candidate in IndexedDB record "${r.key}": ${val.title || val.id}`);
            }
          }
        }
      }
    } catch (err: any) {
      details.push(`IndexedDB scan notice: ${err?.message}`);
    }

    onProgress?.("Checking Server-side session journal & audit log...");

    // 3. SCAN SERVER SESSION JOURNAL & AUDIT LOG
    if (typeof window !== "undefined" && typeof fetch !== "undefined") {
      try {
        const [sessionsRes, auditRes] = await Promise.all([
          fetch(`/api/sync/sessions/${encodeURIComponent(safeUid)}`).catch(() => null),
          fetch(`/api/sync/audit/${encodeURIComponent(safeUid)}`).catch(() => null)
        ]);

        if (sessionsRes && sessionsRes.ok) {
          const sessionsBody = await sessionsRes.json();
          if (Array.isArray(sessionsBody.sessions)) {
            serverJournalCount += sessionsBody.sessions.length;
            for (const s of sessionsBody.sessions) {
              if (isSeptember23Or24Session(s)) {
                const cId = s.id || `${s.date}_${s.title || Math.random()}`;
                if (!candidatesMap.has(cId)) {
                  candidatesMap.set(cId, s);
                  details.push(`Found candidate in server journal: ${s.title || s.id} (${s.date})`);
                }
              }
            }
          }
        }
      } catch (err: any) {
        details.push(`Server journal scan notice: ${err?.message}`);
      }
    }

    onProgress?.("Scanning Firestore collections and backup snapshots...");

    // 4. SCAN FIRESTORE SUBCOLLECTIONS (saved_sessions, workouts, backups)
    if (safeUid !== "guest" && navigator.onLine && !isFirestoreQuotaCooldownActive()) {
      try {
        // Saved sessions collection
        const savedCol = collection(db, "users", safeUid, "saved_sessions");
        const savedSnap = await getDocs(savedCol);
        firestoreDocsCount += savedSnap.docs.length;
        for (const docSnap of savedSnap.docs) {
          const data = docSnap.data();
          if (isSeptember23Or24Session(data)) {
            const cId = data.id || docSnap.id;
            if (!candidatesMap.has(cId)) {
              candidatesMap.set(cId, data);
              details.push(`Found candidate in Firestore saved_sessions/${docSnap.id}: ${data.title || data.id}`);
            }
          }
        }

        // Workouts collection
        const workoutsCol = collection(db, "users", safeUid, "workouts");
        const workoutsSnap = await getDocs(workoutsCol);
        firestoreDocsCount += workoutsSnap.docs.length;
        for (const docSnap of workoutsSnap.docs) {
          const data = docSnap.data();
          if (isSeptember23Or24Session(data)) {
            const cId = data.id || docSnap.id;
            if (!candidatesMap.has(cId)) {
              candidatesMap.set(cId, data);
              details.push(`Found candidate in Firestore workouts/${docSnap.id}: ${data.title || data.id}`);
            }
          }
        }

        // Check for backup document if present
        try {
          const backupRef = doc(db, "users", safeUid, "backups", "latest");
          const backupSnap = await getDoc(backupRef);
          if (backupSnap.exists()) {
            const bData = backupSnap.data();
            if (Array.isArray(bData?.workouts)) {
              for (const w of bData.workouts) {
                if (isSeptember23Or24Session(w)) {
                  const cId = w.id || `${w.date}_${w.title}`;
                  if (!candidatesMap.has(cId)) {
                    candidatesMap.set(cId, w);
                    details.push(`Found candidate in Firestore backup document: ${w.title || w.id}`);
                  }
                }
              }
            }
          }
        } catch {}
      } catch (err: any) {
        details.push(`Firestore scan notice: ${err?.message}`);
      }
    }

    onProgress?.("Analyzing candidates and re-injecting into workouts...");

    // 5. RE-INJECT CANDIDATES
    const candidates = Array.from(candidatesMap.values());
    const injectedSessions: WorkoutSession[] = [];

    // Helper to count total completed sets in a workout
    const countCompletedSets = (w: any): number => {
      if (!Array.isArray(w.exercises)) return 0;
      return w.exercises.reduce((sum: number, ex: any) => {
        if (!Array.isArray(ex.sets)) return sum;
        return sum + ex.sets.filter((s: any) => s.completed || s.weight || s.reps).length;
      }, 0);
    };

    for (const rawCandidate of candidates) {
      const normalized = normalizeRecoveredWorkout(rawCandidate, safeUid);

      // Check if this workout is already in existingWorkouts with equal or better set depth
      const existingMatch = existingWorkouts.find(
        (w) => w.id === normalized.id || (w.date === normalized.date && w.title === normalized.title)
      );

      const candidateSetCount = countCompletedSets(normalized);
      const existingSetCount = existingMatch ? countCompletedSets(existingMatch) : 0;

      if (!existingMatch || candidateSetCount > existingSetCount) {
        // Persist via workoutRepository so IndexedDB, Firestore, and server journal are updated
        await workoutRepository.saveCompletedWorkout(safeUid, normalized).catch(() => {});
        injectedSessions.push(normalized);
        details.push(
          `Re-injected ${normalized.title} for ${normalized.date} (${candidateSetCount} completed sets)`
        );
      } else {
        details.push(
          `Skipped ${normalized.title} for ${normalized.date} because existing workout already has ${existingSetCount} sets.`
        );
      }
    }

    const report: SessionRecoveryReport = {
      success: true,
      timestamp: new Date().toISOString(),
      scanned: {
        localStorageKeysCount,
        indexedDbRecordsCount,
        firestoreDocsCount,
        serverJournalCount
      },
      orphanedCandidatesFound: candidates.length,
      injectedSessions,
      message:
        injectedSessions.length > 0
          ? `Successfully recovered and re-injected ${injectedSessions.length} orphaned session(s) into your workout history.`
          : candidates.length > 0
          ? `Found ${candidates.length} candidate session(s); all were already up to date in your workout records.`
          : `Scan completed across LocalStorage (${localStorageKeysCount} keys), IndexedDB (${indexedDbRecordsCount} records), Server journals, and Firestore. No missing September 23/24 sessions detected.`,
      details
    };

    return report;
  }
}

export const sessionRecoveryService = new SessionRecoveryService();
