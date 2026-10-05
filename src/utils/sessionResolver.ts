import {
  WorkoutSession,
  WeeklyMatrixPlan,
  MatrixDayCell,
  PlannedExercise,
  DayOfWeek,
  ExerciseLog
} from "../types";
import { getWorkoutDraft, listWorkoutDrafts, WorkoutDraft } from "./userStorage";
import { DAYS_OF_WEEK, computeDateForDay, getTodayDateStr, CANONICAL_PROGRAM_START_DATE } from "./fitnessData";
import { parseLocalDate, formatLocalDateISO, getWeekStartMonday, getDayOfWeekName, getDifferenceInDays, isValidDateStr } from "./dateUtils";
import { calculateSessionVolume, isSameExercise } from "./calculations";

export type SessionResolutionStatus = "completed" | "active" | "planned" | "rest" | "empty";

export interface ResolvedExerciseSet {
  setNumber: number;
  weight: number;
  reps: number;
  rpe?: number;
  completed: boolean;
  targetWeight?: number;
  targetReps?: string;
  setType?: "warmup" | "working" | "drop" | "failure";
}

export interface ResolvedExercise {
  id: string;
  exerciseName: string;
  muscleGroup: string;
  targetSets: number;
  targetReps: string;
  targetWeight?: number;
  equipmentType?: string;
  loadConvention?: string;
  machineId?: string;
  machineName?: string;
  stationLabel?: string;
  notes?: string;
  sets: ResolvedExerciseSet[];
}

export interface ResolvedSession {
  status: SessionResolutionStatus;
  isCompleted: boolean;
  isActive: boolean;
  isPlanned: boolean;
  isRest: boolean;
  source: "completed_workout" | "active_draft" | "matrix_plan" | "rest_day" | "none";
  weekNumber: number;
  dayOfWeek: DayOfWeek;
  dayKey: string;
  dateStr: string;
  title: string;
  targetMuscleGroup: string;
  notes?: string;
  gymId?: string;
  gymName?: string;
  completedWorkout?: WorkoutSession;
  activeDraft?: WorkoutDraft;
  plannedDay?: MatrixDayCell;
  exercises: ResolvedExercise[];
  totalVolume: number;
  totalSets: number;
  completedSets: number;
  durationMinutes?: number;
}

export interface SessionResolveQuery {
  date?: string;
  weekNumber?: number;
  dayOfWeek?: DayOfWeek;
  dayKey?: string;
  planId?: string;
  sessionId?: string;
  programId?: string;
}

export interface SessionResolveStore {
  workouts: WorkoutSession[];
  matrixPlans: WeeklyMatrixPlan[];
  completedDaysRecord?: Record<string, boolean>;
  userId?: string;
  activeProgramName?: string;
}

/**
 * Normalizes a number to at most 1 decimal place to prevent floating point artifacts
 * e.g., 47.519999999999996 -> 47.5
 */
export function cleanNumber(num: number | undefined | null, defaultValue: number = 0): number {
  if (num === undefined || num === null || isNaN(num)) return defaultValue;
  return Math.round(num * 10) / 10;
}

/**
 * Resolves a workout's canonical state and data across the application lifecycle.
 * STRICT ARCHITECTURAL HIERARCHY:
 *   1. COMPLETED WORKOUT (Historical fact - highest priority)
 *   2. ACTIVE DRAFT (Current in-progress performance)
 *   3. PLANNED WORKOUT (Intention - lowest priority)
 */
