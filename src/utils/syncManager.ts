import { SyncStatus, LifeOSModule, PersistentSyncState } from "./syncTypes";
import { firestoreTracker } from "./firestoreInstrumentation";

export interface SyncEngineContext {
  uid: string;
  isOnline: boolean;
  quotaCooldownUntil: number;
  localPendingRevision: number;
  lastConfirmedRevision: number;
  lastSyncedDataString: string;
  isSyncInFlight: boolean;
  isApplyingRemoteSnapshot: boolean;
}

function deeplySortKeys(obj: any): any {
  if (obj === null || typeof obj !== "object") {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(deeplySortKeys);
  }
  const sortedKeys = Object.keys(obj).sort();
  const result: Record<string, any> = {};
  for (const key of sortedKeys) {
    result[key] = deeplySortKeys(obj[key]);
  }
  return result;
}

/**
 * Computes deterministic canonical representation of LifeOS store data.
 * Used for byte-level deduplication to eliminate 95%+ of redundant Firestore writes.
 */
export function computeCanonicalDataHash(data: {
  workouts?: any[];
  matrixPlans?: any[];
  bodyCompRecords?: any[];
  userProfile?: any;
  healthMetrics?: any;
  supplements?: any[];
  supplementCategories?: any[];
  progressPhotos?: any[];
  sessionFeelings?: any[];
  programs?: any[];
  activeProgramId?: string;
  completedDaysRecord?: any;
  customExercises?: any[];
  gyms?: any[];
}): string {
  const canonicalStructure = {
    w: data.workouts || [],
    m: data.matrixPlans || [],
    b: data.bodyCompRecords || [],
    u: data.userProfile || {},
    h: data.healthMetrics || {},
    s: data.supplements || [],
    sc: data.supplementCategories || [],
    p: data.progressPhotos || [],
    sf: data.sessionFeelings || [],
    pr: data.programs || [],
    ap: data.activeProgramId || "",
    cd: data.completedDaysRecord || {},
    ce: data.customExercises || [],
    g: data.gyms || []
  };
  return JSON.stringify(deeplySortKeys(canonicalStructure));
}

/**
 * Validates whether a cloud write should be performed or deduplicated.
 * Returns { shouldSync: boolean; reason: string }
 */
export function evaluateSyncNecessity(
  currentDataString: string,
  lastSyncedDataString: string,
  context: {
    isOnline: boolean;
    quotaCooldownUntil: number;
    isSyncInFlight: boolean;
    isApplyingRemoteSnapshot: boolean;
    localPendingRevision: number;
    lastConfirmedRevision: number;
  }
): { shouldSync: boolean; reason: string; nextStatus: SyncStatus } {
  if (context.isApplyingRemoteSnapshot) {
    return {
      shouldSync: false,
      reason: "Remote hydration in progress - write back prevented",
      nextStatus: "Synced to cloud"
    };
  }

  if (!context.isOnline) {
    return {
      shouldSync: false,
      reason: "Device is offline - queued locally",
      nextStatus: "Offline, pending sync"
    };
  }

  if (context.quotaCooldownUntil > Date.now()) {
    return {
      shouldSync: false,
      reason: "Firestore daily write quota reached - backoff active",
      nextStatus: "Cloud quota reached, pending sync"
    };
  }

  if (context.isSyncInFlight) {
    return {
      shouldSync: false,
      reason: "Sync operation already in flight",
      nextStatus: "Syncing"
    };
  }

  // Exact data payload match with last confirmed cloud write
  if (currentDataString === lastSyncedDataString && lastSyncedDataString.length > 0) {
    firestoreTracker.recordDeduplicatedSaved(1);
    return {
      shouldSync: false,
      reason: "Payload matches verified cloud state (deduplicated)",
      nextStatus: "Synced to cloud"
    };
  }

  return {
    shouldSync: true,
    reason: "New uncommitted local changes detected",
    nextStatus: "Syncing"
  };
}

/**
 * Resolves one of the 6 canonical sync states
 */
export function resolveCanonicalSyncStatus(params: {
  isSyncing: boolean;
  isOnline: boolean;
  isQuotaCooldown: boolean;
  isDirty: boolean;
  isConfirmed: boolean;
  hasError: boolean;
}): SyncStatus {
  if (params.isSyncing) {
    return "Syncing";
  }
  if (params.isQuotaCooldown) {
    return "Cloud quota reached, pending sync";
  }
  if (!params.isOnline) {
    return "Offline, pending sync";
  }
  if (params.hasError) {
    return "Sync failed";
  }
  if (params.isConfirmed && !params.isDirty) {
    return "Synced to cloud";
  }
  return "Saved locally";
}

/**
 * Normalized payload builder for independent LifeOS module synchronization.
 * Supports updating isolated module sub-documents while maintaining master document.
 */
