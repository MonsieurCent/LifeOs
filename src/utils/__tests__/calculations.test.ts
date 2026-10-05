/**
 * Focused test suite for calculations and business rules
 */
import { describe, it } from "vitest";
import {
  calculate1RM,
  calculateSessionVolume,
  calculateSessionSets,
  calculateTotalWorkoutsVolume,
  calculateAverageWorkoutVolume,
  calculatePlannedSessionVolume,
  calculatePlannedSessionSets,
  calculatePersonalRecords,
  getKeyLiftPR,
  calculateProgressPercentage,
  calculatePercentageChange,
  calculateWeeklyConsistency,
  calculateHormoneAndMacroPlan,
  calculateMacroCalories,
  calculateMacroPercentages,
  calculateCaloricBalance,
  calculateLeanMassKg,
  calculateFatMassKg,
  getRecordMusclePercent,
  calculateBodyCompositionChanges,
  convertWeight,
  formatWeight,
  formatVolume,
  formatDelta,
  calculateSupplementAdherence,
  LBS_PER_KG
} from "../calculations";
import { WorkoutSession, BodyCompositionRecord, SupplementEntry } from "../../types";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

function assertEquals(actual: any, expected: any, message: string) {
  if (actual !== expected) {
    throw new Error(`Assertion failed: ${message}. Expected: ${expected}, Actual: ${actual}`);
  }
}

function assertCloseTo(actual: number, expected: number, delta: number = 0.01, message: string = "") {
  if (Math.abs(actual - expected) > delta) {
    throw new Error(`Assertion failed: ${message}. Expected ~${expected}, got ${actual} (diff: ${Math.abs(actual - expected)})`);
  }
}

