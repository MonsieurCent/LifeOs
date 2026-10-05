import { describe, it } from "vitest";
import {
  mergePrograms,
  mergeWorkouts,
  mergeBodyCompRecords
} from "../firestoreSync";
import {
  getUserStorageKey,
  safeGetItem,
  safeSetItem,
  getTombstones,
  addTombstone,
  mergeTombstones,
  getPendingOperations,
  enqueuePendingOperation,
  clearPendingOperations,
  saveWorkoutDraft,
  getWorkoutDraft,
  removeWorkoutDraft,
  loadScopedUserData,
  saveScopedField,
  migrateGuestDataToUser,
  pruneLocalBackups
} from "../userStorage";
import { WorkoutSession, TrainingProgram, BodyCompositionRecord } from "../../types";

function assert(condition: boolean, msg: string) {
  if (!condition) {
    throw new Error(`[TEST FAIL] ${msg}`);
  }
}

describe("Sync Hardening Audit", () => {
  it("passes all sync hardening verification checks", () => {
    console.log("\n=======================================================");
    console.log("  RUNNING SYNC HARDENING AUDIT VERIFICATION SUITE");
    console.log("=======================================================\n");

// Test 1: mergePrograms handles revisions and updated timestamps correctly
{
  console.log("Test 1: mergePrograms timestamp and revision resolution...");
  const olderDate = "2026-09-10T10:00:00.000Z";
  const newerDate = "2026-09-15T12:00:00.000Z";

  const localProgram: TrainingProgram = {
    id: "prog-1",
    name: "8-Week Hypertrophy v2 (Newer)",
    goal: "bulk",
    description: "New updated program",
    primaryObjective: "Hypertrophy",
    splitDaysPerWeek: 4,
    durationWeeks: 8,
    matrixPlans: [],
    updatedAt: newerDate
  };

  const remoteProgramOld: TrainingProgram = {
    id: "prog-1",
    name: "8-Week Hypertrophy v1 (Older Remote)",
    goal: "bulk",
    description: "Old program",
    primaryObjective: "Hypertrophy",
    splitDaysPerWeek: 4,
    durationWeeks: 8,
    matrixPlans: [],
    updatedAt: olderDate
  };

  // Local is newer -> must retain localProgram
  const merged = mergePrograms([localProgram], [remoteProgramOld]);
  assert(merged.length === 1, "Should have 1 program");
  assert(merged[0].name === "8-Week Hypertrophy v2 (Newer)", "Newer 8-week plan must NOT be overwritten by older 8-week plan");

  // Deletion via tombstone
  const tombstones = { "prog-1": "2026-09-15T14:00:00.000Z" };
  const mergedWithTombstone = mergePrograms([localProgram], [remoteProgramOld], tombstones);
  assert(mergedWithTombstone.length === 0, "Deleted program with tombstone must be removed from merge");
  console.log("  ✓ Test 1 Passed: Programs merge respects timestamps, revisions, and tombstones.");
}

// Test 2: mergeWorkouts handles tombstones and property updates
{
  console.log("Test 2: mergeWorkouts with updates and tombstones...");
  const workoutA: WorkoutSession = {
    id: "w-101",
    date: "2026-09-14",
    title: "Back & Biceps v1",
    durationMinutes: 45,
    exercises: [],
    updatedAt: "2026-09-14T08:00:00.000Z"
  };

  const workoutAUpdated: WorkoutSession = {
    id: "w-101",
    date: "2026-09-14",
    title: "Back & Biceps v2 (Updated sets)",
    durationMinutes: 60,
    exercises: [],
    updatedAt: "2026-09-14T10:00:00.000Z"
  };

  const mergedWorkouts = mergeWorkouts([workoutA], [workoutAUpdated]);
  assert(mergedWorkouts.length === 1, "Should have 1 merged workout");
  assert(mergedWorkouts[0].title === "Back & Biceps v2 (Updated sets)", "Updated workout must take precedence");
  assert(mergedWorkouts[0].durationMinutes === 60, "Updated duration must be 60");

  // Tombstone deletion
  const tombstones = { "w-101": "2026-09-14T12:00:00.000Z" };
  const mergedWithTombstone = mergeWorkouts([workoutAUpdated], [workoutA], tombstones);
  assert(mergedWithTombstone.length === 0, "Deleted workout with tombstone must not appear in merge");
  console.log("  ✓ Test 2 Passed: Workouts correctly update and propagate deletions.");
}

// Test 3: Account Isolation in UserStorage
{
  console.log("Test 3: Account isolation between User A and User B...");
  const mockStorage: Record<string, string> = {};
  // Mock localStorage in node
  (globalThis as any).localStorage = {
    getItem: (k: string) => mockStorage[k] || null,
    setItem: (k: string, v: string) => { mockStorage[k] = v; },
    removeItem: (k: string) => { delete mockStorage[k]; }
  };

  const userA = "user_alpha_123";
  const userB = "user_beta_456";

  saveScopedField(userA, "fitness_unit", "lbs");
  saveScopedField(userB, "fitness_unit", "kg");

  assert(safeGetItem(getUserStorageKey(userA, "fitness_unit")) === "lbs", "User A unit must be lbs");
  assert(safeGetItem(getUserStorageKey(userB, "fitness_unit")) === "kg", "User B unit must be kg");

  const draftA = {
    id: "plan_1",
    planKey: "plan_1",
    title: "Alpha Draft",
    date: "2026-09-15",
    durationMinutes: 45,
    exercises: [],
    updatedAt: "2026-09-15T10:00:00.000Z"
  };
  saveWorkoutDraft(userA, draftA);

  assert(getWorkoutDraft(userA, "plan_1")?.title === "Alpha Draft", "User A should see their draft");
  assert(getWorkoutDraft(userB, "plan_1") === null, "User B should NOT see User A's draft");
  console.log("  ✓ Test 3 Passed: User accounts are strictly isolated.");
}

// Test 4: Pending Operations Queue
{
  console.log("Test 4: Durable pending operations queue...");
  const user = "test_queue_user";
  clearPendingOperations(user);
  assert(getPendingOperations(user).length === 0, "Initial queue should be empty");

  enqueuePendingOperation(user, {
    id: "op_1",
    type: "save_workout",
    revision: 1,
    timestamp: new Date().toISOString()
  });

  enqueuePendingOperation(user, {
    id: "op_2",
    type: "delete_workout",
    revision: 2,
    timestamp: new Date().toISOString()
  });

  const ops = getPendingOperations(user);
  assert(ops.length === 2, "Queue should contain 2 operations");
  assert(ops[0].id === "op_1", "First op should be op_1");
  assert(ops[1].id === "op_2", "Second op should be op_2");

  clearPendingOperations(user);
  assert(getPendingOperations(user).length === 0, "Queue cleared successfully");
  console.log("  ✓ Test 4 Passed: Pending operations queue is durable and functional.");
}

// Test 5: Workout Draft Safety (Draft remains until explicit removal)
{
  console.log("Test 5: Workout draft safety...");
  const user = "test_draft_user";
  const draft = {
    id: "draft_active",
    planKey: "free_workout",
    title: "Heavy Leg Day",
    date: "2026-09-15",
    durationMinutes: 55,
    exercises: [],
    updatedAt: new Date().toISOString()
  };

  saveWorkoutDraft(user, draft);
  const retrieved = getWorkoutDraft(user, "free_workout");
  assert(retrieved !== null, "Draft must be retrievable");
  assert(retrieved?.title === "Heavy Leg Day", "Draft title matches");

  // Remove draft only when confirmed
  removeWorkoutDraft(user, "free_workout");
  assert(getWorkoutDraft(user, "free_workout") === null, "Draft cleanly removed after confirmation");
  console.log("  ✓ Test 5 Passed: Draft persists reliably and removes cleanly.");
}

// Test 6: Storage Quota Protection and Backup Pruning
{
  console.log("Test 6: Storage quota protection and backup pruning...");
  const mockStorage: Record<string, string> = {
    "pulse_backup_old_1": "huge_dump_1",
    "pulse_backup_old_2": "huge_dump_2",
    "pulse_user_data": "valid_user_data"
  };

  (globalThis as any).localStorage = {
    getItem: (k: string) => mockStorage[k] || null,
    setItem: (k: string, v: string) => { mockStorage[k] = v; },
    removeItem: (k: string) => { delete mockStorage[k]; },
    key: (i: number) => Object.keys(mockStorage)[i] || null,
    get length() { return Object.keys(mockStorage).length; }
  };

  // pruneLocalBackups should purge old backups
  pruneLocalBackups();
  assert(!mockStorage["pulse_backup_old_1"], "Old backup 1 must be pruned");
  assert(!mockStorage["pulse_backup_old_2"], "Old backup 2 must be pruned");
  assert(mockStorage["pulse_user_data"] === "valid_user_data", "User data must be retained");

  // safeSetItem handles QuotaExceededError gracefully without unhandled exception
  let quotaHit = false;
  (globalThis as any).localStorage.setItem = () => {
    quotaHit = true;
    const err = new Error("Setting the value exceeded the quota.");
    err.name = "QuotaExceededError";
    throw err;
  };

  // Must not throw
  safeSetItem("pulse_backup_test", "content");
  assert(quotaHit, "Quota error handler was exercised");
  console.log("  ✓ Test 6 Passed: Storage quota protection and backup pruning verified.");
}

console.log("\n=======================================================");
console.log("  ALL SYNC HARDENING VERIFICATION CHECKS PASSED!        ");
console.log("=======================================================\n");
  });
});