export function buildNormalizedModulePayloads(data: Record<string, any>) {
  return {
    profile: {
      userProfile: data.userProfile,
      healthMetrics: data.healthMetrics,
      updatedAt: data.updatedAt,
      revision: data.revision
    },
    programs: {
      programs: data.programs,
      activeProgramId: data.activeProgramId,
      matrixPlans: data.matrixPlans,
      updatedAt: data.updatedAt,
      revision: data.revision
    },
    workouts: {
      workouts: data.workouts,
      completedDaysRecord: data.completedDaysRecord,
      updatedAt: data.updatedAt,
      revision: data.revision
    },
    bodyComp: {
      bodyCompRecords: data.bodyCompRecords,
      progressPhotos: data.progressPhotos,
      updatedAt: data.updatedAt,
      revision: data.revision
    },
    lifestyle: {
      supplements: data.supplements,
      supplementCategories: data.supplementCategories,
      sessionFeelings: data.sessionFeelings,
      customExercises: data.customExercises,
      updatedAt: data.updatedAt,
      revision: data.revision
    }
  };
}

export const FIRESTORE_QUOTA_COOLDOWN_KEY = "pulse_firestore_quota_cooldown";

/**
 * Calculates the exact timestamp of the next Google Cloud Firestore daily quota reset.
 * Free daily write quota resets at midnight US Pacific Time (00:00 PST/PDT).
 * Includes a 5-minute safety buffer to guarantee Google Cloud counters have rolled over.
 */
export function calculateDailyQuotaResetTime(): number {
  const now = new Date();
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Los_Angeles",
      year: "numeric",
      month: "numeric",
      day: "numeric"
    });
    const parts = formatter.formatToParts(now);
    const month = parts.find((p) => p.type === "month")?.value;
    const day = parts.find((p) => p.type === "day")?.value;
    const year = parts.find((p) => p.type === "year")?.value;

    const testDate = new Date();
    const utcDate = new Date(testDate.toLocaleString("en-US", { timeZone: "UTC" }));
    const ptDate = new Date(testDate.toLocaleString("en-US", { timeZone: "America/Los_Angeles" }));
    const diffHours = (utcDate.getTime() - ptDate.getTime()) / (1000 * 60 * 60);

    const tomorrowMidnightUtc = new Date(
      Date.UTC(Number(year), Number(month) - 1, Number(day) + 1, diffHours, 5, 0)
    );
    const diffMs = tomorrowMidnightUtc.getTime() - now.getTime();

    if (diffMs > 10 * 60 * 1000 && diffMs < 25 * 60 * 60 * 1000) {
      return tomorrowMidnightUtc.getTime();
    }
  } catch (e) {
    // Fallback if Intl timezone parsing fails
  }
  // Default fallback: 4 hours from now
  return now.getTime() + 4 * 60 * 60 * 1000;
}

export function getStoredQuotaCooldown(): number {
  try {
    const val = localStorage.getItem(FIRESTORE_QUOTA_COOLDOWN_KEY);
    if (!val) return 0;
    const num = Number(val);
    if (isNaN(num) || num <= Date.now()) {
      localStorage.removeItem(FIRESTORE_QUOTA_COOLDOWN_KEY);
      return 0;
    }
    return num;
  } catch {
    return 0;
  }
}

export function setStoredQuotaCooldown(targetTimestamp: number): void {
  try {
    localStorage.setItem(FIRESTORE_QUOTA_COOLDOWN_KEY, String(targetTimestamp));
  } catch {}
}

export function clearStoredQuotaCooldown(): void {
  try {
    localStorage.removeItem(FIRESTORE_QUOTA_COOLDOWN_KEY);
  } catch {}
}

export function isFirestoreQuotaCooldownActive(): boolean {
  return getStoredQuotaCooldown() > Date.now();
}

export interface CloudSyncExecutionParams {
  uid: string;
  localSnapshot: any;
  tombstones: any;
  uploadRevision: number;
  capturedOpIds: Set<string>;
  isQuotaCooldown: boolean;
  quotaCooldownUntil: number;
  postServerSync: (
    uid: string,
    snapshot: any,
    tombstones: any,
    uploadRevision: number
  ) => Promise<{ success: boolean; finalPayload?: any; mergedData?: any; mergedTombstones?: any; error?: string }>;
  executeFirestoreSync: (
    uid: string,
    snapshot: any,
    tombstones: any,
    uploadRevision: number
  ) => Promise<{ finalPayload?: any; mergedData?: any; mergedTombstones?: any } | null>;
  getPendingOps: (uid: string) => any[];
  clearPendingOps: (uid: string) => void;
  savePendingOps: (uid: string, ops: any[]) => void;
  markConfirmed: (uid: string, rev: number) => void;
  savePersistentState: (uid: string, state: any) => void;
  recordQuotaError?: () => void;
  localPendingRevision: number;
  needsFollowUpSync: boolean;
}

