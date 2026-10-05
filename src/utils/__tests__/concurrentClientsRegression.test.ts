import { describe, it, expect } from "vitest";
import {
  executeTransactionalSync,
  LocalSyncSnapshot
} from "../firestoreSync";
import { WorkoutSession, UserProfile, SyncedHealthMetrics } from "../../types";
import { TombstoneStore } from "../userStorage";

const dummyProfile = {
  id: "u1",
  name: "David",
  email: "david@test.com",
  gender: "male",
  level: "intermediate",
  goal: "bulk",
  daysPerWeek: 4,
  weightKg: 80,
  heightCm: 180,
  age: 28,
  targetCalories: 2800,
  macroSplit: { proteinG: 160, carbsG: 350, fatsG: 70 },
  connectedApps: { fitbit: true, googleHealth: true, beurer: true, fatSecret: true, sats: true }
} as unknown as UserProfile;

const dummyHealth = {} as unknown as SyncedHealthMetrics;

describe("Concurrent Multi-Client Regression: Stale Document Overwrite Prevention", () => {
  it("preserves both Workout A and Workout B when Client B uploads from older state without Client A reconnecting", async () => {
    // 1. Initial shared starting database state on server
    const baselineWorkout: WorkoutSession = {
      id: "w_baseline",
      date: "2026-09-01",
      title: "Baseline Conditioning",
      durationMinutes: 45,
      exercises: [],
      updatedAt: "2026-09-01T10:00:00.000Z"
    };

    let serverDocumentState: any = {
      workouts: [baselineWorkout],
      programs: [],
      matrixPlans: [],
      bodyCompRecords: [],
      userProfile: dummyProfile,
      healthMetrics: dummyHealth,
      supplements: [],
      supplementCategories: [],
      progressPhotos: [],
      sessionFeelings: [],
      activeProgramId: "",
      completedDaysRecord: {},
      customExercises: [],
      tombstones: { workouts: {}, programs: {}, bodyComp: {} },
      updatedAt: "2026-09-01T10:00:00.000Z",
      deviceId: "dev_seed",
      revision: 1
    };

    // Both Client A and Client B load the same starting data
    const clientA_localData: LocalSyncSnapshot = {
      workouts: [baselineWorkout],
      matrixPlans: [],
      bodyCompRecords: [],
      userProfile: dummyProfile,
      healthMetrics: dummyHealth,
      supplements: [],
      supplementCategories: [],
      progressPhotos: [],
      sessionFeelings: [],
      programs: [],
      activeProgramId: "",
      completedDaysRecord: {},
      customExercises: []
    };
    const clientA_tombstones: TombstoneStore = { workouts: {}, programs: {}, bodyComp: {} };

    const clientB_localData: LocalSyncSnapshot = {
      workouts: [baselineWorkout],
      matrixPlans: [],
      bodyCompRecords: [],
      userProfile: dummyProfile,
      healthMetrics: dummyHealth,
      supplements: [],
      supplementCategories: [],
      progressPhotos: [],
      sessionFeelings: [],
      programs: [],
      activeProgramId: "",
      completedDaysRecord: {},
      customExercises: []
    };
    const clientB_tombstones: TombstoneStore = { workouts: {}, programs: {}, bodyComp: {} };

    // 2. Client A creates Workout A, uploads via transaction, gets server confirmation, and disconnects
    const workoutA: WorkoutSession = {
      id: "w_alpha",
      date: "2026-09-18",
      title: "Chest & Triceps Hypertrophy (Client A)",
      durationMinutes: 60,
      exercises: [
        {
          id: "ex_bench",
          exerciseName: "Barbell Bench Press",
          muscleGroup: "Chest",
          sets: [{ id: "s1", setNumber: 1, weight: 100, reps: 8, isCompleted: true }]
        }
      ],
      updatedAt: "2026-09-18T14:30:00.000Z"
    };

    clientA_localData.workouts = [...clientA_localData.workouts, workoutA];

    // Mock Firestore transaction runner for server document
    const mockRunTransaction = async (_db: any, updateFn: (tx: any) => Promise<any>) => {
      const mockTx = {
        get: async () => ({
          exists: () => serverDocumentState !== null,
          data: () => (serverDocumentState ? JSON.parse(JSON.stringify(serverDocumentState)) : null)
        }),
        set: (_ref: any, data: any) => {
          serverDocumentState = JSON.parse(JSON.stringify(data));
        }
      };
      return await updateFn(mockTx);
    };

    const mockDoc = (_db: any, ...paths: string[]) => paths.join("/");

    // Client A executes transactional sync
    const resA = await executeTransactionalSync(
      null,
      "user_123",
      mockDoc,
      mockRunTransaction,
      clientA_localData,
      clientA_tombstones,
      "device_client_A",
      2
    );

    // Client A gets server confirmation
    expect(resA.finalPayload.revision).toBeGreaterThanOrEqual(2);
    expect(serverDocumentState.workouts.some((w: any) => w.id === "w_alpha")).toBe(true);

    // Client A disconnects completely (cannot help or repair)
    const clientADisconnected = true;
    expect(clientADisconnected).toBe(true);

    // 3. Client B creates Workout B using its older local state (which does NOT have Workout A)
    const workoutB: WorkoutSession = {
      id: "w_beta",
      date: "2026-09-19",
      title: "Legs & Core Power (Client B)",
      durationMinutes: 70,
      exercises: [
        {
          id: "ex_squat",
          exerciseName: "Back Squat",
          muscleGroup: "Legs",
          sets: [{ id: "s2", setNumber: 1, weight: 140, reps: 5, isCompleted: true }]
        }
      ],
      updatedAt: "2026-09-19T09:15:00.000Z"
    };

    // Notice: Client B's local state only has baselineWorkout and Workout B!
    clientB_localData.workouts = [...clientB_localData.workouts, workoutB];

    // Client B uploads using executeTransactionalSync
    const resB = await executeTransactionalSync(
      null,
      "user_123",
      mockDoc,
      mockRunTransaction,
      clientB_localData,
      clientB_tombstones,
      "device_client_B",
      2
    );

    // 4. A third, fresh client C reads directly from the authoritative server document
    const clientC_readServerData = JSON.parse(JSON.stringify(serverDocumentState));

    // VERIFICATION:
    // Both workouts (Workout A and Workout B) MUST be present on the server!
    const serverWorkoutIds = clientC_readServerData.workouts.map((w: any) => w.id);
    expect(serverWorkoutIds).toContain("w_baseline");
    expect(serverWorkoutIds).toContain("w_alpha");
    expect(serverWorkoutIds).toContain("w_beta");
    expect(clientC_readServerData.workouts.length).toBe(3);

    // Also verify that Client B's local state received Workout A from the transaction result
    const clientBWorkoutIds = resB.mergedData.workouts.map((w) => w.id);
    expect(clientBWorkoutIds).toContain("w_alpha");
    expect(clientBWorkoutIds).toContain("w_beta");
  });

  it("handles non-conflicting concurrent program week modifications without data loss", async () => {
    let serverDoc: any = {
      workouts: [],
      programs: [
        {
          id: "prog_main",
          name: "8-Week Periodization",
          totalWeeks: 8,
          updatedAt: "2026-09-01T00:00:00.000Z",
          matrixPlans: [
            {
              weekNumber: 1,
              updatedAt: "2026-09-01T00:00:00.000Z",
              days: {
                Monday: {
                  day: "Monday",
                  workoutTitle: "Squat 100kg",
                  isRestDay: false,
                  exercises: [{ exerciseName: "Squat", muscleGroup: "Legs", targetSets: 3, targetReps: "8" }]
                }
              }
            },
            {
              weekNumber: 2,
              updatedAt: "2026-09-01T00:00:00.000Z",
              days: {
                Monday: {
                  day: "Monday",
                  workoutTitle: "Squat 105kg",
                  isRestDay: false,
                  exercises: [{ exerciseName: "Squat", muscleGroup: "Legs", targetSets: 3, targetReps: "8" }]
                }
              }
            }
          ]
        }
      ],
      matrixPlans: [],
      bodyCompRecords: [],
      userProfile: dummyProfile,
      healthMetrics: dummyHealth,
      supplements: [],
      supplementCategories: [],
      progressPhotos: [],
      sessionFeelings: [],
      activeProgramId: "prog_main",
      completedDaysRecord: {},
      customExercises: [],
      tombstones: { workouts: {}, programs: {}, bodyComp: {} },
      revision: 1
    };

    const mockRunTx = async (_db: any, fn: any) => {
      const tx = {
        get: async () => ({
          exists: () => true,
          data: () => JSON.parse(JSON.stringify(serverDoc))
        }),
        set: (_ref: any, d: any) => {
          serverDoc = JSON.parse(JSON.stringify(d));
        }
      };
      return await fn(tx);
    };
    const mockDoc = () => "path";

    // Client A edits Week 1
    const clientAData: LocalSyncSnapshot = {
      workouts: [],
      matrixPlans: [],
      bodyCompRecords: [],
      userProfile: dummyProfile,
      healthMetrics: dummyHealth,
      supplements: [],
      supplementCategories: [],
      progressPhotos: [],
      sessionFeelings: [],
      activeProgramId: "prog_main",
      completedDaysRecord: {},
      customExercises: [],
      programs: [
        {
          id: "prog_main",
          name: "8-Week Periodization",
          goal: "bulk",
          description: "Periodization program",
          primaryObjective: "Hypertrophy",
          splitDaysPerWeek: 4,
          durationWeeks: 8,
          totalWeeks: 8,
          updatedAt: "2026-09-18T10:00:00.000Z",
          matrixPlans: [
            {
              weekNumber: 1,
              updatedAt: "2026-09-18T10:00:00.000Z",
              days: {
                Monday: {
                  day: "Monday",
                  workoutTitle: "Squat 110kg (Client A edit)",
                  isRestDay: false,
                  exercises: [{ exerciseName: "Squat", muscleGroup: "Legs", targetSets: 4, targetReps: "8" }]
                }
              } as any
            },
            {
              weekNumber: 2,
              updatedAt: "2026-09-01T00:00:00.000Z",
              days: {
                Monday: {
                  day: "Monday",
                  workoutTitle: "Squat 105kg",
                  isRestDay: false,
                  exercises: [{ exerciseName: "Squat", muscleGroup: "Legs", targetSets: 3, targetReps: "8" }]
                }
              } as any
            }
          ]
        }
      ]
    };

    await executeTransactionalSync(null, "uid", mockDoc, mockRunTx, clientAData, { workouts: {}, programs: {}, bodyComp: {} }, "devA", 2);

    // Client B from older state edits Week 2
    const clientBData: LocalSyncSnapshot = {
      workouts: [],
      matrixPlans: [],
      bodyCompRecords: [],
      userProfile: dummyProfile,
      healthMetrics: dummyHealth,
      supplements: [],
      supplementCategories: [],
      progressPhotos: [],
      sessionFeelings: [],
      activeProgramId: "prog_main",
      completedDaysRecord: {},
      customExercises: [],
      programs: [
        {
          id: "prog_main",
          name: "8-Week Periodization",
          goal: "bulk",
          description: "Periodization program",
          primaryObjective: "Hypertrophy",
          splitDaysPerWeek: 4,
          durationWeeks: 8,
          totalWeeks: 8,
          updatedAt: "2026-09-19T10:00:00.000Z",
          matrixPlans: [
            {
              weekNumber: 1,
              updatedAt: "2026-09-01T00:00:00.000Z",
              days: {
                Monday: {
                  day: "Monday",
                  workoutTitle: "Squat 100kg",
                  isRestDay: false,
                  exercises: [{ exerciseName: "Squat", muscleGroup: "Legs", targetSets: 3, targetReps: "8" }]
                }
              } as any
            },
            {
              weekNumber: 2,
              updatedAt: "2026-09-19T10:00:00.000Z",
              days: {
                Monday: {
                  day: "Monday",
                  workoutTitle: "Squat 115kg (Client B edit)",
                  isRestDay: false,
                  exercises: [{ exerciseName: "Squat", muscleGroup: "Legs", targetSets: 4, targetReps: "8" }]
                }
              } as any
            }
          ]
        }
      ]
    };

    await executeTransactionalSync(null, "uid", mockDoc, mockRunTx, clientBData, { workouts: {}, programs: {}, bodyComp: {} }, "devB", 2);

    // Server should have Week 1 from Client A and Week 2 from Client B
    const serverProgram = serverDoc.programs.find((p: any) => p.id === "prog_main");
    const week1Title = serverProgram.matrixPlans.find((m: any) => m.weekNumber === 1)?.days?.Monday?.workoutTitle;
    const week2Title = serverProgram.matrixPlans.find((m: any) => m.weekNumber === 2)?.days?.Monday?.workoutTitle;

    expect(week1Title).toBe("Squat 110kg (Client A edit)");
    expect(week2Title).toBe("Squat 115kg (Client B edit)");
  });

  it("prevents resurrection of deleted records when Client B uploads an older snapshot", async () => {
    let serverDoc: any = {
      workouts: [
        { id: "w_kept", date: "2026-09-10", title: "Kept Workout", durationMinutes: 45, exercises: [], updatedAt: "2026-09-10T10:00:00Z" },
        { id: "w_deleted", date: "2026-09-12", title: "To Delete", durationMinutes: 45, exercises: [], updatedAt: "2026-09-12T10:00:00Z" }
      ],
      programs: [],
      matrixPlans: [],
      bodyCompRecords: [],
      userProfile: dummyProfile,
      healthMetrics: dummyHealth,
      supplements: [],
      supplementCategories: [],
      progressPhotos: [],
      sessionFeelings: [],
      activeProgramId: "",
      completedDaysRecord: {},
      customExercises: [],
      tombstones: { workouts: {}, programs: {}, bodyComp: {} },
      revision: 1
    };

    const mockRunTx = async (_db: any, fn: any) => {
      const tx = {
        get: async () => ({ exists: () => true, data: () => JSON.parse(JSON.stringify(serverDoc)) }),
        set: (_ref: any, d: any) => { serverDoc = JSON.parse(JSON.stringify(d)); }
      };
      return await fn(tx);
    };
    const mockDoc = () => "p";

    // Client A deletes w_deleted and creates a tombstone
    const clientAData: LocalSyncSnapshot = {
      workouts: [{ id: "w_kept", date: "2026-09-10", title: "Kept Workout", durationMinutes: 45, exercises: [], updatedAt: "2026-09-10T10:00:00Z" }],
      matrixPlans: [],
      bodyCompRecords: [],
      userProfile: dummyProfile,
      healthMetrics: dummyHealth,
      supplements: [],
      supplementCategories: [],
      progressPhotos: [],
      sessionFeelings: [],
      programs: [],
      activeProgramId: "",
      completedDaysRecord: {},
      customExercises: []
    };
    const clientATombstones: TombstoneStore = {
      workouts: { "w_deleted": "2026-09-18T12:00:00.000Z" },
      programs: {},
      bodyComp: {}
    };

    await executeTransactionalSync(null, "uid", mockDoc, mockRunTx, clientAData, clientATombstones, "devA", 2);

    // Client B still has w_deleted in its local array because it was offline
    const clientBData: LocalSyncSnapshot = {
      workouts: [
        { id: "w_kept", date: "2026-09-10", title: "Kept Workout", durationMinutes: 45, exercises: [], updatedAt: "2026-09-10T10:00:00Z" },
        { id: "w_deleted", date: "2026-09-12", title: "To Delete", durationMinutes: 45, exercises: [], updatedAt: "2026-09-12T10:00:00Z" },
        { id: "w_new_b", date: "2026-09-19", title: "New Workout from B", durationMinutes: 50, exercises: [], updatedAt: "2026-09-19T10:00:00Z" }
      ],
      matrixPlans: [],
      bodyCompRecords: [],
      userProfile: dummyProfile,
      healthMetrics: dummyHealth,
      supplements: [],
      supplementCategories: [],
      progressPhotos: [],
      sessionFeelings: [],
      programs: [],
      activeProgramId: "",
      completedDaysRecord: {},
      customExercises: []
    };
    const clientBTombstones: TombstoneStore = { workouts: {}, programs: {}, bodyComp: {} };

    await executeTransactionalSync(null, "uid", mockDoc, mockRunTx, clientBData, clientBTombstones, "devB", 2);

    // Server document: w_deleted must NOT be resurrected, w_new_b must be present
    const finalWorkoutIds = serverDoc.workouts.map((w: any) => w.id);
    expect(finalWorkoutIds).toContain("w_kept");
    expect(finalWorkoutIds).toContain("w_new_b");
    expect(finalWorkoutIds).not.toContain("w_deleted");
  });
});