describe("Calculations & Business Rules", () => {
  it("passes all calculations and business rules checks", () => {
    // 1. 1RM Brzycki calculations
{
  assertEquals(calculate1RM(0, 5), 0, "1RM should be 0 when weight is 0");
  assertEquals(calculate1RM(100, 0), 0, "1RM should be 0 when reps are 0");
  assertEquals(calculate1RM(100, 1), 100, "1RM at 1 rep equals the weight lifted");
  // 100kg for 5 reps: 100 * (36 / (37 - 5)) = 100 * (36 / 32) = 112.5
  assertCloseTo(calculate1RM(100, 5), 112.5, 0.001, "100kg x 5 reps e1RM is 112.5");
  assertEquals(calculate1RM(100, 5, 1), 112.5, "1RM with rounding to 1 decimal");
  assertEquals(calculate1RM(100, 40), 100, "1RM safety guard for reps >= 36");
}

// 2. Workout Volume and Sets calculations
{
  const mockWorkout: WorkoutSession = {
    id: "w1",
    date: "2026-09-14",
    title: "Back Day",
    durationMinutes: 60,
    exercises: [
      {
        id: "ex1",
        exerciseName: "Pulldowns",
        muscleGroup: "Back",
        sets: [
          { id: "s1", setNumber: 1, weight: 110, reps: 10 },
          { id: "s2", setNumber: 2, weight: 110, reps: 10 },
          { id: "s3", setNumber: 3, weight: 110, reps: 10 }
        ]
      },
      {
        id: "ex2",
        exerciseName: "T-bar row",
        muscleGroup: "Back",
        sets: [
          { id: "s4", setNumber: 1, weight: 75, reps: 12 },
          { id: "s5", setNumber: 2, weight: 75, reps: 12 },
          { id: "s6", setNumber: 3, weight: 0, reps: 0 } // invalid/skipped set
        ]
      }
    ]
  };

  // Pulldowns: 110*10*3 = 3300. T-bar: 75*12*2 = 1800. Total = 5100
  assertEquals(calculateSessionVolume(mockWorkout), 5100, "Session volume sums valid sets only");
  assertEquals(calculateSessionSets(mockWorkout), 5, "Completed sets count ignores 0-weight/0-rep sets");

  const archivedWorkout: any = { ...mockWorkout, id: "w2", isArchived: true };
  assertEquals(calculateSessionVolume(archivedWorkout), 0, "Archived workout volume returns 0");

  const deletedWorkout: any = { ...mockWorkout, id: "w3", isDeleted: true };
  assertEquals(calculateSessionVolume(deletedWorkout), 0, "Deleted workout volume returns 0");

  assertEquals(calculateTotalWorkoutsVolume([mockWorkout, archivedWorkout]), 5100, "Total volume ignores archived workouts");
  assertEquals(calculateAverageWorkoutVolume([mockWorkout, archivedWorkout]), 5100, "Average volume ignores archived workouts in count and volume");
}

// 3. Planned Volume and Sets
{
  const planned = [
    { exerciseName: "Squat", muscleGroup: "Legs" as const, targetSets: 3, targetReps: "8", targetWeight: 100 },
    { exerciseName: "Bench", muscleGroup: "Chest" as const, targetSets: 4, targetReps: "8-12", targetWeight: 80 }
  ];
  // Squat: 3 * 8 * 100 = 2400. Bench: 4 * 10 (avg of 8-12) * 80 = 3200. Total = 5600
  assertEquals(calculatePlannedSessionVolume(planned), 5600, "Planned volume calculation with rep range");
  assertEquals(calculatePlannedSessionSets(planned), 7, "Planned sets sum");
}

// 4. Personal Records (PR) and Key Lift extraction
{
  const workouts: WorkoutSession[] = [
    {
      id: "w1",
      date: "2026-08-01",
      title: "Chest Day",
      durationMinutes: 55,
      exercises: [
        {
          id: "ex1",
          exerciseName: "Barbell Bench Press",
          muscleGroup: "Chest",
          sets: [{ id: "s1", setNumber: 1, weight: 90, reps: 5 }] // e1rm = 90 * (36/32) = 101.25 -> 101.3
        }
      ]
    },
    {
      id: "w2",
      date: "2026-08-15",
      title: "Chest Day",
      durationMinutes: 60,
      exercises: [
        {
          id: "ex2",
          exerciseName: "Flat Barbell Bench Press",
          muscleGroup: "Chest",
          sets: [{ id: "s2", setNumber: 1, weight: 100, reps: 5 }] // e1rm = 100 * (36/32) = 112.5
        }
      ]
    }
  ];

  const benchPR = getKeyLiftPR(workouts, "bench");
  assertEquals(benchPR.weight, 100, "Bench PR resolves highest e1rm across alias names");
  assertEquals(benchPR.reps, 5, "Bench PR reps matches best set");
  assertEquals(benchPR.date, "2026-08-15", "Bench PR date matches session date");
}

// 5. Progress Percentage & Missing Data Handling
{
  // Missing data should return null, NOT 0
  assertEquals(calculateProgressPercentage(undefined, 100), null, "Undefined current should return null");
  assertEquals(calculateProgressPercentage(null, 100), null, "Null current should return null");
  assertEquals(calculateProgressPercentage(50, 0), null, "Target of 0 should return null (prevent div by 0)");
  assertEquals(calculateProgressPercentage(50, -10), null, "Negative target should return null");

  // Recorded zero should return 0%
  assertEquals(calculateProgressPercentage(0, 100), 0, "Recorded zero should return 0%");
  assertEquals(calculateProgressPercentage(50, 100), 50, "50 / 100 is 50%");
  assertEquals(calculateProgressPercentage(150, 100, { maxCap: 100 }), 100, "Capped at maxCap");
}

// 6. Percentage Change
{
  assertEquals(calculatePercentageChange(110, 100), 10, "100 to 110 is +10%");
  assertEquals(calculatePercentageChange(90, 100), -10, "100 to 90 is -10%");
  assertEquals(calculatePercentageChange(undefined, 100), null, "Missing current returns null");
  assertEquals(calculatePercentageChange(100, undefined), null, "Missing previous returns null");
  assertEquals(calculatePercentageChange(0, 0), 0, "0 to 0 is 0%");
  assertEquals(calculatePercentageChange(50, 0), null, "0 to 50 cannot divide by 0");
}

// 7. Unit Conversions & Rounding
{
  assertCloseTo(convertWeight(100, "kg", "lbs")!, 220.462, 0.01, "100kg converts to ~220.46 lbs");
  assertCloseTo(convertWeight(220.462262185, "lbs", "kg")!, 100, 0.001, "lbs to kg exact inverse");
  assertEquals(convertWeight(null, "kg", "lbs"), null, "Preserves null");
  assertEquals(convertWeight(undefined, "kg", "lbs"), null, "Preserves undefined");

  assertEquals(formatWeight(81.25, "kg", 1), "81.3", "Formats kg with 1 decimal");
  assertEquals(formatWeight(null, "kg"), "—", "Missing weight displays em-dash");

  assertEquals(formatVolume(5000, "kg", 0), "5,000", "Volume formatted with commas");
  assertEquals(formatDelta(2.5, "kg", 1, true), "+2.5 kg", "Positive delta with sign and unit");
  assertEquals(formatDelta(-1.2, "%", 1, true), "-1.2 %", "Negative delta");
}

// 8. Nutrition & Hormone Macro Rules
{
  const maleBulk = calculateHormoneAndMacroPlan("male", "bulk", 80);
  assertEquals(maleBulk.totalCalories, 80 * 37, "Male bulk calories (weight * 37)");
  assertEquals(maleBulk.proteinGrams, Math.round(80 * 2.1), "Male bulk protein (80 * 2.1g/kg)");
  assertEquals(maleBulk.fatGrams, Math.round(80 * 1.05), "Male bulk fat floor (80 * 1.05g/kg)");
  assert(maleBulk.carbsGrams > 0, "Carbs allocated from remainder");
  assertEquals(maleBulk.proteinCalories, maleBulk.proteinGrams * 4, "Protein calories = g * 4");
  assertEquals(maleBulk.fatCalories, maleBulk.fatGrams * 9, "Fat calories = g * 9");
  assert(maleBulk.hormoneInsights.length >= 2, "Includes hormone insights");

  const femaleShred = calculateHormoneAndMacroPlan("female", "shred", 60);
  assertEquals(femaleShred.totalCalories, 60 * 27, "Female shred calories (weight * 27)");
  assertEquals(femaleShred.fatGrams, Math.round(60 * 0.95), "Female shred fat floor (60 * 0.95g/kg)");
}

// 9. Caloric Balance
{
  const balance1 = calculateCaloricBalance(2500, 2200);
  assertEquals(balance1.status, "surplus", "+300 kcal is surplus");
  assertEquals(balance1.balance, 300, "Surplus amount is 300");

  const balance2 = calculateCaloricBalance(1800, 2300);
  assertEquals(balance2.status, "deficit", "-500 kcal is deficit");
  assertEquals(balance2.balance, -500, "Deficit amount is -500");

  const balance3 = calculateCaloricBalance(null, 2300);
  assertEquals(balance3.status, "unknown", "Missing consumed calories is unknown");
  assertEquals(balance3.balance, null, "Missing consumed calories balance is null");
}

// 10. Body Composition
{
  const baseline: BodyCompositionRecord = {
    id: "bc-1",
    date: "2026-08-01",
    weightKg: 84.0,
    bodyFatPercent: 18.0,
    muscleMassPercent: 43.0
  };

  const latest: BodyCompositionRecord = {
    id: "bc-2",
    date: "2026-09-01",
    weightKg: 81.0,
    bodyFatPercent: 15.0,
    muscleMassPercent: 45.0
  };

  const changes = calculateBodyCompositionChanges(latest, baseline, "kg");
  assertEquals(changes.weightChange, -3.0, "Weight lost is -3.0 kg");
  assertEquals(changes.bodyFatChange, -3.0, "Body fat dropped by 3.0 % points");
  assertEquals(changes.muscleChange, 2.0, "Muscle percent gained by 2.0 % points");
  assert(changes.leanMassChange !== null, "Lean mass change calculated");
}

// 11. Supplement Adherence
{
  const supplements: SupplementEntry[] = [
    { id: "s1", name: "Creatine", dosage: "5g", category: "creatine", timeOfDay: "post-workout", taken: true, streakDays: 14 },
    { id: "s2", name: "Omega 3", dosage: "2 capsules", category: "omega", timeOfDay: "morning", taken: true, streakDays: 20 },
    { id: "s3", name: "Vitamin D3", dosage: "5000 IU", category: "vitamins", timeOfDay: "morning", taken: false, streakDays: 0 }
  ];

  const adherence = calculateSupplementAdherence(supplements);
  assertEquals(adherence.totalCount, 3, "Total supplements is 3");
  assertEquals(adherence.takenCount, 2, "Taken supplements is 2");
  assertCloseTo(adherence.adherencePercent, 66.67, 0.1, "Adherence is 66.7%");
  assertEquals(adherence.maxStreakDays, 20, "Max streak is 20 days");
}

// 12. Weekly Consistency Multi-Horizon & New Week Boundary Handling
{
  // Simulate an athlete who logged 35,000 kg in the prior week (e.g. Week 3)
  // and has just started the new week on Monday (0 kg completed so far)
  const priorWeekMonday = "2026-09-28";
  const priorWeekSaturday = "2026-10-03";
  const mockWeek3Workouts: WorkoutSession[] = [
    {
      id: "w3-1",
      date: priorWeekMonday,
      title: "Day 1 (Back)",
      durationMinutes: 60,
      weekNumber: 3,
      exercises: [
        {
          id: "ex1",
          exerciseName: "Pulldown",
          muscleGroup: "Back",
          sets: [{ id: "s1", setNumber: 1, weight: 100, reps: 10 }] // 1000 kg
        }
      ]
    },
    {
      id: "w3-2",
      date: priorWeekSaturday,
      title: "Day 6 (Legs)",
      durationMinutes: 60,
      weekNumber: 3,
      exercises: [
        {
          id: "ex2",
          exerciseName: "Squat",
          muscleGroup: "Legs",
          sets: [{ id: "s2", setNumber: 1, weight: 100, reps: 20 }] // 2000 kg
        }
      ]
    }
  ];

  const result = calculateWeeklyConsistency(mockWeek3Workouts, 4);
  assertEquals(result.volumePreviousWeek, 3000, "Prior week volume correctly summed as 3000 kg");
  assertEquals(result.volumeThisWeek, 0, "Current week is 0 kg before new session is logged");
  assertEquals(result.isNewWeekStarting, true, "isNewWeekStarting flags that current week has 0 kg while prior week has volume");
  assertEquals(result.lastActiveWeekVolume, 3000, "lastActiveWeekVolume preserves prior week volume (3000 kg) for smart dashboard fallback");
  assertEquals(result.effectiveDisplayVolume, 3000, "effectiveDisplayVolume returns 3000 kg rather than showing empty 0 kg");
}

  console.log("✅ All calculations & business rules unit tests PASSED successfully!");
  });
});