export interface CloudSyncExecutionResult {
  status: SyncStatus;
  serverOk: boolean;
  fsOk: boolean;
  finalPayload?: any;
  mergedData?: any;
  mergedTombstones?: any;
  confirmedRev?: number;
  remainingPendingOps: any[];
}

export async function executeCloudSyncEngine(
  params: CloudSyncExecutionParams
): Promise<CloudSyncExecutionResult> {
  const {
    uid,
    localSnapshot,
    tombstones,
    uploadRevision,
    capturedOpIds,
    isQuotaCooldown,
    quotaCooldownUntil,
    postServerSync,
    executeFirestoreSync,
    getPendingOps,
    clearPendingOps,
    savePendingOps,
    markConfirmed,
    savePersistentState,
    recordQuotaError,
    localPendingRevision,
    needsFollowUpSync
  } = params;

  // 1. Attempt Full-Stack Server Write
  let serverResult: any = null;
  let serverOk = false;
  try {
    serverResult = await postServerSync(uid, localSnapshot, tombstones, uploadRevision);
    if (serverResult && serverResult.success !== false && (serverResult.finalPayload || serverResult.mergedData)) {
      serverOk = true;
    }
  } catch (sErr) {
    serverOk = false;
  }

  // 2. Attempt Firestore Write
  let fsResult: any = null;
  let fsOk = false;
  if (!isQuotaCooldown && quotaCooldownUntil <= Date.now()) {
    try {
      fsResult = await executeFirestoreSync(uid, localSnapshot, tombstones, uploadRevision);
      if (fsResult && (fsResult.finalPayload || fsResult.mergedData)) {
        fsOk = true;
      }
    } catch (fsErr: any) {
      fsOk = false;
      if (recordQuotaError && (fsErr?.code === "resource-exhausted" || fsErr?.message?.includes("Quota"))) {
        recordQuotaError();
      }
    }
  }

  const currentPending = getPendingOps(uid);

  // Evaluate outcomes
  if (serverOk && fsOk) {
    // --- BOTH SUCCEEDED ---
    const finalPayload = fsResult?.finalPayload || serverResult?.finalPayload;
    const mergedData = fsResult?.mergedData || serverResult?.mergedData || localSnapshot;
    const mergedTombstones = fsResult?.mergedTombstones || serverResult?.mergedTombstones || tombstones;

    const confirmedRev = (finalPayload && typeof finalPayload.revision === "number")
      ? finalPayload.revision
      : (serverResult?.finalPayload?.revision ?? uploadRevision);

    // Filter pending operations: keep ops not in capturedOpIds OR with revision > uploadRevision
    const remainingPendingOps = currentPending.filter(
      (op) => !capturedOpIds.has(op.id) || op.revision > uploadRevision
    );

    if (remainingPendingOps.length === 0) {
      clearPendingOps(uid);
    } else {
      savePendingOps(uid, remainingPendingOps);
    }

    markConfirmed(uid, confirmedRev);

    const hasNewerEdits = localPendingRevision > uploadRevision || needsFollowUpSync || remainingPendingOps.length > 0;
    const status: SyncStatus = hasNewerEdits ? "Saved locally" : "Synced to cloud";

    savePersistentState(uid, {
      isDirty: hasNewerEdits,
      status,
      localRevision: Math.max(localPendingRevision, confirmedRev),
      lastConfirmedRevision: confirmedRev
    });

    return {
      status,
      serverOk: true,
      fsOk: true,
      finalPayload,
      mergedData,
      mergedTombstones,
      confirmedRev,
      remainingPendingOps
    };
  }

  if (serverOk || fsOk) {
    // --- PARTIAL SYNC ---
    const mergedData = serverOk ? serverResult?.mergedData : fsResult?.mergedData;
    const mergedTombstones = serverOk ? serverResult?.mergedTombstones : fsResult?.mergedTombstones;

    // Do NOT clear pending operations! Keep all pending operations for retry.
    const status: SyncStatus = "Partial sync";

    savePersistentState(uid, {
      isDirty: true,
      status,
      lastError: serverOk ? "Firestore write failed" : "Server write failed"
    });

    return {
      status,
      serverOk,
      fsOk,
      mergedData,
      mergedTombstones,
      remainingPendingOps: currentPending
    };
  }

  // --- BOTH FAILED ---
  // Do NOT clear pending operations! Keep all pending operations for retry.
  const status: SyncStatus = "Cloud sync failed. Changes are waiting to retry.";

  savePersistentState(uid, {
    isDirty: true,
    status,
    lastError: serverResult?.error || "Both remote sync writes failed"
  });

  return {
    status,
    serverOk: false,
    fsOk: false,
    remainingPendingOps: currentPending
  };
}
