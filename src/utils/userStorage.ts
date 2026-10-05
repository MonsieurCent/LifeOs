import {
  WorkoutSession,
  WeeklyMatrixPlan,
  TrainingProgram,
  BodyCompositionRecord,
  UserProfile,
  SyncedHealthMetrics,
  SupplementEntry,
  ProgressPhoto,
  SessionFeeling,
  ExerciseReference,
  ExerciseLog,
  DayOfWeek,
  Gym,
  GymMachine
} from "../types";
import { SyncStatus, PersistentSyncState, LifeOSModule } from "./syncTypes";
import { idbSet, idbGet, idbDel } from "./idbStorage";
import { getStoredQuotaCooldown, setStoredQuotaCooldown } from "./syncManager";
import { createPreplannedPrograms, createInitialMatrixPlan, sanitizeSingleMuscleMatrix, isLegacyPplPlan, CANONICAL_PROGRAM_START_DATE } from "./fitnessData";
import { isValidDateStr, getDayOfWeekName, getWeekStartMonday, getDifferenceInDays } from "./dateUtils";

export interface WorkoutDraft {
  id: string; // e.g. "plan_w1-Monday" or "free_workout"
  uid?: string;
  planKey?: string;
  planId?: string;
  programId?: string;
  weekNumber?: number;
  dayOfWeek?: DayOfWeek;
  dayKey?: string;
  title: string;
  date: string;
  durationMinutes: number;
  notes?: string;
  exercises: ExerciseLog[];
  gymId?: string;
  gymName?: string;
  status?: "in_progress" | "planned" | "completed";
  activePlanMeta?: {
    weekNumber?: number;
    dayOfWeek?: DayOfWeek;
    planId?: string;
    programId?: string;
    dayKey?: string;
  };
  updatedAt: string;
}

export interface OperationLogEntry {
  id: string;
  timestamp: string;
  entity: string;
  action: string;
  revision?: number;
  status: "success" | "pending" | "error" | "offline";
  detail?: string;
  writeCount?: number;
}

export interface PendingSyncOperation {
  id: string;
  type:
    | "full_sync"
    | "save_workout"
    | "delete_workout"
    | "save_program"
    | "delete_program"
    | "save_body_comp"
    | "delete_body_comp";
  revision: number;
  timestamp: string;
  data?: any;
  retryCount?: number;
}

export interface TombstoneStore {
  workouts: Record<string, string>; // id -> ISO timestamp deletedAt
  programs: Record<string, string>;
  bodyComp: Record<string, string>;
}

export function getUserStorageKey(uid: string | null | undefined, key: string): string {
  const safeUid = uid && uid.trim().length > 0 ? uid.trim() : "guest";
  return `pulse_${safeUid}_${key}`;
}

export class StorageError extends Error {
  constructor(message: string, public readonly originalError?: any) {
    super(message);
    this.name = "StorageError";
  }
}

/**
 * Safely removes old pre-migration backups from localStorage to keep storage footprint minimal and prevent quota errors.
 */
export function pruneLocalBackups(): void {
  try {
    if (typeof localStorage === "undefined") return;
    const backupKeys: string[] = [];
    const len = typeof localStorage.length === "number" ? localStorage.length : 0;
    for (let i = 0; i < len; i++) {
      if (typeof localStorage.key === "function") {
        const k = localStorage.key(i);
        if (k && k.startsWith("pulse_backup_")) {
          backupKeys.push(k);
        }
      }
    }
    for (const key of backupKeys) {
      try {
        localStorage.removeItem(key);
      } catch {}
    }
  } catch (err) {
    // Ignore storage iteration errors
  }
}

// Automatically prune stale backups on module load
pruneLocalBackups();

/**
 * Safely writes an item to localStorage. Handles QuotaExceededError via storage reclamation without crashing.
 */
export function safeSetItem(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch (err: any) {
    const isQuotaError =
      err?.name === "QuotaExceededError" ||
      err?.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
      err?.code === 22 ||
      err?.code === 1014 ||
      (typeof err?.message === "string" && err.message.toLowerCase().includes("quota"));

    if (isQuotaError) {
      console.warn(`[LocalStorage] Storage quota reached for key "${key}". Running emergency storage reclamation.`);
      pruneLocalBackups();

      // If the failing key was a backup or debug payload, skip write safely
      if (key.startsWith("pulse_backup_") || key.includes("_raw_payload")) {
        return;
      }

      // Retry once after pruning backups
      try {
        localStorage.setItem(key, value);
        return;
      } catch (retryErr) {
        console.warn(`[LocalStorage] Recovery write skipped after quota reclamation for key "${key}".`);
        return;
      }
    }

    console.warn(`[LocalStorage Error] Failed to write key "${key}":`, err);
  }
}

/**
 * Safely reads an item from localStorage.
 */
export function safeGetItem(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch (err) {
    console.warn(`[LocalStorage Error] Failed to read key "${key}":`, err);
    return null;
  }
}

/**
 * Safely removes an item from localStorage.
 */
export function safeRemoveItem(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch (err) {
    console.warn(`[LocalStorage Error] Failed to remove key "${key}":`, err);
  }
}

/**
 * Creates an emergency verifiable backup of essential user records before migration.
 * Strictly excludes previous backups and heavy binary assets to prevent quota overrun.
 */
