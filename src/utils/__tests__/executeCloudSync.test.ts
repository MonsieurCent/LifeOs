import { describe, it, expect, beforeEach, vi } from "vitest";
import { executeCloudSyncEngine } from "../syncManager";
import { SyncOperationRecord } from "../syncTypes";

describe("executeCloudSyncEngine - Cloud Sync Success and Failure Handling", () => {
  const uid = "test_user_sync_exec";
  let pendingStore: SyncOperationRecord[] = [];
  let confirmedRev: number | null = null;
  let persistentState: any = null;

  beforeEach(() => {
    pendingStore = [];
    confirmedRev = null;
    persistentState = null;
  });

  const createParams = (overrides?: any) => ({
    uid,
    localSnapshot: { workouts: [{ id: "w1", title: "Legs" }] },
    tombstones: { workouts: {}, programs: {}, bodyComp: {} },
    uploadRevision: 1,
    capturedOpIds: new Set(["op_1"]),
    isQuotaCooldown: false,
    quotaCooldownUntil: 0,
    postServerSync: vi.fn(),
    executeFirestoreSync: vi.fn(),
    getPendingOps: () => [...pendingStore],
    clearPendingOps: vi.fn(() => {
      pendingStore = [];
    }),
    savePendingOps: vi.fn((_uid: string, ops: SyncOperationRecord[]) => {
      pendingStore = [...ops];
    }),
    markConfirmed: vi.fn((_uid: string, rev: number) => {
      confirmedRev = rev;
    }),
    savePersistentState: vi.fn((_uid: string, state: any) => {
      persistentState = state;
    }),
    localPendingRevision: 1,
    needsFollowUpSync: false,
    ...overrides
  });

  // Test 1: Both remote writes fail
  it("handles both remote writes failing: keeps pending changes and reports failure", async () => {
    pendingStore = [
      { id: "op_1", module: "workouts", revision: 1, timestamp: new Date().toISOString(), retryCount: 0 }
    ];

    const postServerSync = vi.fn().mockResolvedValue({
      success: false,
      error: "Server network timeout 504"
    });
    const executeFirestoreSync = vi.fn().mockRejectedValue(new Error("Firestore offline"));

    const params = createParams({ postServerSync, executeFirestoreSync });
    const result = await executeCloudSyncEngine(params);

    expect(result.serverOk).toBe(false);
    expect(result.fsOk).toBe(false);
    expect(result.status).toBe("Cloud sync failed. Changes are waiting to retry.");

    // Must NOT clear pending operations
    expect(params.clearPendingOps).not.toHaveBeenCalled();
    // Must NOT acknowledge/confirm sync
    expect(params.markConfirmed).not.toHaveBeenCalled();
    // Pending operations must remain intact for retry
    expect(result.remainingPendingOps.length).toBe(1);
    expect(result.remainingPendingOps[0].id).toBe("op_1");

    expect(persistentState?.isDirty).toBe(true);
    expect(persistentState?.status).toBe("Cloud sync failed. Changes are waiting to retry.");
  });

  // Test 2: Server succeeds, Firestore fails
  it("handles Server succeeding and Firestore failing: reports partial sync and keeps pending changes for retry", async () => {
    pendingStore = [
      { id: "op_1", module: "workouts", revision: 1, timestamp: new Date().toISOString(), retryCount: 0 }
    ];

    const postServerSync = vi.fn().mockResolvedValue({
      success: true,
      finalPayload: { revision: 1 },
      mergedData: { workouts: [{ id: "w1", title: "Legs" }] },
      mergedTombstones: { workouts: {}, programs: {}, bodyComp: {} }
    });
    const executeFirestoreSync = vi.fn().mockRejectedValue(new Error("Firestore write quota exceeded"));

    const params = createParams({ postServerSync, executeFirestoreSync });
    const result = await executeCloudSyncEngine(params);

    expect(result.serverOk).toBe(true);
    expect(result.fsOk).toBe(false);
    expect(result.status).toBe("Partial sync");

    // Must NOT clear pending operations since full sync was not achieved
    expect(params.clearPendingOps).not.toHaveBeenCalled();
    expect(params.markConfirmed).not.toHaveBeenCalled();
    expect(result.remainingPendingOps.length).toBe(1);
    expect(result.remainingPendingOps[0].id).toBe("op_1");

    expect(persistentState?.isDirty).toBe(true);
    expect(persistentState?.status).toBe("Partial sync");
    expect(persistentState?.lastError).toContain("Firestore");
  });

  // Test 3: Firestore succeeds, server fails
  it("handles Firestore succeeding and Server failing: reports partial sync and keeps pending changes for retry", async () => {
    pendingStore = [
      { id: "op_1", module: "workouts", revision: 1, timestamp: new Date().toISOString(), retryCount: 0 }
    ];

    const postServerSync = vi.fn().mockResolvedValue({
      success: false,
      error: "HTTP 500 Internal Server Error"
    });
    const executeFirestoreSync = vi.fn().mockResolvedValue({
      finalPayload: { revision: 1 },
      mergedData: { workouts: [{ id: "w1", title: "Legs" }] },
      mergedTombstones: { workouts: {}, programs: {}, bodyComp: {} }
    });

    const params = createParams({ postServerSync, executeFirestoreSync });
    const result = await executeCloudSyncEngine(params);

    expect(result.serverOk).toBe(false);
    expect(result.fsOk).toBe(true);
    expect(result.status).toBe("Partial sync");

    // Must NOT clear pending operations since full sync was not achieved
    expect(params.clearPendingOps).not.toHaveBeenCalled();
    expect(params.markConfirmed).not.toHaveBeenCalled();
    expect(result.remainingPendingOps.length).toBe(1);
    expect(result.remainingPendingOps[0].id).toBe("op_1");

    expect(persistentState?.isDirty).toBe(true);
    expect(persistentState?.status).toBe("Partial sync");
    expect(persistentState?.lastError).toContain("Server");
  });

  // Test 4: Both remote writes succeed
  it("handles both remote writes succeeding: acknowledges uploaded changes and reports Synced to cloud", async () => {
    pendingStore = [
      { id: "op_1", module: "workouts", revision: 1, timestamp: new Date().toISOString(), retryCount: 0 }
    ];

    const postServerSync = vi.fn().mockResolvedValue({
      success: true,
      finalPayload: { revision: 1 },
      mergedData: { workouts: [{ id: "w1", title: "Legs" }] },
      mergedTombstones: { workouts: {}, programs: {}, bodyComp: {} }
    });
    const executeFirestoreSync = vi.fn().mockResolvedValue({
      finalPayload: { revision: 1 },
      mergedData: { workouts: [{ id: "w1", title: "Legs" }] },
      mergedTombstones: { workouts: {}, programs: {}, bodyComp: {} }
    });

    const params = createParams({ postServerSync, executeFirestoreSync });
    const result = await executeCloudSyncEngine(params);

    expect(result.serverOk).toBe(true);
    expect(result.fsOk).toBe(true);
    expect(result.status).toBe("Synced to cloud");

    // Operations captured in this upload must be cleared
    expect(params.clearPendingOps).toHaveBeenCalled();
    expect(params.markConfirmed).toHaveBeenCalledWith(uid, 1);
    expect(confirmedRev).toBe(1);
    expect(result.remainingPendingOps.length).toBe(0);

    expect(persistentState?.isDirty).toBe(false);
    expect(persistentState?.status).toBe("Synced to cloud");
  });

  // Test 5: A new pending edit arrives during an upload and remains pending afterward
  it("preserves new pending edits that arrived during an upload even after upload succeeds", async () => {
    // Before upload: only op_1 existed and was captured
    pendingStore = [
      { id: "op_1", module: "workouts", revision: 1, timestamp: "2026-09-26T23:00:00Z", retryCount: 0 }
    ];

    const postServerSync = vi.fn().mockImplementation(async () => {
      // Simulate user editing a workout while upload is running:
      pendingStore.push({
        id: "op_2_new_during_upload",
        module: "workouts",
        revision: 2,
        timestamp: "2026-09-26T23:00:01Z",
        retryCount: 0
      });
      return {
        success: true,
        finalPayload: { revision: 1 },
        mergedData: { workouts: [{ id: "w1", title: "Legs updated" }] },
        mergedTombstones: { workouts: {}, programs: {}, bodyComp: {} }
      };
    });

    const executeFirestoreSync = vi.fn().mockResolvedValue({
      finalPayload: { revision: 1 },
      mergedData: { workouts: [{ id: "w1", title: "Legs updated" }] },
      mergedTombstones: { workouts: {}, programs: {}, bodyComp: {} }
    });

    const params = createParams({
      postServerSync,
      executeFirestoreSync,
      uploadRevision: 1,
      capturedOpIds: new Set(["op_1"]),
      localPendingRevision: 2 // Revision bumped due to concurrent edit
    });

    const result = await executeCloudSyncEngine(params);

    expect(result.serverOk).toBe(true);
    expect(result.fsOk).toBe(true);

    // Because newer edits exist, status must report "Saved locally" to trigger follow-up sync
    expect(result.status).toBe("Saved locally");

    // op_1 should be cleared, but op_2_new_during_upload MUST remain pending!
    expect(params.savePendingOps).toHaveBeenCalled();
    expect(result.remainingPendingOps.length).toBe(1);
    expect(result.remainingPendingOps[0].id).toBe("op_2_new_during_upload");
    expect(result.remainingPendingOps[0].revision).toBe(2);

    expect(persistentState?.isDirty).toBe(true);
    expect(persistentState?.status).toBe("Saved locally");
  });
});
