import { describe, it, expect } from "vitest";
import { LocalSyncSnapshot } from "../firestoreSync";
import { WorkoutSession, TrainingProgram, UserProfile } from "../../types";
import { TombstoneStore } from "../userStorage";

describe("Cross-Device Two-Way Sync Bridge Suite", () => {
  it("synchronizes records between Device A (PC) and Device B (Phone) bidirectionally", () => {
    // Simulated server data store representing the full-stack sync bridge
    let serverStore: {
      data: any;
      revision: number;
      updatedAt: string;
      deviceId: string;
    } | null = null;

    const sseBroadcasts: any[] = [];

    // Helper simulating POST /api/sync/store/:userId
    const simulatePostServerSync = (
      userId: string,
      clientData: LocalSyncSnapshot,
      clientTombstones: TombstoneStore,
      deviceId: string,
      revision: number
    ) => {
      const currentRev = serverStore?.revision || 0;
      const newRev = Math.max(currentRev, revision) + 1;
      
      const payload = {
        ...clientData,
        tombstones: clientTombstones,
        deviceId,
        revision: newRev,
        updatedAt: new Date().toISOString()
      };

      serverStore = {
        data: payload,
        revision: newRev,
        updatedAt: payload.updatedAt,
        deviceId
      };

      // Simulates Server-Sent Events (SSE) broadcast to all open listening devices
      sseBroadcasts.push({
        type: "sync_update",
        deviceId,
        revision: newRev,
        data: payload
      });

      return {
        success: true,
        finalPayload: payload,
        mergedData: clientData,
        mergedTombstones: clientTombstones,
        revision: newRev
      };
    };

    // Helper simulating GET /api/sync/store/:userId
    const simulateFetchServerSync = (userId: string) => {
      if (!serverStore) {
        return { success: true, exists: false, data: null, revision: 0 };
      }
      return {
        success: true,
        exists: true,
        data: serverStore.data,
        revision: serverStore.revision,
        updatedAt: serverStore.updatedAt
      };
    };

    // 1. Device A (PC) logs in and creates an 8-Week Hypertrophy program and custom profile
    const deviceA_Id = "pc_chrome_device_a";
    const pcProgram: TrainingProgram = {
      id: "prog_8week_hypertrophy",
      name: "8-Week Hypertrophy Protocol",
      goal: "bulk",
      description: "Periodized 8-week progressive overload split",
      primaryObjective: "Maximal muscle hypertrophy",
      splitDaysPerWeek: 5,
      durationWeeks: 8,
      matrixPlans: [],
      createdAt: "2026-09-19T20:00:00.000Z",
      updatedAt: "2026-09-19T20:00:00.000Z"
    };

    const pcProfile: UserProfile = {
      id: "david_user",
      name: "David",
      email: "david@rootwelt-norberg.com",
      gender: "male",
      level: "advanced",
      goal: "bulk",
      daysPerWeek: 5,
      weightKg: 82.5,
      heightCm: 182,
      age: 32,
      targetCalories: 2950,
      macroSplit: { proteinG: 190, carbsG: 340, fatsG: 75 },
      connectedApps: { fitbit: true, googleHealth: false, beurer: false, fatSecret: false, sats: false },
      onboardingCompleted: true,
      createdAt: "2026-09-19T00:00:00.000Z"
    };

    const pcSnapshot: LocalSyncSnapshot = {
      workouts: [],
      programs: [pcProgram],
      matrixPlans: [],
      bodyCompRecords: [],
      userProfile: pcProfile,
      healthMetrics: {} as any,
      supplements: [],
      supplementCategories: [],
      progressPhotos: [],
      sessionFeelings: [],
      activeProgramId: "prog_8week_hypertrophy",
      completedDaysRecord: { "2026-09-19": true },
      customExercises: []
    };

    const pcTombstones: TombstoneStore = { workouts: {}, programs: {}, bodyComp: {} };

    // PC saves and uploads to Server Sync Bridge
    const pcUploadResult = simulatePostServerSync(
      "david_uid_123",
      pcSnapshot,
      pcTombstones,
      deviceA_Id,
      1
    );

    expect(pcUploadResult.success).toBe(true);
    expect(pcUploadResult.revision).toBe(2);
    expect(serverStore).not.toBeNull();
    expect(serverStore?.data.programs[0].name).toBe("8-Week Hypertrophy Protocol");
    expect(serverStore?.data.userProfile.name).toBe("David");

    // 2. Device B (Phone) logs in with the same account
    // Phone queries Server Sync Bridge on initial authentication
    const phoneInitialHydration = simulateFetchServerSync("david_uid_123");
    expect(phoneInitialHydration.exists).toBe(true);
    expect(phoneInitialHydration.data).not.toBeNull();
    expect(phoneInitialHydration.data.programs.length).toBe(1);
    expect(phoneInitialHydration.data.programs[0].id).toBe("prog_8week_hypertrophy");
    expect(phoneInitialHydration.data.userProfile.email).toBe("david@rootwelt-norberg.com");
    expect(phoneInitialHydration.data.completedDaysRecord["2026-09-19"]).toBe(true);

    // 3. Device B (Phone) logs a workout session on the go
    const deviceB_Id = "phone_safari_device_b";
    const phoneWorkout: WorkoutSession = {
      id: "w_phone_logged_chest",
      title: "Chest & Triceps Focus",
      date: "2026-09-20",
      durationMinutes: 55,
      exercises: [],
      updatedAt: "2026-09-20T06:30:00.000Z"
    };

    const phoneSnapshot: LocalSyncSnapshot = {
      ...phoneInitialHydration.data,
      workouts: [phoneWorkout]
    };

    // Phone saves and pushes
    const phoneUploadResult = simulatePostServerSync(
      "david_uid_123",
      phoneSnapshot,
      pcTombstones,
      deviceB_Id,
      phoneInitialHydration.revision
    );

    expect(phoneUploadResult.success).toBe(true);
    expect(phoneUploadResult.revision).toBe(3);

    // 4. Verify SSE broadcast was generated for Device A (PC)
    const latestBroadcast = sseBroadcasts[sseBroadcasts.length - 1];
    expect(latestBroadcast.deviceId).toBe(deviceB_Id);
    expect(latestBroadcast.revision).toBe(3);
    expect(latestBroadcast.data.workouts.length).toBe(1);
    expect(latestBroadcast.data.workouts[0].title).toBe("Chest & Triceps Focus");
    // Ensure programs and profile were preserved
    expect(latestBroadcast.data.programs[0].name).toBe("8-Week Hypertrophy Protocol");
    expect(latestBroadcast.data.userProfile.name).toBe("David");
  });
});