export function createLocalPreMigrationBackup(uid: string | null | undefined): string | null {
  const safeUid = uid && uid.trim().length > 0 ? uid.trim() : "guest";
  pruneLocalBackups();

  const backupKey = `pulse_backup_${safeUid}`;
  const data: Record<string, any> = {
    backupCreatedAt: new Date().toISOString(),
    sourceUid: safeUid,
    keys: {}
  };

  try {
    if (typeof localStorage === "undefined") return null;
    const len = typeof localStorage.length === "number" ? localStorage.length : 0;
    const prefix = `pulse_${safeUid}_`;

    for (let i = 0; i < len; i++) {
      if (typeof localStorage.key !== "function") continue;
      const k = localStorage.key(i);
      if (!k) continue;

      // CRITICAL: NEVER include backups or progress photos (which contain high-res base64 strings)
      if (k.startsWith("pulse_backup_") || k.includes("progress_photos") || k.includes("_raw_payload")) {
        continue;
      }

      if (k.startsWith(prefix) || (safeUid === "guest" && k.startsWith("pulse_") && !k.startsWith("pulse_backup_"))) {
        const val = localStorage.getItem(k);
        // Only backup values under 250KB to guarantee we never exhaust browser storage
        if (val && val.length < 250000) {
          data.keys[k] = val;
        }
      }
    }

    if (Object.keys(data.keys).length > 0) {
      safeSetItem(backupKey, JSON.stringify(data));
      return backupKey;
    }
    return null;
  } catch (e) {
    console.warn("Could not create local pre-migration backup:", e);
    return null;
  }
}

// ==========================================
// DRAFT MANAGEMENT
// ==========================================

export function getDraftStorageKey(uid: string | null | undefined, draftKey: string): string {
  const safeUid = uid && uid.trim().length > 0 ? uid.trim() : "guest";
  return `pulse_${safeUid}_draft_${draftKey}`;
}

export function saveWorkoutDraft(uid: string | null | undefined, draft: Partial<WorkoutDraft> & { exercises: any[] }): void {
  const primaryKey = draft.id || draft.dayKey || draft.planKey || "free_workout";
  const fullDraft: WorkoutDraft = {
    id: primaryKey,
    uid: uid || "guest",
    title: draft.title || "Workout Session",
    date: draft.date || new Date().toISOString().split("T")[0],
    durationMinutes: draft.durationMinutes || 60,
    status: draft.status || "in_progress",
    updatedAt: draft.updatedAt || new Date().toISOString(),
    exercises: draft.exercises.map((ex, idx) => ({
      id: ex.id || `ex-${idx}-${Date.now()}`,
      exerciseName: ex.exerciseName || "Exercise",
      muscleGroup: ex.muscleGroup || "Chest",
      equipmentType: ex.equipmentType,
      machineId: ex.machineId,
      notes: ex.notes,
      sets: (ex.sets || []).map((s: any, sIdx: number) => ({
        id: s.id || `set-${sIdx + 1}-${Date.now()}`,
        setNumber: s.setNumber || sIdx + 1,
        weight: typeof s.weight === "number" ? s.weight : cleanNum(s.actualWeight),
        reps: typeof s.reps === "number" ? s.reps : Math.round(s.actualReps || 10),
        rpe: s.rpe || 8,
        completed: s.completed !== undefined ? s.completed : (s.isCompleted || false),
        isCompleted: s.completed !== undefined ? s.completed : (s.isCompleted || false),
        actualWeight: typeof s.actualWeight === "number" ? s.actualWeight : (typeof s.weight === "number" ? s.weight : 0),
        actualReps: typeof s.actualReps === "number" ? s.actualReps : (typeof s.reps === "number" ? s.reps : 10),
        targetWeight: s.targetWeight,
        targetReps: s.targetReps,
        isWarmup: s.isWarmup,
        notes: s.notes
      }))
    })),
    planKey: draft.dayKey || draft.planKey,
    dayKey: draft.dayKey,
    weekNumber: draft.weekNumber,
    dayOfWeek: draft.dayOfWeek,
    programId: draft.programId,
    gymId: draft.gymId,
    notes: draft.notes
  };

  const primaryStorageKey = getDraftStorageKey(uid, primaryKey);
  safeSetItem(primaryStorageKey, JSON.stringify(fullDraft));
  idbSet(primaryStorageKey, fullDraft).catch(() => {});
  if (fullDraft.planKey && fullDraft.planKey !== primaryKey) {
    const aliasKey = getDraftStorageKey(uid, fullDraft.planKey);
    safeSetItem(aliasKey, JSON.stringify(fullDraft));
    idbSet(aliasKey, fullDraft).catch(() => {});
  }
  const activeKey = getUserStorageKey(uid, "active_draft_key");
  safeSetItem(activeKey, primaryKey);
}

function cleanNum(val: any): number {
  const n = parseFloat(val);
  return isNaN(n) ? 0 : n;
}

export const clearWorkoutDraft = removeWorkoutDraft;
export const logOperation = addOperationLog;

