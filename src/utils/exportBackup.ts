/**
 * Backup and Export Utility
 * 
 * IMPORTANT: This exports local browser data only.
 * It is NOT a cloud backup or remote data recovery service.
 * Ensures all surviving local records, drafts, and pending operations are verifiable
 * with source UID, device ID, timestamp, and revision metadata.
 */

import { getDeviceId } from "./firestoreSync";

export interface LifeOSBackupPayload {
  metadata: {
    app: "LifeOS/PULSE";
    version: string;
    exportedAt: string;
    sourceUid: string;
    deviceId: string;
    origin: "local_browser_storage";
    description: "Exported local browser data only (not a cloud backup or data recovery service)";
    revision: number;
  };
  data: {
    workouts: any[];
    programs: any[];
    matrixPlans: any[];
    activeProgramId: string | null;
    bodyCompRecords: any[];
    userProfile: any | null;
    healthMetrics: any | null;
    completedDaysRecord: Record<string, boolean>;
    workoutDrafts: Record<string, any>;
    tombstones: Record<string, any>;
    pendingOperations: any[];
    rawLocalStorageKeys: Record<string, any>;
  };
}

export function generateCompleteBackup(userId?: string): LifeOSBackupPayload {
  const safeUserId = userId && userId.trim().length > 0 ? userId.trim() : "guest";
  const now = new Date().toISOString();

  const getParsed = (key: string, fallback: any = null) => {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      return JSON.parse(raw);
    } catch {
      return fallback;
    }
  };

  // Helper to get UID-scoped or legacy key
  const getScopedOrLegacy = (baseKey: string, fallback: any = null) => {
    const scopedVal = getParsed(`pulse_${safeUserId}_${baseKey}`, null);
    if (scopedVal !== null) return scopedVal;
    return getParsed(`pulse_${baseKey}`, fallback);
  };

  // Collect all relevant keys from localStorage for zero data loss guarantee
  const rawLocalStorageKeys: Record<string, any> = {};
  const drafts: Record<string, any> = {};

  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith("pulse_")) {
        try {
          const val = localStorage.getItem(key);
          if (val) {
            rawLocalStorageKeys[key] = JSON.parse(val);
          }
        } catch {
          rawLocalStorageKeys[key] = localStorage.getItem(key);
        }
        if (key.includes("draft")) {
          drafts[key] = rawLocalStorageKeys[key];
        }
      }
    }
  } catch (e) {
    console.warn("Error scanning localStorage for backup:", e);
  }

  const backup: LifeOSBackupPayload = {
    metadata: {
      app: "LifeOS/PULSE",
      version: "3.3.0",
      exportedAt: now,
      sourceUid: safeUserId,
      deviceId: getDeviceId(),
      origin: "local_browser_storage",
      description: "Exported local browser data only (not a cloud backup or data recovery service)",
      revision: Date.now()
    },
    data: {
      workouts: getScopedOrLegacy("fitness_workouts", []),
      programs: getScopedOrLegacy("training_programs", []),
      matrixPlans: getScopedOrLegacy("matrix_plans", []),
      activeProgramId:
        localStorage.getItem(`pulse_${safeUserId}_active_program_id`) ||
        localStorage.getItem("pulse_active_program_id") ||
        null,
      bodyCompRecords: getScopedOrLegacy("body_comp_records", []),
      userProfile: getScopedOrLegacy("user_profile", null),
      healthMetrics: getScopedOrLegacy("health_metrics", null),
      completedDaysRecord: getScopedOrLegacy("completed_days_record", {}),
      workoutDrafts: drafts,
      tombstones: getScopedOrLegacy("tombstones", {}),
      pendingOperations: getScopedOrLegacy("pending_ops", []),
      rawLocalStorageKeys
    }
  };

  return backup;
}

export function downloadBackupFile(userId?: string): void {
  const backup = generateCompleteBackup(userId);
  const jsonStr = JSON.stringify(backup, null, 2);
  const blob = new Blob([jsonStr], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const dateStr = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const safeUid = userId || "guest";
  const filename = `lifeos_local_browser_backup_${safeUid}_${dateStr}.json`;

  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function restoreBackupData(userId: string | undefined, backupData: any): { success: boolean; message: string } {
  if (!backupData || typeof backupData !== "object") {
    return { success: false, message: "Invalid backup file: not a valid JSON object." };
  }
  const safeUserId = userId && userId.trim().length > 0 ? userId.trim() : "guest";

  try {
    const data = backupData.data || backupData;

    if (data.workouts && Array.isArray(data.workouts)) {
      localStorage.setItem(`pulse_${safeUserId}_fitness_workouts`, JSON.stringify(data.workouts));
    }
    if (data.programs && Array.isArray(data.programs)) {
      localStorage.setItem(`pulse_${safeUserId}_training_programs`, JSON.stringify(data.programs));
    }
    if (data.matrixPlans && Array.isArray(data.matrixPlans)) {
      localStorage.setItem(`pulse_${safeUserId}_matrix_plans`, JSON.stringify(data.matrixPlans));
    }
    if (data.activeProgramId) {
      localStorage.setItem(`pulse_${safeUserId}_active_program_id`, data.activeProgramId);
    }
    if (data.bodyCompRecords && Array.isArray(data.bodyCompRecords)) {
      localStorage.setItem(`pulse_${safeUserId}_body_comp_records`, JSON.stringify(data.bodyCompRecords));
    }
    if (data.userProfile && typeof data.userProfile === "object") {
      localStorage.setItem(`pulse_${safeUserId}_user_profile`, JSON.stringify(data.userProfile));
    }
    if (data.healthMetrics && typeof data.healthMetrics === "object") {
      localStorage.setItem(`pulse_${safeUserId}_health_metrics`, JSON.stringify(data.healthMetrics));
    }
    if (data.completedDaysRecord && typeof data.completedDaysRecord === "object") {
      localStorage.setItem(`pulse_${safeUserId}_completed_days_record`, JSON.stringify(data.completedDaysRecord));
    }

    if (data.workoutDrafts && typeof data.workoutDrafts === "object") {
      for (const [key, draftVal] of Object.entries(data.workoutDrafts)) {
        if (draftVal) {
          localStorage.setItem(key, typeof draftVal === "string" ? draftVal : JSON.stringify(draftVal));
        }
      }
    }

    if (data.rawLocalStorageKeys && typeof data.rawLocalStorageKeys === "object") {
      for (const [key, val] of Object.entries(data.rawLocalStorageKeys)) {
        if (key.startsWith(`pulse_${safeUserId}`) && val) {
          localStorage.setItem(key, typeof val === "string" ? val : JSON.stringify(val));
        }
      }
    }

    return { success: true, message: "Backup successfully restored! Reloading application state..." };
  } catch (err: any) {
    return { success: false, message: `Failed to restore backup: ${err.message || err}` };
  }
}