export function resolveSession(
  query: SessionResolveQuery,
  store: SessionResolveStore
): ResolvedSession {
  const { workouts = [], matrixPlans = [], completedDaysRecord = {}, userId } = store;

  // 1. Establish query identity parameters
  let targetDate: string | undefined = query.date;
  let targetWeekNumber = query.weekNumber;
  let targetDayOfWeek = query.dayOfWeek;
  let targetDayKey = query.dayKey;

  // If date was provided, derive missing week/day from date or matrixPlans if needed
  if (targetDate && (!targetWeekNumber || !targetDayOfWeek)) {
    // Attempt exact cell.date match in matrixPlans
    if (matrixPlans.length > 0) {
      for (const wp of matrixPlans) {
        for (const dName of DAYS_OF_WEEK) {
          const cell = wp.days?.[dName];
          if (cell && cell.date === targetDate) {
            targetWeekNumber = wp.weekNumber;
            targetDayOfWeek = dName;
            break;
          }
        }
        if (targetWeekNumber) break;
      }
    }

    // Accurate calculation using cycle start date
    if (!targetWeekNumber || !targetDayOfWeek) {
      const baseStartMonday = getWeekStartMonday(
        matrixPlans[0]?.startDate ||
        matrixPlans[0]?.days?.Monday?.date ||
        CANONICAL_PROGRAM_START_DATE
      );
      if (isValidDateStr(baseStartMonday) && isValidDateStr(targetDate)) {
        const diffDays = getDifferenceInDays(baseStartMonday, targetDate);
        if (diffDays >= 0) {
          targetWeekNumber = Math.floor(diffDays / 7) + 1;
        } else {
          targetWeekNumber = 1;
        }
      } else {
        targetWeekNumber = 1;
      }
      targetDayOfWeek = getDayOfWeekName(targetDate);
    }
  }

  // If neither date nor week/day were provided, default to today's date
  if (!targetDate && !targetWeekNumber && !targetDayOfWeek && !targetDayKey) {
    targetDate = getTodayDateStr();
  }

  // Fallbacks if still undefined
  const finalWeek = targetWeekNumber || 1;
  const finalDay: DayOfWeek = targetDayOfWeek || "Monday";
  const finalDayKey = targetDayKey || `w${finalWeek}-${finalDay}`;

  // Find the planned day in matrixPlans
  const weekPlan = matrixPlans.find((w) => w.weekNumber === finalWeek);
  const plannedDay = weekPlan?.days?.[finalDay];

  // If targetDate is still undefined, check plannedDay.date or compute from cycle base date
  if (!targetDate && plannedDay?.date) {
    targetDate = plannedDay.date;
  }
  if (!targetDate) {
    const baseStart =
      matrixPlans[0]?.startDate ||
      matrixPlans[0]?.days?.Monday?.date ||
      CANONICAL_PROGRAM_START_DATE;
    targetDate = computeDateForDay(baseStart, finalWeek, finalDay);
  }

  // --------------------------------------------------------------------------
  // LEVEL 1: CHECK FOR COMPLETED WORKOUT (HIGHEST PRIORITY)
  // --------------------------------------------------------------------------
  const matchingCompleted = workouts.find((w) => {
    // Strict date isolation: If query specifies targetDate and workout specifies date, they MUST match
    if (targetDate && w.date && w.date !== targetDate) {
      return false;
    }

    // 1. Match by sessionId
    if (query.sessionId && w.id === query.sessionId) return true;

    // 2. Match by planId
    if (query.planId && w.planId && w.planId === query.planId) return true;

    // 3. Match by exact calendar date (factual ground truth)
    if (targetDate && w.date === targetDate) {
      // If the workout also specifies a week or day, verify they don't contradict
      if (w.dayOfWeek && query.dayOfWeek && w.dayOfWeek !== finalDay) return false;
      return true;
    }

    // 4. Match by explicit dayKey (e.g. w1-Monday or 1-Monday) ONLY if workout date is not contradicting
    if (w.dayKey && (w.dayKey === finalDayKey || (query.dayKey && w.dayKey === query.dayKey) || w.dayKey === `${finalWeek}-${finalDay}`)) {
      const weekOk = !w.weekNumber || w.weekNumber === finalWeek;
      const dayOk = !w.dayOfWeek || w.dayOfWeek === finalDay;
      if (weekOk && dayOk) return true;
    }

    // 5. Match by weekNumber and dayOfWeek
    if (w.weekNumber === finalWeek && w.dayOfWeek === finalDay) {
      return true;
    }

    // 6. Match by tag in title or notes
    const text = `${w.title} ${w.notes || ""}`.toLowerCase();
    const tagMatch =
      text.includes(`w${finalWeek}-${finalDay.toLowerCase()}`) ||
      text.includes(`w${finalWeek} ${finalDay.toLowerCase()}`) ||
      text.includes(`week ${finalWeek} ${finalDay.toLowerCase()}`);
    if (tagMatch && w.exercises && w.exercises.length > 0) {
      const dayOk = !w.dayOfWeek || w.dayOfWeek === finalDay;
      if (dayOk) return true;
    }

    return false;
  });

  if (matchingCompleted) {
    // Format exercises from the completed workout
    const completedExercises: ResolvedExercise[] = (matchingCompleted.exercises || []).map((ex, idx) => {
      // Cross-reference with planned target specs if available
      const matchingPlannedEx = plannedDay?.exercises?.find(
        (p) => isSameExercise(p.exerciseName, ex.exerciseName)
      );

      const sets: ResolvedExerciseSet[] = (ex.sets || []).map((s, sIdx) => ({
        setNumber: s.setNumber || sIdx + 1,
        weight: cleanNumber(s.weight),
        reps: s.reps || 0,
        rpe: s.rpe,
        completed: true,
        targetWeight: matchingPlannedEx?.targetWeight !== undefined
          ? cleanNumber(matchingPlannedEx.targetWeight)
          : undefined,
        targetReps: matchingPlannedEx?.targetReps !== undefined
          ? String(matchingPlannedEx.targetReps)
          : undefined
      }));

      return {
        id: ex.id || `ex-${idx}`,
        exerciseName: ex.exerciseName,
        muscleGroup: ex.muscleGroup || "General",
        targetSets: matchingPlannedEx?.targetSets || sets.length,
        targetReps: matchingPlannedEx?.targetReps || "8-12",
        targetWeight: matchingPlannedEx?.targetWeight !== undefined
          ? cleanNumber(matchingPlannedEx.targetWeight)
          : undefined,
        sets
      };
    });

    const totalVol = calculateSessionVolume(matchingCompleted);
    const totalSets = completedExercises.reduce((acc, ex) => acc + ex.sets.length, 0);

    return {
      status: "completed",
      isCompleted: true,
      isActive: false,
      isPlanned: false,
      isRest: false,
      source: "completed_workout",
      weekNumber: matchingCompleted.weekNumber || finalWeek,
      dayOfWeek: (matchingCompleted.dayOfWeek as DayOfWeek) || finalDay,
      dayKey: matchingCompleted.dayKey || finalDayKey,
      dateStr: matchingCompleted.date || targetDate,
      title: matchingCompleted.title,
      targetMuscleGroup:
        (Array.isArray(plannedDay?.targetMuscleGroup)
          ? plannedDay?.targetMuscleGroup.join(" • ")
          : plannedDay?.targetMuscleGroup) ||
        matchingCompleted.exercises?.[0]?.muscleGroup ||
        "Strength Training",
      notes: matchingCompleted.notes,
      gymId: plannedDay?.gymId || matchingCompleted.gymId,
      gymName: plannedDay?.gymName || matchingCompleted.gymName,
      completedWorkout: matchingCompleted,
      plannedDay,
      exercises: completedExercises,
      totalVolume: cleanNumber(totalVol),
      totalSets,
      completedSets: totalSets,
      durationMinutes: matchingCompleted.durationMinutes || 60
    };
  }

  // --------------------------------------------------------------------------
  // LEVEL 2: CHECK FOR ACTIVE IN-PROGRESS DRAFT (MEDIUM PRIORITY)
  // --------------------------------------------------------------------------
  const candidateDraftKeys = [
    query.planId ? `plan_${query.planId}` : null,
    query.planId || null,
    `plan_${finalDayKey}`,
    finalDayKey,
    `plan_${targetDate}`,
    targetDate,
    query.sessionId ? `plan_${query.sessionId}` : null,
    query.sessionId || null,
    "free_workout"
  ].filter(Boolean) as string[];

  let activeDraft: WorkoutDraft | null = null;
  for (const draftKey of candidateDraftKeys) {
    const draft = getWorkoutDraft(userId, draftKey);
    if (draft && draft.exercises && draft.exercises.length > 0) {
      // Check if draft matches current target
      const draftMatches =
        (draft.activePlanMeta?.planId && draft.activePlanMeta.planId === query.planId) ||
        (draft.activePlanMeta?.weekNumber === finalWeek && draft.activePlanMeta?.dayOfWeek === finalDay) ||
        (draft.dayKey && draft.dayKey === finalDayKey) ||
        draft.date === targetDate ||
        draftKey === `plan_${query.planId}` ||
        draft.id === query.planId ||
        draft.id === query.sessionId;

      if (draftMatches) {
        activeDraft = draft;
        break;
      }
    }
  }

  // Fallback: check all drafts in local storage
  if (!activeDraft) {
    const allDrafts = listWorkoutDrafts(userId);
    activeDraft =
      allDrafts.find(
        (d) =>
          d.dayKey === finalDayKey ||
          (d.activePlanMeta?.weekNumber === finalWeek && d.activePlanMeta?.dayOfWeek === finalDay) ||
          (query.planId && (d.id === query.planId || d.activePlanMeta?.planId === query.planId)) ||
          d.date === targetDate
      ) || null;
  }

  if (activeDraft) {
    const activeExercises: ResolvedExercise[] = activeDraft.exercises.map((ex, idx) => {
      const matchingPlannedEx = plannedDay?.exercises?.find(
        (p) => isSameExercise(p.exerciseName, ex.exerciseName)
      );

      const sets: ResolvedExerciseSet[] = ex.sets.map((s, sIdx) => {
        const isSetCompleted =
          (s as any).completed === true ||
          (s as any).isCompleted === true ||
          (s as any).state === "done" ||
          ((s.reps || 0) > 0);

        return {
          setNumber: s.setNumber || sIdx + 1,
          weight: cleanNumber(s.weight),
          reps: s.reps || 0,
          rpe: s.rpe,
          completed: isSetCompleted,
          setType: (s as any).setType || "working",
          targetWeight: matchingPlannedEx?.targetWeight !== undefined
            ? cleanNumber(matchingPlannedEx.targetWeight)
            : undefined,
          targetReps: matchingPlannedEx?.targetReps !== undefined
            ? String(matchingPlannedEx.targetReps)
            : undefined
        };
      });

      return {
        id: ex.id || `draft-ex-${idx}`,
        exerciseName: ex.exerciseName,
        muscleGroup: ex.muscleGroup || "General",
        targetSets: matchingPlannedEx?.targetSets || sets.length,
        targetReps: matchingPlannedEx?.targetReps || "8-12",
        targetWeight: matchingPlannedEx?.targetWeight !== undefined
          ? cleanNumber(matchingPlannedEx.targetWeight)
          : undefined,
        equipmentType: (ex as any).equipmentType,
        loadConvention: (ex as any).loadConvention,
        machineId: (ex as any).machineId,
        machineName: (ex as any).machineName,
        stationLabel: (ex as any).stationLabel,
        notes: ex.notes,
        sets
      };
    });

    const completedSets = activeExercises.reduce(
      (acc, ex) => acc + ex.sets.filter((s) => s.completed).length,
      0
    );
    const totalSets = activeExercises.reduce((acc, ex) => acc + ex.sets.length, 0);
    const vol = activeExercises.reduce(
      (acc, ex) =>
        acc +
        ex.sets.reduce((sAcc, s) => sAcc + (s.completed ? s.weight * s.reps : 0), 0),
      0
    );

    return {
      status: "active",
      isCompleted: false,
      isActive: true,
      isPlanned: false,
      isRest: false,
      source: "active_draft",
      weekNumber: activeDraft.activePlanMeta?.weekNumber || finalWeek,
      dayOfWeek: activeDraft.activePlanMeta?.dayOfWeek || finalDay,
      dayKey: finalDayKey,
      dateStr: activeDraft.date || targetDate,
      title: activeDraft.title || plannedDay?.workoutTitle || `${finalDay} Workout`,
      targetMuscleGroup:
        (Array.isArray(plannedDay?.targetMuscleGroup)
          ? plannedDay?.targetMuscleGroup.join(" • ")
          : plannedDay?.targetMuscleGroup) || "Active Session",
      notes: activeDraft.notes,
      gymId: activeDraft.gymId,
      gymName: activeDraft.gymName,
      activeDraft,
      plannedDay,
      exercises: activeExercises,
      totalVolume: cleanNumber(vol),
      totalSets,
      completedSets,
      durationMinutes: activeDraft.durationMinutes || 60
    };
  }

  // --------------------------------------------------------------------------
  // LEVEL 3: CHECK FOR PLANNED WORKOUT OR REST DAY (LOWEST PRIORITY)
  // --------------------------------------------------------------------------
  if (plannedDay) {
    if (plannedDay.isRestDay || !plannedDay.exercises || plannedDay.exercises.length === 0) {
      return {
        status: "rest",
        isCompleted: false,
        isActive: false,
        isPlanned: false,
        isRest: true,
        source: "rest_day",
        weekNumber: finalWeek,
        dayOfWeek: finalDay,
        dayKey: finalDayKey,
        dateStr: targetDate,
        title: plannedDay.workoutTitle || "Full Rest & Recovery",
        targetMuscleGroup: "Rest & Active Recovery",
        notes: plannedDay.notes,
        gymId: plannedDay.gymId,
        gymName: plannedDay.gymName,
        plannedDay,
        exercises: [],
        totalVolume: 0,
        totalSets: 0,
        completedSets: 0
      };
    }

    // Planned training day: Planned reps are NEVER shown as actual completed reps
    const plannedExercises: ResolvedExercise[] = plannedDay.exercises.map((pEx, idx) => {
      const numSets = pEx.targetSets || 3;
      const plannedSetsList = pEx.sets && pEx.sets.length > 0 ? pEx.sets : [];

      const sets: ResolvedExerciseSet[] = Array.from({ length: numSets }, (_, sIdx) => {
        const pSet = plannedSetsList[sIdx];
        const targetWt = pSet?.weight !== undefined ? pSet.weight : pEx.targetWeight;
        const targetRp = pSet?.reps !== undefined ? pSet.reps : pEx.targetReps;
        return {
          setNumber: sIdx + 1,
          weight: cleanNumber(targetWt),
          reps: 0, // Uncompleted! Never show planned reps as actual completed reps
          completed: false,
          targetWeight: targetWt !== undefined ? cleanNumber(targetWt) : undefined,
          targetReps: targetRp !== undefined ? String(targetRp) : undefined
        };
      });

      return {
        id: `plan-ex-${idx}`,
        exerciseName: pEx.exerciseName,
        muscleGroup: pEx.muscleGroup,
        targetSets: numSets,
        targetReps: pEx.targetReps || "8-12",
        targetWeight: pEx.targetWeight !== undefined ? cleanNumber(pEx.targetWeight) : undefined,
        sets
      };
    });

    const totalPlannedSets = plannedExercises.reduce((acc, ex) => acc + ex.sets.length, 0);

    return {
      status: "planned",
      isCompleted: false,
      isActive: false,
      isPlanned: true,
      isRest: false,
      source: "matrix_plan",
      weekNumber: finalWeek,
      dayOfWeek: finalDay,
      dayKey: finalDayKey,
      dateStr: targetDate,
      title: plannedDay.workoutTitle || `${finalDay} Workout`,
      targetMuscleGroup:
        Array.isArray(plannedDay.targetMuscleGroup)
          ? plannedDay.targetMuscleGroup.join(" • ")
          : plannedDay.targetMuscleGroup || "General Training",
      notes: plannedDay.notes,
      gymId: plannedDay.gymId,
      gymName: plannedDay.gymName,
      plannedDay,
      exercises: plannedExercises,
      totalVolume: 0,
      totalSets: totalPlannedSets,
      completedSets: 0
    };
  }

  // --------------------------------------------------------------------------
  // LEVEL 4: NO PLAN / NO DATA FOUND
  // --------------------------------------------------------------------------
  return {
    status: "empty",
    isCompleted: false,
    isActive: false,
    isPlanned: false,
    isRest: false,
    source: "none",
    weekNumber: finalWeek,
    dayOfWeek: finalDay,
    dayKey: finalDayKey,
    dateStr: targetDate,
    title: `${finalDay} Workout`,
    targetMuscleGroup: "Open Training",
    exercises: [],
    totalVolume: 0,
    totalSets: 0,
    completedSets: 0
  };
}
