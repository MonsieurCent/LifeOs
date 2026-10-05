import { describe, it, expect, beforeEach } from "vitest";
import { resolveSession, cleanNumber } from "../utils/sessionResolver";
import { WorkoutSession, WeeklyMatrixPlan, DayOfWeek } from "../types";
import { saveWorkoutDraft, removeWorkoutDraft } from "../utils/userStorage";

// Polyfill localStorage for Vitest
if (typeof globalThis.localStorage === "undefined") {
  const store = new Map<string, string>();
  globalThis.localStorage = {
    getItem: (key: string) => store.get(key) || null,
    setItem: (key: string, value: string) => store.set(key, String(value)),
    removeItem: (key: string) => store.delete(key),
    clear: () => store.clear(),
    key: (index: number) => Array.from(store.keys())[index] || null,
    get length() {
      return store.size;
    }
  } as any;
}

describe("Canonical Workout Lifecycle & Session Resolution (Completed > Active > Planned)", () => {
  const testUserId = "user_test_resolver";

  const sampleMatrixPlans: WeeklyMatrixPlan[] = [
    {
      weekNumber: 1,
      startDate: "2026-09-15",
      days: {
        Monday: {
          day: "Monday",
          date: "2026-09-15",
          workoutTitle: "Chest & Triceps Hypertrophy",
          isRestDay: false,
          targetMuscleGroup: "Chest",
          exercises: [
            {
              exerciseName: "Barbell Bench Press",
              muscleGroup: "Chest",
              targetSets: 3,
              targetReps: "8-10",
              targetWeight: 80,
              sets: [
                { setNumber: 1, weight: 80, reps: "8-10" },
                { setNumber: 2, weight: 80, reps: "8-10" },
                { setNumber: 3, weight: 80, reps: "8-10" }
              ]
            }
          ]
        },
        Tuesday: {
          day: "Tuesday",
          date: "2026-09-16",
          workoutTitle: "Back & Biceps Power",
          isRestDay: false,
          targetMuscleGroup: "Back",
          exercises: [
            {
              exerciseName: "Lat Pulldown",
              muscleGroup: "Back",
              targetSets: 4,
              targetReps: "10-12",
              targetWeight: 65
            }
          ]
        },
        Wednesday: {
          day: "Wednesday",
          date: "2026-09-17",
          workoutTitle: "Rest & Active Recovery",
          isRestDay: true,
          targetMuscleGroup: "Rest",
          exercises: []
        },
        Thursday: { day: "Thursday", workoutTitle: "Thursday Session", isRestDay: false, exercises: [] },
        Friday: { day: "Friday", workoutTitle: "Friday Session", isRestDay: false, exercises: [] },
        Saturday: { day: "Saturday", workoutTitle: "Saturday Session", isRestDay: false, exercises: [] },
        Sunday: { day: "Sunday", workoutTitle: "Sunday Session", isRestDay: true, exercises: [] }
      }
    }
  ];

  beforeEach(() => {
    localStorage.clear();
  });

  it("1. Resolves Planned workout when neither completed nor active draft exists", () => {
    const resolved = resolveSession(
      { weekNumber: 1, dayOfWeek: "Monday", date: "2026-09-15" },
      {
        workouts: [],
        matrixPlans: sampleMatrixPlans,
        userId: testUserId
      }
    );

    expect(resolved.status).toBe("planned");
    expect(resolved.isPlanned).toBe(true);
    expect(resolved.isCompleted).toBe(false);
    expect(resolved.isActive).toBe(false);
    expect(resolved.completedSets).toBe(0);
    // CRITICAL: Planned reps are never reported as actual completed reps
    expect(resolved.exercises[0].sets[0].reps).toBe(0);
    expect(resolved.exercises[0].sets[0].completed).toBe(false);
    expect(resolved.exercises[0].sets[0].targetWeight).toBe(80);
    expect(resolved.exercises[0].sets[0].targetReps).toBe("8-10");
  });

  it("2. Resolves Active Draft over Planned when user has an ongoing session", () => {
    // Save draft for Monday
    saveWorkoutDraft(testUserId, {
      id: "plan_w1-Monday",
      uid: testUserId,
      title: "In-Progress Monday Chest",
      date: "2026-09-15",
      durationMinutes: 45,
      activePlanMeta: { weekNumber: 1, dayOfWeek: "Monday" },
      exercises: [
        {
          id: "ex-draft-1",
          exerciseName: "Barbell Bench Press",
          muscleGroup: "Chest",
          sets: [
            { id: "s-1", setNumber: 1, weight: 82.5, reps: 9, rpe: 8.5 } as any,
            { id: "s-2", setNumber: 2, weight: 82.5, reps: 8, rpe: 9 } as any
          ]
        }
      ],
      updatedAt: new Date().toISOString()
    });

    const resolved = resolveSession(
      { weekNumber: 1, dayOfWeek: "Monday", date: "2026-09-15" },
      {
        workouts: [],
        matrixPlans: sampleMatrixPlans,
        userId: testUserId
      }
    );

    expect(resolved.status).toBe("active");
    expect(resolved.isActive).toBe(true);
    expect(resolved.isCompleted).toBe(false);
    expect(resolved.completedSets).toBe(2);
    expect(resolved.exercises[0].sets[0].weight).toBe(82.5);
    expect(resolved.exercises[0].sets[0].reps).toBe(9);
  });

  it("3. Resolves Completed Workout as the absolute source of truth over Planned and Active", () => {
    // Even if an old draft exists in storage
    saveWorkoutDraft(testUserId, {
      id: "plan_w1-Monday",
      uid: testUserId,
      title: "Stale Draft",
      date: "2026-09-15",
      durationMinutes: 45,
      exercises: [
        {
          id: "ex-draft-1",
          exerciseName: "Barbell Bench Press",
          muscleGroup: "Chest",
          sets: [{ id: "s-1", setNumber: 1, weight: 70, reps: 5 }]
        }
      ],
      updatedAt: "2026-09-15T09:00:00Z"
    });

    // Historical completed workout
    const completedWorkout: WorkoutSession = {
      id: "workout-completed-101",
      date: "2026-09-15",
      dayOfWeek: "Monday",
      weekNumber: 1,
      dayKey: "w1-Monday",
      title: "Chest & Triceps Hypertrophy",
      durationMinutes: 58,
      notes: "Hit PR on top set.",
      exercises: [
        {
          id: "ex-c-1",
          exerciseName: "Barbell Bench Press",
          muscleGroup: "Chest",
          sets: [
            { id: "sc-1", setNumber: 1, weight: 85, reps: 8, rpe: 8.5 },
            { id: "sc-2", setNumber: 2, weight: 85, reps: 8, rpe: 9 },
            { id: "sc-3", setNumber: 3, weight: 85, reps: 7, rpe: 9.5 }
          ]
        }
      ]
    };

    const resolved = resolveSession(
      { weekNumber: 1, dayOfWeek: "Monday", date: "2026-09-15" },
      {
        workouts: [completedWorkout],
        matrixPlans: sampleMatrixPlans,
        userId: testUserId
      }
    );

    // Completed MUST win
    expect(resolved.status).toBe("completed");
    expect(resolved.isCompleted).toBe(true);
    expect(resolved.isActive).toBe(false);
    expect(resolved.isPlanned).toBe(false);
    expect(resolved.completedSets).toBe(3);
    expect(resolved.totalVolume).toBe(85 * 8 + 85 * 8 + 85 * 7); // 1955
    expect(resolved.exercises[0].sets[0].weight).toBe(85);
    expect(resolved.exercises[0].sets[0].reps).toBe(8);
  });

  it("4. Normalizes floating-point weight values (e.g. 47.519999999 -> 47.5)", () => {
    expect(cleanNumber(47.519999999999996)).toBe(47.5);
    expect(cleanNumber(82.5000000001)).toBe(82.5);
    expect(cleanNumber(100)).toBe(100);
    expect(cleanNumber(undefined, 0)).toBe(0);
  });

  it("5. Resolves Rest day cleanly", () => {
    const resolved = resolveSession(
      { weekNumber: 1, dayOfWeek: "Wednesday", date: "2026-09-17" },
      {
        workouts: [],
        matrixPlans: sampleMatrixPlans,
        userId: testUserId
      }
    );

    expect(resolved.status).toBe("rest");
    expect(resolved.isRest).toBe(true);
    expect(resolved.isCompleted).toBe(false);
    expect(resolved.exercises.length).toBe(0);
  });

  it("6. Complete Lifecycle: Plan -> Active -> Completed -> Refresh / Reopen maintains same data", () => {
    // Step 1: Initial state (Plan only)
    const initialPlanResolution = resolveSession(
      { weekNumber: 1, dayOfWeek: "Tuesday", date: "2026-09-16" },
      { workouts: [], matrixPlans: sampleMatrixPlans, userId: testUserId }
    );
    expect(initialPlanResolution.status).toBe("planned");
    expect(initialPlanResolution.completedSets).toBe(0);

    // Step 2: User starts logging at the gym (Active Draft saved)
    saveWorkoutDraft(testUserId, {
      id: "plan_w1-Tuesday",
      uid: testUserId,
      title: "Back & Biceps Power",
      date: "2026-09-16",
      durationMinutes: 45,
      activePlanMeta: { weekNumber: 1, dayOfWeek: "Tuesday" },
      exercises: [
        {
          id: "ex-1",
          exerciseName: "Lat Pulldown",
          muscleGroup: "Back",
          sets: [
            { id: "s-1", setNumber: 1, weight: 70, reps: 12, rpe: 8 } as any,
            { id: "s-2", setNumber: 2, weight: 70, reps: 10, rpe: 8.5 } as any
          ]
        }
      ],
      updatedAt: new Date().toISOString()
    });

    const activeResolution = resolveSession(
      { weekNumber: 1, dayOfWeek: "Tuesday", date: "2026-09-16" },
      { workouts: [], matrixPlans: sampleMatrixPlans, userId: testUserId }
    );
    expect(activeResolution.status).toBe("active");
    expect(activeResolution.completedSets).toBe(2);

    // Step 3: User finishes workout and saves
    const completedSession: WorkoutSession = {
      id: "workout-tues-actual",
      date: "2026-09-16",
      dayOfWeek: "Tuesday",
      weekNumber: 1,
      dayKey: "w1-Tuesday",
      title: "Back & Biceps Power",
      durationMinutes: 52,
      notes: "Felt strong today",
      exercises: [
        {
          id: "ex-1",
          exerciseName: "Lat Pulldown",
          muscleGroup: "Back",
          sets: [
            { id: "s-1", setNumber: 1, weight: cleanNumber(70), reps: 12, rpe: 8 },
            { id: "s-2", setNumber: 2, weight: cleanNumber(70), reps: 10, rpe: 8.5 },
            { id: "s-3", setNumber: 3, weight: cleanNumber(70), reps: 9, rpe: 9 }
          ]
        }
      ]
    };
    // Draft is cleaned on finish
    removeWorkoutDraft(testUserId, "plan_w1-Tuesday");

    // Step 4: Page reloaded / refreshed (simulating another session or device view)
    const afterReloadResolution = resolveSession(
      { weekNumber: 1, dayOfWeek: "Tuesday", date: "2026-09-16" },
      {
        workouts: [completedSession],
        matrixPlans: sampleMatrixPlans,
        completedDaysRecord: { "w1-Tuesday": true },
        userId: testUserId
      }
    );

    // Confirms that completed workout is the source of truth, NOT the planned sets
    expect(afterReloadResolution.status).toBe("completed");
    expect(afterReloadResolution.isCompleted).toBe(true);
    expect(afterReloadResolution.completedSets).toBe(3);
    expect(afterReloadResolution.totalVolume).toBe(70 * 12 + 70 * 10 + 70 * 9); // 2170
    expect(afterReloadResolution.completedWorkout?.id).toBe("workout-tues-actual");
  });

  it("7. Real-world Overhead Press scenario: 26 kg × 10, 9, 10 across Dashboard, Today's Session & Planner", () => {
    const todayStr = new Date().toISOString().split("T")[0];
    const planMeta = { weekNumber: 1, dayOfWeek: "Monday" as DayOfWeek, date: todayStr };

    const matrixWithOverheadPress: WeeklyMatrixPlan[] = [
      {
        weekNumber: 1,
        startDate: todayStr,
        days: {
          Monday: {
            day: "Monday",
            date: todayStr,
            workoutTitle: "Push Strength Day",
            isRestDay: false,
            targetMuscleGroup: "Shoulders",
            exercises: [
              {
                exerciseName: "Overhead Press",
                muscleGroup: "Shoulders",
                targetSets: 3,
                targetReps: "7-10",
                targetWeight: 26,
                sets: [
                  { setNumber: 1, weight: 26, reps: "7-10" },
                  { setNumber: 2, weight: 26, reps: "7-10" },
                  { setNumber: 3, weight: 26, reps: "7-10" }
                ]
              }
            ]
          },
          Tuesday: { day: "Tuesday", isRestDay: true, workoutTitle: "Rest", exercises: [] },
          Wednesday: { day: "Wednesday", isRestDay: true, workoutTitle: "Rest", exercises: [] },
          Thursday: { day: "Thursday", isRestDay: true, workoutTitle: "Rest", exercises: [] },
          Friday: { day: "Friday", isRestDay: true, workoutTitle: "Rest", exercises: [] },
          Saturday: { day: "Saturday", isRestDay: true, workoutTitle: "Rest", exercises: [] },
          Sunday: { day: "Sunday", isRestDay: true, workoutTitle: "Rest", exercises: [] }
        }
      }
    ];

    // Pre-workout verification (Planned)
    const plannedRes = resolveSession(planMeta, {
      workouts: [],
      matrixPlans: matrixWithOverheadPress,
      userId: testUserId
    });
    expect(plannedRes.status).toBe("planned");
    expect(plannedRes.isCompleted).toBe(false);

    // Actual workout logged by user
    const completedWorkout: WorkoutSession = {
      id: "workout_ohp_verified",
      title: "Push Strength Day",
      date: todayStr,
      dayOfWeek: "Monday",
      weekNumber: 1,
      dayKey: "w1-Monday",
      durationMinutes: 45,
      exercises: [
        {
          id: "ex_ohp",
          exerciseName: "Overhead Press",
          muscleGroup: "Shoulders",
          sets: [
            { id: "s1", setNumber: 1, weight: 26, reps: 10, rpe: 8 },
            { id: "s2", setNumber: 2, weight: 26, reps: 9, rpe: 8.5 },
            { id: "s3", setNumber: 3, weight: 26, reps: 10, rpe: 9.5 }
          ]
        }
      ]
    };

    const completedDays = { "w1-Monday": true };

    // Post-workout verification across all 3 subsystems
    const finalResolution = resolveSession(planMeta, {
      workouts: [completedWorkout],
      matrixPlans: matrixWithOverheadPress,
      completedDaysRecord: completedDays,
      userId: testUserId
    });

    // 1. Dashboard verification
    expect(finalResolution.status).toBe("completed");
    expect(finalResolution.isCompleted).toBe(true);
    expect(finalResolution.completedWorkout?.id).toBe("workout_ohp_verified");
    expect(finalResolution.totalVolume).toBe(26 * 10 + 26 * 9 + 26 * 10); // 754 kg
    expect(finalResolution.completedSets).toBe(3);

    // 2. Today's Session verification: Must show 10 / 9 / 10 as actual reps
    const ohpExercise = finalResolution.completedWorkout?.exercises[0];
    expect(ohpExercise?.exerciseName).toBe("Overhead Press");
    const repSequence = ohpExercise?.sets.map((s) => s.reps);
    expect(repSequence).toEqual([10, 9, 10]);

    const weightSequence = ohpExercise?.sets.map((s) => s.weight);
    expect(weightSequence).toEqual([26, 26, 26]);

    // 3. Planner verification: Marked as Completed
    expect(completedDays["w1-Monday"]).toBe(true);
    expect(finalResolution.isCompleted).toBe(true);

    // 4. Opening session from planner verification
    expect(finalResolution.completedWorkout?.exercises[0].sets.length).toBe(3);
    expect(finalResolution.completedWorkout?.exercises[0].sets[1].reps).toBe(9);
  });

  it("8. Resolves Wednesday Sep 23, 2026 to Week 2 Wednesday and strictly isolates from Monday Sep 14", () => {
    const singleMuscleMatrix: WeeklyMatrixPlan[] = [
      {
        weekNumber: 1,
        startDate: "2026-09-14",
        days: {
          Monday: { day: "Monday", date: "2026-09-14", workoutTitle: "Day 1 (Back & Rear Delts)", isRestDay: false, exercises: [{ exerciseName: "Pulldown", muscleGroup: "Back", targetSets: 3, targetReps: "8-12" }] },
          Tuesday: { day: "Tuesday", date: "2026-09-15", workoutTitle: "Day 2 (Chest)", isRestDay: false, exercises: [] },
          Wednesday: { day: "Wednesday", date: "2026-09-16", workoutTitle: "Day 3 (Fullbody & Core)", isRestDay: false, exercises: [] },
          Thursday: { day: "Thursday", date: "2026-09-17", workoutTitle: "Day 4 (Shoulders)", isRestDay: false, exercises: [] },
          Friday: { day: "Friday", date: "2026-09-18", workoutTitle: "Day 5 (Arms)", isRestDay: false, exercises: [] },
          Saturday: { day: "Saturday", date: "2026-09-19", workoutTitle: "Day 6 (Legs)", isRestDay: false, exercises: [] },
          Sunday: { day: "Sunday", date: "2026-09-20", workoutTitle: "Rest Day", isRestDay: true, exercises: [] }
        }
      },
      {
        weekNumber: 2,
        startDate: "2026-09-21",
        days: {
          Monday: { day: "Monday", date: "2026-09-21", workoutTitle: "Day 1 (Back & Rear Delts)", isRestDay: false, exercises: [] },
          Tuesday: { day: "Tuesday", date: "2026-09-22", workoutTitle: "Day 2 (Chest)", isRestDay: false, exercises: [] },
          Wednesday: { day: "Wednesday", date: "2026-09-23", workoutTitle: "Day 3 (Fullbody & Core)", isRestDay: false, exercises: [{ exerciseName: "Squat", muscleGroup: "Legs", targetSets: 3, targetReps: "8-12" }] },
          Thursday: { day: "Thursday", date: "2026-09-24", workoutTitle: "Day 4 (Shoulders)", isRestDay: false, exercises: [] },
          Friday: { day: "Friday", date: "2026-09-25", workoutTitle: "Day 5 (Arms)", isRestDay: false, exercises: [] },
          Saturday: { day: "Saturday", date: "2026-09-26", workoutTitle: "Day 6 (Legs)", isRestDay: false, exercises: [] },
          Sunday: { day: "Sunday", date: "2026-09-27", workoutTitle: "Rest Day", isRestDay: true, exercises: [] }
        }
      }
    ];

    const completedWedWorkout: WorkoutSession = {
      id: "workout_wed_23",
      title: "Day 3 (Fullbody & Core)",
      date: "2026-09-23",
      dayOfWeek: "Wednesday",
      weekNumber: 2,
      dayKey: "w2-Wednesday",
      durationMinutes: 50,
      exercises: [
        {
          id: "ex_squat",
          exerciseName: "Squat",
          muscleGroup: "Legs",
          sets: [{ id: "s1", setNumber: 1, weight: 100, reps: 10 }]
        }
      ]
    };

    // Resolving Wednesday Sep 23rd with only date provided
    const wedResolution = resolveSession(
      { date: "2026-09-23" },
      {
        workouts: [completedWedWorkout],
        matrixPlans: singleMuscleMatrix,
        userId: testUserId
      }
    );

    expect(wedResolution.weekNumber).toBe(2);
    expect(wedResolution.dayOfWeek).toBe("Wednesday");
    expect(wedResolution.isCompleted).toBe(true);
    expect(wedResolution.completedWorkout?.id).toBe("workout_wed_23");

    // Resolving Monday Sep 14th must NOT match the Wednesday 23rd workout
    const monResolution = resolveSession(
      { date: "2026-09-14", weekNumber: 1, dayOfWeek: "Monday", dayKey: "w1-Monday" },
      {
        workouts: [completedWedWorkout],
        matrixPlans: singleMuscleMatrix,
        userId: testUserId
      }
    );

    expect(monResolution.weekNumber).toBe(1);
    expect(monResolution.dayOfWeek).toBe("Monday");
    expect(monResolution.isCompleted).toBe(false);
    expect(monResolution.completedWorkout).toBeUndefined();
  });
});
