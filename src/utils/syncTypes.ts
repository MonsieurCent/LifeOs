/**
 * Unified Sync Architecture Types for LifeOS
 */

export type SyncStatus =
  | "Saved locally"
  | "Saved locally, pending cloud sync"
  | "Syncing"
  | "Synced to cloud"
  | "Cloud Synced (Anon)"
  | "Cloud Synced (Firebase)"
  | "Offline mode"
  | "Offline, pending sync"
  | "Cloud quota reached, pending sync"
  | "Sync failed"
  | "Partial sync"
  | "Cloud sync failed. Changes are waiting to retry.";

export type LifeOSModule =
  | "workouts"
  | "programs"
  | "matrixPlans"
  | "profile"
  | "healthMetrics"
  | "bodyComp"
  | "supplements"
  | "sessionFeelings"
  | "customExercises";

export interface SyncOperationRecord {
  id: string;
  module: LifeOSModule | "all";
  revision: number;
  timestamp: string;
  retryCount: number;
  lastAttemptAt?: string;
  errorMessage?: string;
}

export interface PersistentSyncState {
  status: SyncStatus;
  isDirty: boolean;
  localRevision: number;
  lastConfirmedRevision: number;
  lastSyncedTimestamp?: string;
  dirtyModules: LifeOSModule[];
  quotaCooldownUntil?: number;
  lastError?: string;
}

export interface ActionFirestoreMetric {
  actionName: string;
  reads: number;
  writes: number;
  notes: string;
}

export interface FirestoreUsageMetrics {
  sessionStartTime: string;
  totalReads: number;
  totalWrites: number;
  deduplicatedWritesSaved: number;
  quotaErrorsCaught: number;
  quotaErrorsPrevented?: number;
  activeStatus: SyncStatus;
  commonActionEstimates: ActionFirestoreMetric[];
}