export function getWorkoutDraft(uid: string | null | undefined, draftKey: string): WorkoutDraft | null {
  const key = getDraftStorageKey(uid, draftKey);
  const raw = safeGetItem(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function removeWorkoutDraft(uid: string | null | undefined, draftKey: string): void {
  const key = getDraftStorageKey(uid, draftKey);
  safeRemoveItem(key);
  idbDel(key).catch(() => {});
  const activeKey = getUserStorageKey(uid, "active_draft_key");
  const currentActive = safeGetItem(activeKey);
  if (currentActive === draftKey) {
    safeRemoveItem(activeKey);
  }
}

export function getActiveDraftKey(uid: string | null | undefined): string | null {
  const activeKey = getUserStorageKey(uid, "active_draft_key");
  return safeGetItem(activeKey);
}

export function listWorkoutDrafts(uid: string | null | undefined): WorkoutDraft[] {
  const safeUid = uid && uid.trim().length > 0 ? uid.trim() : "guest";
  const prefix = `pulse_${safeUid}_draft_`;
  const drafts: WorkoutDraft[] = [];

  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(prefix)) {
        const raw = localStorage.getItem(k);
        if (raw) {
          try {
            drafts.push(JSON.parse(raw));
          } catch {}
        }
      }
    }
  } catch (e) {}

  return drafts.sort((a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime());
}

// ==========================================
// OPERATION LOGGING & AUDIT TRAIL
// ==========================================

export function addOperationLog(
  uid: string | null | undefined,
  entry: Omit<OperationLogEntry, "id" | "timestamp">
): void {
  const logKey = getUserStorageKey(uid, "op_log");
  const raw = safeGetItem(logKey);
  let list: OperationLogEntry[] = [];
  try {
    list = raw ? JSON.parse(raw) : [];
  } catch {}
  const fullEntry: OperationLogEntry = {
    ...entry,
    id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
    timestamp: new Date().toISOString()
  };
  list.unshift(fullEntry);
  if (list.length > 50) list = list.slice(0, 50); // bounded log
  safeSetItem(logKey, JSON.stringify(list));
}

export function getOperationLogs(uid: string | null | undefined): OperationLogEntry[] {
  const logKey = getUserStorageKey(uid, "op_log");
  const raw = safeGetItem(logKey);
  try {
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

// ==========================================
// GYM & EQUIPMENT REPOSITORY
// ==========================================

export const DEFAULT_GYMS: Gym[] = [
  {
    id: "gym-sats-njard",
    name: "SATS Njård",
    location: "Njårdhallen, Oslo",
    isDefault: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    machines: [
      { id: "m-lat-pd-1", gymId: "gym-sats-njard", name: "Lat Pulldown Station", category: "Back" },
      { id: "m-leg-press-1", gymId: "gym-sats-njard", name: "45° Incline Leg Press", category: "Legs" },
      { id: "m-chest-fly-1", gymId: "gym-sats-njard", name: "Pec Deck Fly", category: "Chest" },
      { id: "m-cable-crossover-1", gymId: "gym-sats-njard", name: "Dual Adjustable Pulley (Cables)", category: "Chest" },
      { id: "m-seated-row-1", gymId: "gym-sats-njard", name: "Cable Seated Row", category: "Back" },
      { id: "m-smith-1", gymId: "gym-sats-njard", name: "Smith Machine", category: "Chest" },
      { id: "m-hammer-chest-2", gymId: "gym-sats-njard", name: "Hammer Strength Iso Chest Press", category: "Chest" },
      { id: "m-hack-squat-2", gymId: "gym-sats-njard", name: "Linear Hack Squat", category: "Legs" }
    ]
  },
  {
    id: "gym-main",
    name: "Main Training Facility",
    location: "Primary Gym",
    isDefault: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    machines: [
      { id: "m-lat-pd-main", gymId: "gym-main", name: "Lat Pulldown Station", category: "Back" },
      { id: "m-leg-press-main", gymId: "gym-main", name: "45° Incline Leg Press", category: "Legs" },
      { id: "m-chest-fly-main", gymId: "gym-main", name: "Pec Deck Fly", category: "Chest" }
    ]
  },
  {
    id: "gym-secondary",
    name: "Commercial Club / SATS",
    location: "City Center",
    isDefault: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    machines: [
      { id: "m-hammer-chest-sec", gymId: "gym-secondary", name: "Hammer Strength Iso Chest Press", category: "Chest" },
      { id: "m-hack-squat-sec", gymId: "gym-secondary", name: "Linear Hack Squat", category: "Legs" }
    ]
  }
];

export function getStoredGyms(uid: string | null | undefined): Gym[] {
  const key = getUserStorageKey(uid, "gyms");
  const raw = safeGetItem(key);
  if (!raw) return DEFAULT_GYMS;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      // Ensure SATS Njård is accessible if not already in list
      const hasSatsNjard = parsed.some(
        (g: Gym) =>
          g.id === "gym-sats-njard" ||
          g.name?.toLowerCase().includes("sats njård") ||
          g.name?.toLowerCase().includes("sats njard")
      );
      if (!hasSatsNjard) {
        return [DEFAULT_GYMS[0], ...parsed];
      }
      return parsed;
    }
    return DEFAULT_GYMS;
  } catch {
    return DEFAULT_GYMS;
  }
}

export function saveStoredGyms(uid: string | null | undefined, gyms: Gym[]): void {
  const key = getUserStorageKey(uid, "gyms");
  safeSetItem(key, JSON.stringify(gyms));
  idbSet(key, gyms).catch(() => {});
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("gyms-updated", { detail: { uid, gyms } }));
  }
  addOperationLog(uid, {
    entity: "gym",
    action: "save_gyms",
    status: "success",
    detail: `Saved ${gyms.length} gym profiles`
  });
}

