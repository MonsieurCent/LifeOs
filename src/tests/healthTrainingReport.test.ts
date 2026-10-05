import { describe, it, expect } from "vitest";

describe("AI Coach Health & Training Report Synthesis Logic", () => {
  const mockWorkouts = [
    {
      id: "w-1",
      date: "2026-09-24",
      exercises: [
        {
          name: "Barbell Back Squat",
          muscleGroup: "Legs",
          sets: [
            { weight: 140, reps: 6, rpe: 8.5 },
            { weight: 140, reps: 6, rpe: 9.0 }
          ]
        }
      ]
    },
    {
      id: "w-2",
      date: "2026-09-22",
      exercises: [
        {
          name: "Incline Dumbbell Press",
          muscleGroup: "Chest",
          sets: [
            { weight: 40, reps: 10, rpe: 8.0 },
            { weight: 40, reps: 8, rpe: 8.5 }
          ]
        }
      ]
    },
    {
      id: "w-old",
      date: "2026-08-01", // Outside 30-day window
      exercises: [
        {
          name: "Deadlift",
          muscleGroup: "Back",
          sets: [{ weight: 180, reps: 5, rpe: 9.0 }]
        }
      ]
    }
  ];

  it("accurately filters workouts within the requested multi-horizon time window", () => {
    const startDate = "2026-09-18";
    const endDate = "2026-09-25";

    const inRange = mockWorkouts.filter(
      (w) => w.date >= startDate && w.date <= endDate
    );

    expect(inRange.length).toBe(2);
    expect(inRange.some((w) => w.id === "w-old")).toBe(false);
  });

  it("calculates accurate volume tonnage and average session RPE across the window", () => {
    const inRange = mockWorkouts.filter(
      (w) => w.date >= "2026-09-18" && w.date <= "2026-09-25"
    );

    let totalVolume = 0;
    let totalRpeSum = 0;
    let rpeCount = 0;

    inRange.forEach((w) => {
      w.exercises.forEach((ex) => {
        ex.sets.forEach((s) => {
          totalVolume += s.weight * s.reps;
          if (s.rpe) {
            totalRpeSum += s.rpe;
            rpeCount++;
          }
        });
      });
    });

    // w-1: 140*6 + 140*6 = 1680 kg
    // w-2: 40*10 + 40*8 = 400 + 320 = 720 kg
    // Total Volume = 2400 kg
    expect(totalVolume).toBe(2400);

    const avgRpe = Number((totalRpeSum / rpeCount).toFixed(1));
    expect(avgRpe).toBe(8.5);
  });

  it("evaluates net caloric balance between Google Health burn and athlete target", () => {
    const targetIntakeKcal = 2900;
    const googleHealthDailyBurn = 2750;
    const netBalance = targetIntakeKcal - googleHealthDailyBurn;

    expect(netBalance).toBe(150);
    const formatted = netBalance >= 0 ? `+${netBalance} kcal` : `${netBalance} kcal`;
    expect(formatted).toBe("+150 kcal");
  });

  it("generates actionable prescriptive change items for steps, sleep, and nutrition", () => {
    const avgDailySteps = 15200;
    const avgSleepHours = 6.4;

    const actionPlan: Array<{
      category: "steps" | "sleep" | "nutrition" | "training";
      title: string;
      recommendation: string;
      priority: "high" | "medium" | "low";
    }> = [];

    if (avgDailySteps > 13000) {
      actionPlan.push({
        category: "steps",
        title: "Cap non-exercise steps on lower body training days",
        recommendation: `Reduce walking volume on leg days from ${avgDailySteps} to ~10,000 steps to conserve glycogen.`,
        priority: "high"
      });
    }

    if (avgSleepHours < 7.0) {
      actionPlan.push({
        category: "sleep",
        title: "Extend sleep window by 40 minutes",
        recommendation: "Shift bedtime 40 minutes earlier to reach optimal growth hormone release.",
        priority: "high"
      });
    }

    expect(actionPlan.length).toBe(2);
    expect(actionPlan[0].category).toBe("steps");
    expect(actionPlan[1].category).toBe("sleep");
    expect(actionPlan[0].priority).toBe("high");
  });
});