export function addOrUpdateGym(uid: string | null | undefined, gym: Gym): Gym[] {
  const current = getStoredGyms(uid);
  const idx = current.findIndex(
    (g) => g.id === gym.id || (gym.name && g.name.trim().toLowerCase() === gym.name.trim().toLowerCase())
  );
  let updated: Gym[];
  if (idx >= 0) {
    updated = [...current];
    updated[idx] = { ...updated[idx], ...gym, updatedAt: new Date().toISOString() };
  } else {
    updated = [...current, { ...gym, createdAt: gym.createdAt || new Date().toISOString() }];
  }
  saveStoredGyms(uid, updated);
  return updated;
}

export function addOrUpdateMachine(uid: string | null | undefined, gymId: string, machine: GymMachine): Gym[] {
  const current = getStoredGyms(uid);
  let gymIdx = current.findIndex((g) => g.id === gymId);
  if (gymIdx === -1) {
    if (current.length > 0) {
      gymIdx = 0;
    } else {
      const defaultGym: Gym = {
        id: `gym-${Date.now()}`,
        name: "Main Training Gym",
        machines: [],
        isDefault: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      current.push(defaultGym);
      gymIdx = 0;
    }
  }

  const gym = current[gymIdx];
  const machines = gym.machines ? [...gym.machines] : [];
  const mIdx = machines.findIndex((m) => m.id === machine.id);
  if (mIdx >= 0) {
    machines[mIdx] = { ...machines[mIdx], ...machine, updatedAt: new Date().toISOString() };
  } else {
    machines.push({ ...machine, createdAt: machine.createdAt || new Date().toISOString() });
  }

  const updatedGym: Gym = { ...gym, machines, updatedAt: new Date().toISOString() };
  const updatedGyms = [...current];
  updatedGyms[gymIdx] = updatedGym;
  saveStoredGyms(uid, updatedGyms);
  return updatedGyms;
}

// ==========================================
// TOMBSTONE / DELETION TRACKING
// ==========================================

export function getTombstones(uid: string | null | undefined): TombstoneStore {
  const key = getUserStorageKey(uid, "tombstones");
  const raw = safeGetItem(key);
  if (!raw) {
    return { workouts: {}, programs: {}, bodyComp: {} };
  }
  try {
    const parsed = JSON.parse(raw);
    return {
      workouts: parsed.workouts || {},
      programs: parsed.programs || {},
      bodyComp: parsed.bodyComp || {}
    };
  } catch {
    return { workouts: {}, programs: {}, bodyComp: {} };
  }
}

export function addTombstone(
  uid: string | null | undefined,
  category: "workouts" | "programs" | "bodyComp",
  id: string
): void {
  const tombstones = getTombstones(uid);
  tombstones[category][id] = new Date().toISOString();
  const key = getUserStorageKey(uid, "tombstones");
  safeSetItem(key, JSON.stringify(tombstones));
}

export function mergeTombstones(local: TombstoneStore, remote?: Partial<TombstoneStore>): TombstoneStore {
  const result: TombstoneStore = {
    workouts: { ...local.workouts },
    programs: { ...local.programs },
    bodyComp: { ...local.bodyComp }
  };

  if (!remote) return result;

  const mergeCategory = (cat: "workouts" | "programs" | "bodyComp") => {
    if (remote[cat]) {
      for (const [id, remoteDeletedAt] of Object.entries(remote[cat]!)) {
        const localDeletedAt = result[cat][id];
        if (!localDeletedAt || new Date(remoteDeletedAt).getTime() > new Date(localDeletedAt).getTime()) {
          result[cat][id] = remoteDeletedAt;
        }
      }
    }
  };

  mergeCategory("workouts");
  mergeCategory("programs");
  mergeCategory("bodyComp");

  return result;
}

export const DUMMY_UNLOGGED_WORKOUT_IDS = new Set([
  "w-01",
  "w-02",
  "w-03",
  "w-04",
  "w-05",
  "w-06",
  "workout-w1-monday-20260914"
]);

export const DUMMY_UNLOGGED_DATES = new Set<string>();

export function sanitizeUserWorkouts(rawWorkouts: WorkoutSession[]): WorkoutSession[] {
  if (!Array.isArray(rawWorkouts)) return [];
  return rawWorkouts
    .filter((w) => {
      if (!w || !w.id) return false;
      // Filter out only explicit dummy/mock fixture IDs, never filter real user workouts
      if (DUMMY_UNLOGGED_WORKOUT_IDS.has(w.id)) return false;
      return true;
    })
    .map((w) => {
      // Reconcile weekNumber, dayOfWeek, and dayKey with actual date if date is present
      if (w.date && isValidDateStr(w.date)) {
        const correctDay = getDayOfWeekName(w.date);
        const baseMonday = getWeekStartMonday(CANONICAL_PROGRAM_START_DATE);
        const diffDays = getDifferenceInDays(baseMonday, w.date);
        if (diffDays >= 0) {
          const correctWeek = Math.floor(diffDays / 7) + 1;
          return {
            ...w,
            weekNumber: correctWeek,
            dayOfWeek: correctDay,
            dayKey: `w${correctWeek}-${correctDay}`
          };
        }
      }
      return w;
    });
}

export function sanitizeCompletedDaysRecord(
  record: Record<string, boolean> | undefined,
  workouts?: WorkoutSession[]
): Record<string, boolean> {
  if (!record) return {};
  const clean = { ...record };
  if (workouts && Array.isArray(workouts)) {
    workouts.forEach((w) => {
      if (w.dayKey) clean[w.dayKey] = true;
      if (w.date) clean[w.date] = true;
    });
    const hasWeek1MonWorkout = workouts.some(
      (w) => w.date === "2026-09-14" || (w.weekNumber === 1 && w.dayOfWeek === "Monday" && !w.date)
    );
    if (!hasWeek1MonWorkout && clean["w1-Monday"]) {
      delete clean["w1-Monday"];
      delete clean["1-Monday"];
    }
  }
  return clean;
}

// ==========================================
// DURABLE PENDING OPERATIONS QUEUE
// ==========================================

export function getPendingOperations(uid: string | null | undefined): PendingSyncOperation[] {
  const key = getUserStorageKey(uid, "pending_ops");
  const raw = safeGetItem(key);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function enqueuePendingOperation(uid: string | null | undefined, op: PendingSyncOperation): void {
  const ops = getPendingOperations(uid);
  // Avoid duplicate ID
  const existingIdx = ops.findIndex((o) => o.id === op.id);
  if (existingIdx >= 0) {
    ops[existingIdx] = op;
  } else {
    ops.push(op);
  }
  const key = getUserStorageKey(uid, "pending_ops");
  safeSetItem(key, JSON.stringify(ops));
}

export function removePendingOperation(uid: string | null | undefined, opId: string): void {
  const ops = getPendingOperations(uid);
  const remaining = ops.filter((o) => o.id !== opId);
  const key = getUserStorageKey(uid, "pending_ops");
  safeSetItem(key, JSON.stringify(remaining));
}

export function clearPendingOperations(uid: string | null | undefined): void {
  const key = getUserStorageKey(uid, "pending_ops");
  safeRemoveItem(key);
}

// ==========================================
// DELIBERATE GUEST-TO-USER MIGRATION & LOCAL DATA RECOVERY
// ==========================================

export function migrateGuestDataToUser(targetUid: string): boolean {
  if (!targetUid || targetUid === "guest") return false;

  // 1. Gather all possible historical sources in localStorage
  const guestWorkoutsRaw = safeGetItem("pulse_guest_fitness_workouts");
  const legacyWorkoutsRaw = safeGetItem("pulse_fitness_workouts");
  const guestProgramsRaw = safeGetItem("pulse_guest_training_programs");
  const legacyProgramsRaw = safeGetItem("pulse_training_programs");
  const guestMatrixRaw = safeGetItem("pulse_guest_matrix_plans");
  const legacyMatrixRaw = safeGetItem("pulse_matrix_plans");
  const guestProfileRaw = safeGetItem("pulse_guest_user_profile");
  const legacyProfileRaw = safeGetItem("pulse_user_profile");

  const parseOrNull = (raw: string | null) => {
    if (!raw) return null;
    try {
      const p = JSON.parse(raw);
      return Array.isArray(p) ? (p.length > 0 ? p : null) : p;
    } catch {
      return null;
    }
  };

  const guestWorkouts = parseOrNull(guestWorkoutsRaw) || parseOrNull(legacyWorkoutsRaw);
  const guestPrograms = parseOrNull(guestProgramsRaw) || parseOrNull(legacyProgramsRaw);
  const guestMatrix = parseOrNull(guestMatrixRaw) || parseOrNull(legacyMatrixRaw);
  const guestProfile = parseOrNull(guestProfileRaw) || parseOrNull(legacyProfileRaw);

  const hasAnyHistoricalData = Boolean(
    (guestWorkouts && guestWorkouts.length > 0) ||
    (guestPrograms && guestPrograms.length > 0) ||
    (guestMatrix && guestMatrix.length > 0) ||
    (guestProfile && Object.keys(guestProfile).length > 0)
  );

  if (!hasAnyHistoricalData) {
    return false;
  }

  // Create an emergency backup of the target and guest state before migration
  createLocalPreMigrationBackup(targetUid);
  createLocalPreMigrationBackup("guest");

  const targetWorkoutsKey = getUserStorageKey(targetUid, "fitness_workouts");
  const targetProgramsKey = getUserStorageKey(targetUid, "training_programs");
  const targetMatrixKey = getUserStorageKey(targetUid, "matrix_plans");
  const targetProfileKey = getUserStorageKey(targetUid, "user_profile");

  let migratedCount = 0;

  // Workouts: merge unique by id or date
  if (guestWorkouts && Array.isArray(guestWorkouts)) {
    const existingTargetWorkouts = parseOrNull(safeGetItem(targetWorkoutsKey)) || [];
    const wMap = new Map<string, any>();
    for (const w of existingTargetWorkouts) {
      if (w && (w.id || w.date)) wMap.set(w.id || w.date, w);
    }
    for (const w of guestWorkouts) {
      const key = w.id || w.date;
      if (key && !wMap.has(key)) {
        wMap.set(key, w);
        migratedCount++;
      }
    }
    safeSetItem(targetWorkoutsKey, JSON.stringify(Array.from(wMap.values())));
  }

  // Programs: merge programs (especially custom 8-week program)
  if (guestPrograms && Array.isArray(guestPrograms)) {
    const existingTargetProgs = parseOrNull(safeGetItem(targetProgramsKey)) || [];
    const pMap = new Map<string, any>();
    for (const p of existingTargetProgs) {
      if (p && p.id) pMap.set(p.id, p);
    }
    for (const p of guestPrograms) {
      if (p && p.id) {
        if (!pMap.has(p.id)) {
          pMap.set(p.id, p);
          migratedCount++;
        } else {
          // If guest program has more weeks, keep the richer one
          const existing = pMap.get(p.id);
          const guestWeeks = p.matrixPlans?.length || p.totalWeeks || p.durationWeeks || 0;
          const existingWeeks = existing.matrixPlans?.length || existing.totalWeeks || existing.durationWeeks || 0;
          if (guestWeeks > existingWeeks) {
            pMap.set(p.id, { ...existing, ...p });
            migratedCount++;
          }
        }
      }
    }
    safeSetItem(targetProgramsKey, JSON.stringify(Array.from(pMap.values())));
  }

  // Matrix Plans: merge weeks
  if (guestMatrix && Array.isArray(guestMatrix)) {
    const existingTargetMatrix = parseOrNull(safeGetItem(targetMatrixKey)) || [];
    const mMap = new Map<number, any>();
    for (const m of existingTargetMatrix) {
      if (m && m.weekNumber !== undefined) mMap.set(m.weekNumber, m);
    }
    for (const m of guestMatrix) {
      if (m && m.weekNumber !== undefined) {
        if (!mMap.has(m.weekNumber)) {
          mMap.set(m.weekNumber, m);
          migratedCount++;
        }
      }
    }
    safeSetItem(targetMatrixKey, JSON.stringify(Array.from(mMap.values())));
  }

  // User Profile: merge non-default values
  if (guestProfile && typeof guestProfile === "object") {
    const existingTargetProfile = parseOrNull(safeGetItem(targetProfileKey)) || {};
    const hasExplicitTargetOnboarding = safeGetItem(getUserStorageKey(targetUid, "onboarding_completed")) === "true";
    const mergedProf = {
      ...guestProfile,
      ...existingTargetProfile,
      onboardingCompleted: hasExplicitTargetOnboarding || Boolean(existingTargetProfile.onboardingCompleted)
    };
    safeSetItem(targetProfileKey, JSON.stringify(mergedProf));
    migratedCount++;
  }

  // Also migrate supplementary keys
  const keysToCopy = [
    "active_program_id",
    "completed_days_record",
    "body_comp_records",
    "health_metrics",
    "supplements",
    "supplement_categories",
    "session_feelings",
    "custom_exercises"
  ];

  for (const k of keysToCopy) {
    const targetKey = getUserStorageKey(targetUid, k);
    const existing = safeGetItem(targetKey);
    if (!existing || existing === "[]" || existing === "{}") {
      const guestVal = safeGetItem(`pulse_guest_${k}`) || safeGetItem(`pulse_${k}`);
      if (guestVal) {
        safeSetItem(targetKey, guestVal);
        migratedCount++;
      }
    }
  }

  // Also migrate drafts
  const guestDrafts = listWorkoutDrafts("guest");
  for (const draft of guestDrafts) {
    saveWorkoutDraft(targetUid, {
      ...draft,
      uid: targetUid
    });
  }

  return migratedCount > 0;
}

/**
 * Exports all local data for a user as a downloadable JSON object.
 */
export function exportAllUserDataAsJson(uid: string): string {
  const safeUid = uid && uid.trim().length > 0 ? uid.trim() : "guest";
  const keys = [
    "fitness_workouts",
    "training_programs",
    "matrix_plans",
    "active_program_id",
    "completed_days_record",
    "body_comp_records",
    "user_profile",
    "health_metrics",
    "supplements",
    "supplement_categories",
    "progress_photos",
    "session_feelings",
    "custom_exercises"
  ];

  const exportObj: Record<string, any> = {
    exportedAt: new Date().toISOString(),
    uid: safeUid
  };

  for (const k of keys) {
    const raw = safeGetItem(getUserStorageKey(safeUid, k)) || safeGetItem(`pulse_${k}`);
    if (raw) {
      try {
        exportObj[k] = JSON.parse(raw);
      } catch {
        exportObj[k] = raw;
      }
    }
  }

  return JSON.stringify(exportObj, null, 2);
}

// ==========================================
// SCOPED USER STATE LOADER & SAVER
// ==========================================

export interface UserStorageState {
  workouts: WorkoutSession[];
  matrixPlans: WeeklyMatrixPlan[];
  programs: TrainingProgram[];
  activeProgramId: string;
  completedDaysRecord: Record<string, boolean>;
  bodyCompRecords: BodyCompositionRecord[];
  userProfile: UserProfile;
  healthMetrics: SyncedHealthMetrics;
  supplements: SupplementEntry[];
  supplementCategories: string[];
  progressPhotos: ProgressPhoto[];
  sessionFeelings: SessionFeeling[];
  customExercises: ExerciseReference[];
}

export function loadScopedUserData(
  uid: string | null | undefined,
  initialDefaults: {
    defaultWorkouts: WorkoutSession[];
    defaultPrograms: TrainingProgram[];
    defaultMatrixPlans: WeeklyMatrixPlan[];
    defaultProfile: UserProfile;
    defaultHealthMetrics: SyncedHealthMetrics;
    defaultSupplements: SupplementEntry[];
    defaultSupplementCategories: string[];
    defaultProgressPhotos: ProgressPhoto[];
  }
): UserStorageState {
  const safeUid = uid && uid.trim().length > 0 ? uid.trim() : "guest";

  // Check if scoped workouts key exists
  let scopedWorkoutsRaw = safeGetItem(getUserStorageKey(safeUid, "fitness_workouts"));

  // If this is guest or first boot, check for legacy unscoped data migration
  if (scopedWorkoutsRaw === null) {
    const legacyRaw = safeGetItem("pulse_fitness_workouts");
    if (legacyRaw !== null && (safeUid === "guest" || safeUid === "legacy")) {
      createLocalPreMigrationBackup(safeUid);
      safeSetItem(getUserStorageKey(safeUid, "fitness_workouts"), legacyRaw);
      const legacyProgs = safeGetItem("pulse_training_programs");
      if (legacyProgs) safeSetItem(getUserStorageKey(safeUid, "training_programs"), legacyProgs);
      const legacyMatrix = safeGetItem("pulse_matrix_plans");
      if (legacyMatrix) safeSetItem(getUserStorageKey(safeUid, "matrix_plans"), legacyMatrix);
      const legacyBodyComp = safeGetItem("pulse_body_comp_records");
      if (legacyBodyComp) safeSetItem(getUserStorageKey(safeUid, "body_comp_records"), legacyBodyComp);
    } else if (safeUid !== "guest") {
      // Authenticated user logging in: recover any historical guest/legacy sessions automatically
      migrateGuestDataToUser(safeUid);
      scopedWorkoutsRaw = safeGetItem(getUserStorageKey(safeUid, "fitness_workouts"));
    }
  }

  const getParsed = <T>(key: string, fallback: T): T => {
    const raw = safeGetItem(getUserStorageKey(safeUid, key));
    if (!raw) return fallback;
    try {
      return JSON.parse(raw);
    } catch {
      return fallback;
    }
  };

  const rawWorkouts = getParsed<WorkoutSession[]>("fitness_workouts", initialDefaults.defaultWorkouts);
  const workouts = sanitizeUserWorkouts(rawWorkouts);
  let programs = getParsed<TrainingProgram[]>("training_programs", initialDefaults.defaultPrograms);
  // Ensure predefined default programs exist and are up to date
  const canonicalDefaults = createPreplannedPrograms();
  const programMap = new Map<string, TrainingProgram>();
  canonicalDefaults.forEach((p) => programMap.set(p.id, p));
  programs.forEach((p) => {
    if (p.isCustom) {
      programMap.set(p.id, p);
    } else {
      // Keep canonical up-to-date structure
      const canonical = programMap.get(p.id);
      if (canonical) {
        programMap.set(p.id, { ...canonical, name: p.name || canonical.name });
      } else {
        programMap.set(p.id, p);
      }
    }
  });
  programs = Array.from(programMap.values());

  let activeProgramId =
    safeGetItem(getUserStorageKey(safeUid, "active_program_id")) ||
    "prog-single-muscle";

  if (activeProgramId === "prog-hypertrophy-5day") {
    activeProgramId = "prog-single-muscle";
    safeSetItem(getUserStorageKey(safeUid, "active_program_id"), "prog-single-muscle");
  }

  let matrixPlans = getParsed<WeeklyMatrixPlan[]>("matrix_plans", initialDefaults.defaultMatrixPlans);

  // Sanitize matrixPlans strictly if active program is Single Muscle Split
  const isSingleMuscleActive =
    activeProgramId === "prog-single-muscle" ||
    activeProgramId === "prog-hypertrophy-5day" ||
    programs.find((p) => p.id === activeProgramId)?.name?.toLowerCase().includes("single muscle");

  if (isSingleMuscleActive && isLegacyPplPlan(matrixPlans)) {
    matrixPlans = sanitizeSingleMuscleMatrix(matrixPlans, undefined, activeProgramId);
    safeSetItem(getUserStorageKey(safeUid, "matrix_plans"), JSON.stringify(matrixPlans));
  }
  const rawCompletedDaysRecord = getParsed<Record<string, boolean>>("completed_days_record", {});
  const completedDaysRecord = sanitizeCompletedDaysRecord(rawCompletedDaysRecord);
  const bodyCompRecords = getParsed<BodyCompositionRecord[]>("body_comp_records", []);
  const userProfile = getParsed<UserProfile>("user_profile", initialDefaults.defaultProfile);
  const healthMetrics = getParsed<SyncedHealthMetrics>("health_metrics", initialDefaults.defaultHealthMetrics);
  const supplements = getParsed<SupplementEntry[]>("supplements", initialDefaults.defaultSupplements);
  const supplementCategories = getParsed<string[]>(
    "supplement_categories",
    initialDefaults.defaultSupplementCategories
  );
  const progressPhotos = getParsed<ProgressPhoto[]>("progress_photos", initialDefaults.defaultProgressPhotos);
  const rawSessionFeelings = getParsed<SessionFeeling[]>("session_feelings", []);
  const sessionFeelings = rawSessionFeelings.filter((f) => f.workoutId !== "sess-01");
  const customExercises = getParsed<ExerciseReference[]>("custom_exercises", []);

  return {
    workouts,
    matrixPlans,
    programs,
    activeProgramId,
    completedDaysRecord,
    bodyCompRecords,
    userProfile,
    healthMetrics,
    supplements,
    supplementCategories,
    progressPhotos,
    sessionFeelings,
    customExercises
  };
}

export function saveScopedField(uid: string | null | undefined, fieldKey: string, value: any): void {
  const safeUid = uid && uid.trim().length > 0 ? uid.trim() : "guest";
  const key = getUserStorageKey(safeUid, fieldKey);

  // 1. Authoritative commit to IndexedDB
  idbSet(key, value).catch(() => {});

  // 2. Selective lightweight sync to localStorage (exclude massive arrays to avoid quota overflow)
  const isHeavyCollection = fieldKey === "fitness_workouts" && Array.isArray(value) && value.length > 25;
  if (!isHeavyCollection) {
    const serialized = typeof value === "string" ? value : JSON.stringify(value);
    safeSetItem(key, serialized);
  }
}

// ==========================================
// PERSISTENT DIRTY & SYNC STATE MACHINE
// ==========================================

export function getPersistentSyncState(uid: string | null | undefined): PersistentSyncState {
  const safeUid = uid && uid.trim().length > 0 ? uid.trim() : "guest";
  const key = getUserStorageKey(safeUid, "sync_state");
  const raw = safeGetItem(key);
  const storedQuota = getStoredQuotaCooldown();
  const isGlobalQuotaActive = storedQuota > Date.now();

  if (!raw) {
    return {
      status: isGlobalQuotaActive ? "Cloud quota reached, pending sync" : "Saved locally",
      isDirty: false,
      localRevision: 0,
      lastConfirmedRevision: 0,
      dirtyModules: [],
      quotaCooldownUntil: isGlobalQuotaActive ? storedQuota : undefined
    };
  }
  try {
    const parsed = JSON.parse(raw);
    const effectiveQuota = isGlobalQuotaActive 
      ? storedQuota 
      : (parsed.quotaCooldownUntil && parsed.quotaCooldownUntil > Date.now() ? parsed.quotaCooldownUntil : undefined);
    const isQuotaActive = Boolean(effectiveQuota && effectiveQuota > Date.now());

    return {
      status: isQuotaActive ? "Cloud quota reached, pending sync" : (parsed.status || "Saved locally"),
      isDirty: Boolean(parsed.isDirty),
      localRevision: typeof parsed.localRevision === "number" ? parsed.localRevision : 0,
      lastConfirmedRevision: typeof parsed.lastConfirmedRevision === "number" ? parsed.lastConfirmedRevision : 0,
      lastSyncedTimestamp: parsed.lastSyncedTimestamp,
      dirtyModules: Array.isArray(parsed.dirtyModules) ? parsed.dirtyModules : [],
      quotaCooldownUntil: effectiveQuota,
      lastError: parsed.lastError
    };
  } catch {
    return {
      status: isGlobalQuotaActive ? "Cloud quota reached, pending sync" : "Saved locally",
      isDirty: false,
      localRevision: 0,
      lastConfirmedRevision: 0,
      dirtyModules: [],
      quotaCooldownUntil: isGlobalQuotaActive ? storedQuota : undefined
    };
  }
}

export function savePersistentSyncState(
  uid: string | null | undefined,
  partialState: Partial<PersistentSyncState>
): PersistentSyncState {
  const safeUid = uid && uid.trim().length > 0 ? uid.trim() : "guest";
  const current = getPersistentSyncState(safeUid);
  
  if (partialState.quotaCooldownUntil && partialState.quotaCooldownUntil > Date.now()) {
    setStoredQuotaCooldown(partialState.quotaCooldownUntil);
  }

  const updated: PersistentSyncState = {
    ...current,
    ...partialState
  };
  const key = getUserStorageKey(safeUid, "sync_state");
  safeSetItem(key, JSON.stringify(updated));
  idbSet(key, updated).catch(() => {});
  return updated;
}

export function markModuleDirty(
  uid: string | null | undefined,
  moduleName: LifeOSModule
): PersistentSyncState {
  const current = getPersistentSyncState(uid);
  const dirtyModules = Array.from(new Set([...current.dirtyModules, moduleName]));
  const nextRev = current.localRevision + 1;
  return savePersistentSyncState(uid, {
    isDirty: true,
    localRevision: nextRev,
    dirtyModules,
    status: current.quotaCooldownUntil && current.quotaCooldownUntil > Date.now()
      ? "Cloud quota reached, pending sync"
      : !navigator.onLine
      ? "Offline, pending sync"
      : "Saved locally"
  });
}

export function markSyncConfirmed(
  uid: string | null | undefined,
  confirmedRevision: number
): PersistentSyncState {
  const current = getPersistentSyncState(uid);
  const isStillDirty = current.localRevision > confirmedRevision;
  return savePersistentSyncState(uid, {
    isDirty: isStillDirty,
    lastConfirmedRevision: Math.max(current.lastConfirmedRevision, confirmedRevision),
    status: isStillDirty ? "Saved locally" : "Synced to cloud",
    lastSyncedTimestamp: new Date().toISOString(),
    dirtyModules: isStillDirty ? current.dirtyModules : []
  });
}


