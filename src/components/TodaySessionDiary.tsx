import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  TrainingProgram,
  WeeklyMatrixPlan,
  DayOfWeek,
  PlannedExercise,
  WeightUnit,
  WorkoutSession,
  SessionFeeling,
  ExerciseLog,
  MuscleGroup,
  MatrixDayCell,
  PlannedSet,
  Gym,
  GymMachine,
  EquipmentType,
  EQUIPMENT_LABELS
} from "../types";
import { DAYS_OF_WEEK, getTodayDateStr, computeDateForDay, findPlannedSessionForDate, CANONICAL_PROGRAM_START_DATE } from "../utils/fitnessData";
import { GymLocationSelector } from "./GymLocationSelector";
import { GymCheckInWidget } from "./GymCheckInWidget";
import { getDifferenceInDays, getDayOfWeekName, isValidDateStr } from "../utils/dateUtils";
import { getFullExerciseCatalog, saveCustomExerciseToCatalog } from "../utils/calculations";
import { resolveSession, cleanNumber } from "../utils/sessionResolver";
import {
  getStoredGyms,
  addOrUpdateGym,
  addOrUpdateMachine,
  getWorkoutDraft,
  saveWorkoutDraft,
  clearWorkoutDraft,
  logOperation
} from "../utils/userStorage";
import {
  Calendar,
  CheckCircle2,
  Clock,
  Dumbbell,
  Plus,
  Trash2,
  RotateCcw,
  Sparkles,
  ArrowRight,
  Smile,
  Award,
  RefreshCw,
  Edit2,
  ArrowUp,
  ArrowDown,
  X,
  Check,
  Zap,
  Activity,
  Building2,
  Settings,
  ShieldCheck,
  Save,
  AlertTriangle,
  ChevronDown,
  Copy
} from "lucide-react";

interface TodaySessionDiaryProps {
  activeProgram?: TrainingProgram;
  matrixPlans: WeeklyMatrixPlan[];
  onUpdatePlans?: (plans: WeeklyMatrixPlan[]) => void;
  unit: WeightUnit;
  workouts?: WorkoutSession[];
  sessionFeelings?: SessionFeeling[];
  onUpdateSessionFeeling?: (feeling: SessionFeeling) => void;
  onFinishSession: (session: WorkoutSession, feeling?: SessionFeeling) => void;
  onSavePlannedDayCompleted?: (weekNumber: number, day: DayOfWeek) => void;
  onMarkDayCompleted?: (weekNumber: number, day: DayOfWeek) => void;
  completedDaysRecord?: Record<string, boolean>;
  onNavigateToPlanner: () => void;
  programs?: TrainingProgram[];
  activeProgramId?: string;
  showGlobalToast?: (msg: string) => void;
  userId?: string;
  cloudSyncStatus?: string;
  onOpenSync?: () => void;
  onDeleteWorkout?: (id: string) => void;
  diaryTarget?: {
    week?: number;
    day?: DayOfWeek;
    date?: string;
    timestamp?: number;
  } | null;
}

interface SetLogRow {
  setNumber: number;
  targetWeight?: number;
  targetReps: string | number;
  actualWeight: number;
  actualReps: number;
  weight?: number;
  reps?: number;
  rpe: number;
  completed: boolean;
  isWarmup?: boolean;
  notes?: string;
}

interface ExerciseLoggingState {
  exerciseName: string;
  muscleGroup: string;
  equipmentType?: EquipmentType;
  machineId?: string;
  gymId?: string;
  notes?: string;
  sets: SetLogRow[];
}

const MUSCLE_GROUPS: MuscleGroup[] = [
  "Chest",
  "Back",
  "Legs",
  "Shoulders",
  "Arms",
  "Core"
];

const POPULAR_EXERCISES = [
  { name: "Barbell Bench Press", group: "Chest" as MuscleGroup, weight: 80, reps: "8-10", equipment: "barbell" as EquipmentType },
  { name: "Incline Dumbbell Press", group: "Chest" as MuscleGroup, weight: 28, reps: "10-12", equipment: "dumbbell" as EquipmentType },
  { name: "Barbell Back Squat", group: "Legs" as MuscleGroup, weight: 100, reps: "6-8", equipment: "barbell" as EquipmentType },
  { name: "Romanian Deadlift", group: "Legs" as MuscleGroup, weight: 90, reps: "8-10", equipment: "barbell" as EquipmentType },
  { name: "Lat Pulldown", group: "Back" as MuscleGroup, weight: 65, reps: "10-12", equipment: "cable_machine" as EquipmentType },
  { name: "Barbell Row", group: "Back" as MuscleGroup, weight: 70, reps: "8-10", equipment: "barbell" as EquipmentType },
  { name: "Overhead Barbell Press", group: "Shoulders" as MuscleGroup, weight: 50, reps: "8-10", equipment: "barbell" as EquipmentType },
  { name: "Dumbbell Lateral Raise", group: "Shoulders" as MuscleGroup, weight: 12, reps: "12-15", equipment: "dumbbell" as EquipmentType },
  { name: "Dumbbell Bicep Curl", group: "Arms" as MuscleGroup, weight: 14, reps: "10-12", equipment: "dumbbell" as EquipmentType },
  { name: "Tricep Rope Pushdown", group: "Arms" as MuscleGroup, weight: 25, reps: "12-15", equipment: "cable_machine" as EquipmentType }
];

export const TodaySessionDiary: React.FC<TodaySessionDiaryProps> = ({
  activeProgram,
  matrixPlans,
  onUpdatePlans,
  unit,
  workouts = [],
  sessionFeelings = [],
  onUpdateSessionFeeling,
  onFinishSession,
  onSavePlannedDayCompleted,
  onMarkDayCompleted,
  completedDaysRecord = {},
  onNavigateToPlanner,
  showGlobalToast,
  userId,
  cloudSyncStatus = "Saved locally",
  onOpenSync,
  onDeleteWorkout,
  diaryTarget
}) => {
  const activeUid = userId || "guest";
  const programName = activeProgram?.name || "Hypertrophy Program";

  // Determine actual today's day of week
  const getTodayDayOfWeek = (): DayOfWeek => {
    const jsDay = new Date().getDay();
    const dayMap: Record<number, DayOfWeek> = {
      0: "Sunday",
      1: "Monday",
      2: "Tuesday",
      3: "Wednesday",
      4: "Thursday",
      5: "Friday",
      6: "Saturday"
    };
    return dayMap[jsDay] || "Sunday";
  };

  const todayActualDay = getTodayDayOfWeek();
  const todayDateStr = getTodayDateStr();

  // Canonical detection of today's workout, planned session, and week/day
  const canonicalTodayInfo = useMemo(() => {
    // 1. Check canonical planner resolution for today
    const planned = findPlannedSessionForDate(matrixPlans, todayDateStr, activeProgram?.name);
    const workoutToday = workouts.find((w) => w.date === todayDateStr);

    if (planned) {
      return {
        weekNumber: planned.weekNumber,
        dayOfWeek: planned.dayOfWeek as DayOfWeek,
        workoutToday
      };
    }

    // 2. Check if a workout was logged for today in workouts
    if (workoutToday) {
      if (workoutToday.weekNumber && workoutToday.dayOfWeek) {
        return {
          weekNumber: workoutToday.weekNumber,
          dayOfWeek: workoutToday.dayOfWeek as DayOfWeek,
          workoutToday
        };
      }
      if (workoutToday.dayKey) {
        const m = workoutToday.dayKey.match(/w?(\d+)-([A-Za-z]+)/);
        if (m && (DAYS_OF_WEEK as readonly string[]).includes(m[2])) {
          return {
            weekNumber: parseInt(m[1], 10),
            dayOfWeek: m[2] as DayOfWeek,
            workoutToday
          };
        }
      }
    }

    // 3. Fallback: match by matrixPlans cell date
    for (const plan of matrixPlans) {
      if (plan.days) {
        for (const dayKey of DAYS_OF_WEEK) {
          if (plan.days[dayKey]?.date === todayDateStr) {
            return {
              weekNumber: plan.weekNumber,
              dayOfWeek: dayKey,
              workoutToday
            };
          }
        }
      }
    }

    // 4. Fallback: cycle calculation from cycle start date
    const baseStart = matrixPlans[0]?.startDate || CANONICAL_PROGRAM_START_DATE;
    const diffDays = getDifferenceInDays(baseStart, todayDateStr);
    if (diffDays >= 0) {
      const calcWeek = Math.floor(diffDays / 7) + 1;
      const validWeek = matrixPlans.some((p) => p.weekNumber === calcWeek)
        ? calcWeek
        : matrixPlans[0]?.weekNumber || 1;
      const dayName = getDayOfWeekName(todayDateStr);
      return {
        weekNumber: validWeek,
        dayOfWeek: dayName,
        workoutToday
      };
    }

    return {
      weekNumber: 1,
      dayOfWeek: todayActualDay,
      workoutToday
    };
  }, [workouts, todayDateStr, matrixPlans, activeProgram?.name, todayActualDay]);

  const userHasManuallySelectedRef = useRef(false);

  const [selectedWeek, setSelectedWeek] = useState<number>(() => {
    try {
      const savedWeek = Number(localStorage.getItem("pulse_diary_target_week"));
      if (savedWeek && !isNaN(savedWeek)) {
        userHasManuallySelectedRef.current = true;
        localStorage.removeItem("pulse_diary_target_week");
        return savedWeek;
      }
    } catch (e) {}
    return canonicalTodayInfo.weekNumber;
  });

  const [selectedDay, setSelectedDay] = useState<DayOfWeek>(() => {
    try {
      const savedDay = localStorage.getItem("pulse_diary_target_day") as DayOfWeek;
      if (savedDay && DAYS_OF_WEEK.includes(savedDay)) {
        userHasManuallySelectedRef.current = true;
        localStorage.removeItem("pulse_diary_target_day");
        return savedDay;
      }
    } catch (e) {}
    return canonicalTodayInfo.dayOfWeek;
  });

  const lastAppliedTargetTimestampRef = useRef<number | string | null>(null);

  // Synchronize with external navigation targets (e.g. from top nav tab, dashboard, or planner)
  useEffect(() => {
    if (diaryTarget) {
      const targetKey = diaryTarget.timestamp || diaryTarget.date || `${diaryTarget.week}-${diaryTarget.day}`;
      if (lastAppliedTargetTimestampRef.current !== targetKey) {
        lastAppliedTargetTimestampRef.current = targetKey;
        if (diaryTarget.week && diaryTarget.day) {
          userHasManuallySelectedRef.current = true;
          setSelectedWeek(diaryTarget.week);
          setSelectedDay(diaryTarget.day);
        } else if (diaryTarget.date) {
          const baseStart = matrixPlans[0]?.startDate || CANONICAL_PROGRAM_START_DATE;
          const diffDays = getDifferenceInDays(baseStart, diaryTarget.date);
          const wNum = diffDays >= 0 ? Math.floor(diffDays / 7) + 1 : 1;
          const dName = getDayOfWeekName(diaryTarget.date);
          userHasManuallySelectedRef.current = true;
          setSelectedWeek(wNum);
          setSelectedDay(dName);
        }
      }
    }
  }, [diaryTarget, matrixPlans]);

  // Direct date picker handler allowing jumping to any calendar date
  const handleDirectDateSelect = (newDateStr: string) => {
    if (!newDateStr || !isValidDateStr(newDateStr)) return;
    const baseStart = matrixPlans[0]?.startDate || CANONICAL_PROGRAM_START_DATE;
    const diffDays = getDifferenceInDays(baseStart, newDateStr);
    const wNum = diffDays >= 0 ? Math.floor(diffDays / 7) + 1 : 1;
    const dName = getDayOfWeekName(newDateStr);
    userHasManuallySelectedRef.current = true;
    setSelectedWeek(wNum);
    setSelectedDay(dName);
  };

  // Sync feedback toast
  const [syncToast, setSyncToast] = useState<string | null>(null);
  const [lastLocalSaveTime, setLastLocalSaveTime] = useState<string>(() => new Date().toLocaleTimeString());

  // Rest timer state
  const [timerSeconds, setTimerSeconds] = useState<number>(0);
  const [isTimerRunning, setIsTimerRunning] = useState<boolean>(false);

  // Post session rating state
  const [sessionRating, setSessionRating] = useState<number>(5);
  const [sorenessRating, setSorenessRating] = useState<number>(2);
  const [sessionRpe, setSessionRpe] = useState<number>(9);
  const [energyLevel, setEnergyLevel] = useState<"low" | "moderate" | "high">("high");
  const [journalNotes, setJournalNotes] = useState<string>("");
  const [isSavedCelebration, setIsSavedCelebration] = useState<boolean>(false);

  // Modals state
  const [isAddModalOpen, setIsAddModalOpen] = useState<boolean>(false);
  const [editingExIndex, setEditingExIndex] = useState<number | null>(null);
  const [isFinishConfirmOpen, setIsFinishConfirmOpen] = useState<boolean>(false);
  const [isGymModalOpen, setIsGymModalOpen] = useState<boolean>(false);

  // Gyms state
  const [gyms, setGyms] = useState<Gym[]>(() => getStoredGyms(activeUid));
  const [selectedGymId, setSelectedGymId] = useState<string>(() => {
    const stored = getStoredGyms(activeUid);
    const def = stored.find((g) => g.isDefault);
    return def ? def.id : stored[0]?.id || "";
  });

  useEffect(() => {
    const handleGymsUpdate = () => {
      setGyms(getStoredGyms(activeUid));
    };
    handleGymsUpdate();
    window.addEventListener("gyms-updated", handleGymsUpdate);
    window.addEventListener("storage", handleGymsUpdate);
    return () => {
      window.removeEventListener("gyms-updated", handleGymsUpdate);
      window.removeEventListener("storage", handleGymsUpdate);
    };
  }, [activeUid]);

  const [newGymName, setNewGymName] = useState("");
  const [newGymLocation, setNewGymLocation] = useState("");

  // Workout title & focus editing in header
  const [isEditingTitle, setIsEditingTitle] = useState<boolean>(false);
  const [titleDraft, setTitleDraft] = useState<string>("");
  const [focusDraft, setFocusDraft] = useState<string>("");

  // Add exercise form state
  const [addForm, setAddForm] = useState<{
    name: string;
    muscleGroup: MuscleGroup;
    equipmentType: EquipmentType;
    sets: number;
    reps: string;
    weight: number | "";
    notes: string;
  }>({
    name: "",
    muscleGroup: "Chest",
    equipmentType: "barbell",
    sets: 3,
    reps: "8-12",
    weight: 60,
    notes: ""
  });

  // Edit exercise form state
  const [editForm, setEditForm] = useState<{
    name: string;
    muscleGroup: MuscleGroup;
    equipmentType: EquipmentType;
    machineId?: string;
    sets: number;
    reps: string;
    weight: number | "";
    notes: string;
  }>({
    name: "",
    muscleGroup: "Chest",
    equipmentType: "barbell",
    sets: 3,
    reps: "8-12",
    weight: 0,
    notes: ""
  });

  // Find the selected week and day from matrix plans
  const currentWeekPlan = matrixPlans.find((w) => w.weekNumber === selectedWeek) || matrixPlans[0];
  const dayPlan = currentWeekPlan?.days?.[selectedDay];

  // Derive precise calendar date for the selected day cell
  const selectedDayDate = useMemo(() => {
    if (selectedWeek === canonicalTodayInfo.weekNumber && selectedDay === canonicalTodayInfo.dayOfWeek) {
      return todayDateStr;
    }
    if (dayPlan?.date && isValidDateStr(dayPlan.date)) {
      return dayPlan.date;
    }
    const baseStart = matrixPlans[0]?.startDate || CANONICAL_PROGRAM_START_DATE;
    return computeDateForDay(baseStart, selectedWeek, selectedDay);
  }, [selectedWeek, selectedDay, canonicalTodayInfo.weekNumber, canonicalTodayInfo.dayOfWeek, todayDateStr, dayPlan?.date, matrixPlans]);

  // Canonical session resolution: Completed > Active > Planned
  const currentDayKey = `w${selectedWeek}-${selectedDay}`;
  const resolvedSession = resolveSession(
    {
      weekNumber: selectedWeek,
      dayOfWeek: selectedDay,
      dayKey: currentDayKey,
      date: selectedDayDate
    },
    {
      workouts,
      matrixPlans,
      completedDaysRecord,
      userId: activeUid
    }
  );

  // Local state for set-by-set logging
  const [exerciseLogs, setExerciseLogs] = useState<ExerciseLoggingState[]>([]);

  // Show temporary sync feedback
  const triggerSyncNotification = (msg: string) => {
    setSyncToast(msg);
    setTimeout(() => {
      setSyncToast((prev) => (prev === msg ? null : prev));
    }, 2800);
  };

  // Helper to persist draft locally to IndexedDB/localStorage
  const autoSaveLocalDraft = useCallback(
    (logsToSave: ExerciseLoggingState[], isCompleted = false) => {
      const nowStr = new Date().toISOString();
      const draftExercises: ExerciseLog[] = logsToSave.map((ex, idx) => ({
        id: `draft-ex-${idx}-${ex.exerciseName.toLowerCase().replace(/\s+/g, "_")}`,
        exerciseName: ex.exerciseName,
        muscleGroup: (ex.muscleGroup as MuscleGroup) || "Chest",
        equipmentType: ex.equipmentType,
        machineId: ex.machineId,
        notes: ex.notes,
        sets: ex.sets.map((s, sIdx) => ({
          id: `draft-set-${idx}-${sIdx + 1}`,
          setNumber: s.setNumber,
          weight: cleanNumber(s.actualWeight),
          reps: Math.round(s.actualReps),
          rpe: s.rpe,
          targetWeight: cleanNumber(s.targetWeight),
          targetReps: s.targetReps,
          isCompleted: s.completed,
          completed: s.completed,
          isWarmup: s.isWarmup,
          notes: s.notes
        }))
      }));

      saveWorkoutDraft(activeUid, {
        dayKey: currentDayKey,
        weekNumber: selectedWeek,
        dayOfWeek: selectedDay,
        date: selectedDayDate,
        programId: activeProgram?.id,
        gymId: selectedGymId || undefined,
        title: titleDraft.trim() || dayPlan?.workoutTitle || `${selectedDay} Session`,
        status: isCompleted ? "completed" : "in_progress",
        updatedAt: nowStr,
        exercises: draftExercises
      });

      setLastLocalSaveTime(new Date().toLocaleTimeString());
      logOperation(activeUid, {
        entity: "workout_draft",
        action: "save_draft",
        status: "success",
        detail: `${currentDayKey} local draft saved (${logsToSave.length} exercises)`
      });
    },
    [activeUid, currentDayKey, selectedWeek, selectedDay, activeProgram?.id, selectedGymId, titleDraft, dayPlan?.workoutTitle]
  );

  // Helper to update current day in matrixPlans and call onUpdatePlans
  const updateMatrixDayPlan = (updater: (prevDay: MatrixDayCell) => MatrixDayCell, notificationMsg?: string) => {
    const newPlans = matrixPlans.map((w) => {
      if (w.weekNumber !== selectedWeek) return w;
      const currentDay: MatrixDayCell = w.days[selectedDay] || {
        day: selectedDay,
        workoutTitle: `${selectedDay} Session`,
        isRestDay: false,
        targetMuscleGroup: "Full Body",
        exercises: [],
        notes: ""
      };
      const updatedDay = updater(currentDay);
      return {
        ...w,
        days: {
          ...w.days,
          [selectedDay]: updatedDay
        }
      };
    });

    if (onUpdatePlans) {
      onUpdatePlans(newPlans);
    }

    if (notificationMsg) {
      triggerSyncNotification(notificationMsg);
    }
  };

  const lastHydratedKeyRef = useRef<string | null>(null);

  // Synchronize exerciseLogs whenever day/week or resolved state changes
  // Core rule: COMPLETED > ACTIVE > PLANNED
  useEffect(() => {
    const activeKey = `${currentDayKey}_${resolvedSession.completedWorkout?.id || resolvedSession.status}`;

    if (lastHydratedKeyRef.current !== activeKey) {
      lastHydratedKeyRef.current = activeKey;

      // 1. If workout is already completed, historical facts must be shown exactly
      if (resolvedSession.isCompleted && resolvedSession.completedWorkout && resolvedSession.completedWorkout.exercises?.length) {
        if (resolvedSession.completedWorkout.rpe !== undefined && resolvedSession.completedWorkout.rpe !== null) {
          setSessionRpe(resolvedSession.completedWorkout.rpe);
        } else if ((resolvedSession.completedWorkout as any).sessionRpe !== undefined) {
          setSessionRpe((resolvedSession.completedWorkout as any).sessionRpe);
        }

        setExerciseLogs(
          resolvedSession.completedWorkout.exercises.map((ex) => ({
            exerciseName: ex.exerciseName,
            muscleGroup: ex.muscleGroup,
            equipmentType: (ex as any).equipmentType || "barbell",
            machineId: (ex as any).machineId,
            notes: ex.notes,
            sets: ex.sets.map((s) => ({
              setNumber: s.setNumber,
              targetWeight: cleanNumber(s.weight),
              targetReps: String(s.reps),
              actualWeight: cleanNumber(s.weight),
              actualReps: Math.round(s.reps),
              weight: cleanNumber(s.weight),
              reps: Math.round(s.reps),
              rpe: (s.rpe !== undefined && s.rpe !== null && s.rpe > 0) ? s.rpe : (resolvedSession.completedWorkout?.rpe ?? 9),
              completed: (s as any).completed !== undefined ? (s as any).completed : ((s as any).isCompleted !== undefined ? (s as any).isCompleted : true)
            }))
          }))
        );
        if (resolvedSession.completedWorkout.title) {
          setTitleDraft(resolvedSession.completedWorkout.title);
        }
        if (resolvedSession.completedWorkout.notes) {
          setJournalNotes(resolvedSession.completedWorkout.notes);
        }
        if (resolvedSession.completedWorkout.gymId) {
          setSelectedGymId(resolvedSession.completedWorkout.gymId);
        }
        return;
      }

    // 2. If an active workout draft exists, hydrate from active performance
    if (resolvedSession.isActive && resolvedSession.activeDraft?.exercises?.length) {
      setExerciseLogs(
        resolvedSession.activeDraft.exercises.map((ex) => ({
          exerciseName: ex.exerciseName,
          muscleGroup: ex.muscleGroup,
          equipmentType: (ex as any).equipmentType || "barbell",
          machineId: (ex as any).machineId,
          notes: ex.notes,
          sets: ex.sets.map((s) => ({
            setNumber: s.setNumber,
            targetWeight: cleanNumber((s as any).targetWeight !== undefined ? (s as any).targetWeight : s.weight),
            targetReps: String((s as any).targetReps || s.reps),
            actualWeight: cleanNumber(s.weight),
            actualReps: Math.round(s.reps),
            rpe: (s.rpe !== undefined && s.rpe !== null && s.rpe > 0) ? s.rpe : 9,
            completed: (s as any).completed === true || (s as any).isCompleted === true || (s as any).state === "done",
            isWarmup: (s as any).isWarmup || false,
            notes: (s as any).notes || ""
          }))
        }))
      );
      if (resolvedSession.activeDraft.title) {
        setTitleDraft(resolvedSession.activeDraft.title);
      }
      if (resolvedSession.activeDraft.gymId) {
        setSelectedGymId(resolvedSession.activeDraft.gymId);
      }
      return;
    }

    // 3. Fallback to planned workout intention
    if (!dayPlan || dayPlan.isRestDay || !dayPlan.exercises || dayPlan.exercises.length === 0) {
      setExerciseLogs([]);
      return;
    }

    setExerciseLogs((prevLogs) => {
      return dayPlan.exercises.map((ex) => {
        const existingEx = prevLogs.find(
          (p) => p.exerciseName.trim().toLowerCase() === ex.exerciseName.trim().toLowerCase()
        );

        const plannedSets = ex.sets && ex.sets.length > 0 ? ex.sets : [];
        const numSets = plannedSets.length > 0 ? plannedSets.length : (ex.targetSets || 3);
        const defaultTargetWeight = cleanNumber(ex.targetWeight || 0);

        let parsedReps = 10;
        if (typeof ex.targetReps === "string") {
          const parts = ex.targetReps.split("-");
          if (parts.length > 0 && !isNaN(parseInt(parts[0]))) {
            parsedReps = parseInt(parts[0]);
          }
        }

        const sets: SetLogRow[] = Array.from({ length: numSets }, (_, i) => {
          const existingSet = existingEx?.sets?.[i];
          const plannedSet = plannedSets[i];
          const setTargetWeight = plannedSet?.weight !== undefined ? cleanNumber(plannedSet.weight) : defaultTargetWeight;
          const setTargetReps = plannedSet?.reps !== undefined ? plannedSet.reps : ex.targetReps;
          const setActualWeight = plannedSet?.weight !== undefined ? cleanNumber(plannedSet.weight) : defaultTargetWeight;

          if (existingSet) {
            return {
              ...existingSet,
              setNumber: i + 1,
              targetWeight: setTargetWeight,
              targetReps: setTargetReps
            };
          }
          return {
            setNumber: i + 1,
            targetWeight: setTargetWeight,
            targetReps: setTargetReps,
            actualWeight: setActualWeight,
            actualReps: parsedReps,
            rpe: sessionRpe || 9,
            completed: false
          };
        });

        return {
          exerciseName: ex.exerciseName,
          muscleGroup: ex.muscleGroup,
          equipmentType: (ex as any).equipmentType || "barbell",
          notes: ex.warmupNotes,
          sets
        };
      });
    });
    }
  }, [currentDayKey, resolvedSession]);

  // Sync title & focus drafts & gym when day changes
  useEffect(() => {
    if (dayPlan) {
      setTitleDraft(dayPlan.workoutTitle || `${selectedDay} Session`);
      setFocusDraft(dayPlan.targetMuscleGroup || "Full Body");
      if (dayPlan.gymId) {
        setSelectedGymId(dayPlan.gymId);
      }
    } else if (resolvedSession.gymId) {
      setSelectedGymId(resolvedSession.gymId);
    }
  }, [dayPlan, selectedDay, resolvedSession.gymId]);

  // Sync subjective feelings & diary journal from existing saved data
  useEffect(() => {
    const workout = resolvedSession.completedWorkout;
    const targetDate = dayPlan?.date;

    // First look in sessionFeelings prop
    const feeling = sessionFeelings.find(
      (f) =>
        (workout?.id && f.workoutId === workout.id) ||
        (targetDate && f.loggedAt === targetDate)
    );

    if (feeling) {
      if (feeling.rating) setSessionRating(feeling.rating);
      if (feeling.soreness) setSorenessRating(feeling.soreness);
      if (feeling.rpeAverage) setSessionRpe(feeling.rpeAverage);
      if (feeling.energyLevel) {
        setEnergyLevel(feeling.energyLevel === "medium" ? "moderate" : feeling.energyLevel);
      }
      if (feeling.notes !== undefined) setJournalNotes(feeling.notes);
    } else if (workout) {
      if (workout.sessionRpe || workout.rpe) {
        setSessionRpe(workout.sessionRpe || workout.rpe || 8);
      }
      if (workout.notes) {
        const cleanNotes = workout.notes.replace(/^\[[^\]]+\]\s*/, "");
        setJournalNotes(cleanNotes);
      }
    }
  }, [selectedWeek, selectedDay, resolvedSession.completedWorkout, sessionFeelings, dayPlan?.date]);

  // Rest timer with timestamp-based countdown (survives screen lock & app backgrounding)
  const timerEndTimestampRef = useRef<number>(0);
  const wakeLockRef = useRef<any>(null);

  // Play audio chime and vibration when rest timer finishes
  const playTimerChime = useCallback(() => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(587.33, audioCtx.currentTime); // D5
      osc.frequency.setValueAtTime(880, audioCtx.currentTime + 0.15); // A5
      gain.gain.setValueAtTime(0.35, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.6);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.6);
    } catch (e) {}
    try {
      if (navigator.vibrate) {
        navigator.vibrate([300, 150, 300]);
      }
    } catch (e) {}
  }, []);

  const handleStopTimer = useCallback(() => {
    timerEndTimestampRef.current = 0;
    setTimerSeconds(0);
    setIsTimerRunning(false);
    try {
      localStorage.removeItem("pulse_diary_timer_end");
    } catch (e) {}
    if (wakeLockRef.current) {
      wakeLockRef.current.release().catch(() => {});
      wakeLockRef.current = null;
    }
  }, []);

  const handleStartTimer = (seconds: number = 90) => {
    const end = Date.now() + seconds * 1000;
    timerEndTimestampRef.current = end;
    setTimerSeconds(seconds);
    setIsTimerRunning(true);
    try {
      localStorage.setItem("pulse_diary_timer_end", String(end));
    } catch (e) {}

    // Request screen wake lock so screen does not sleep during active rest timer
    if ("wakeLock" in navigator) {
      navigator.wakeLock.request("screen").then((wl) => {
        wakeLockRef.current = wl;
      }).catch(() => {});
    }
  };

  // Restore active timer on component mount if previously running
  useEffect(() => {
    try {
      const savedEnd = Number(localStorage.getItem("pulse_diary_timer_end"));
      if (savedEnd && savedEnd > Date.now()) {
        timerEndTimestampRef.current = savedEnd;
        setTimerSeconds(Math.ceil((savedEnd - Date.now()) / 1000));
        setIsTimerRunning(true);
      }
    } catch (e) {}
  }, []);

  // Timer interval and visibility/focus listener
  useEffect(() => {
    if (!isTimerRunning || timerEndTimestampRef.current <= 0) return;

    const checkTimer = () => {
      if (timerEndTimestampRef.current <= 0) return;
      const remainingMs = timerEndTimestampRef.current - Date.now();
      const remainingSec = Math.max(0, Math.ceil(remainingMs / 1000));
      setTimerSeconds(remainingSec);

      if (remainingSec <= 0) {
        handleStopTimer();
        playTimerChime();
        triggerSyncNotification("🔔 Rest timer completed!");
      }
    };

    const interval = setInterval(checkTimer, 300);

    const handleVisibilityChange = () => {
      checkTimer();
      if (document.visibilityState === "visible" && timerEndTimestampRef.current > Date.now()) {
        if ("wakeLock" in navigator && !wakeLockRef.current) {
          navigator.wakeLock.request("screen").then((wl) => {
            wakeLockRef.current = wl;
          }).catch(() => {});
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleVisibilityChange);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleVisibilityChange);
    };
  }, [isTimerRunning, playTimerChime, handleStopTimer]);

  // Toggle between Rest Day and Training Day
  const handleToggleRestDay = (forceRest?: boolean) => {
    const nextRest = forceRest !== undefined ? forceRest : !dayPlan?.isRestDay;
    updateMatrixDayPlan((prev) => ({
      ...prev,
      isRestDay: nextRest,
      workoutTitle: nextRest
        ? "Full Rest & Recovery"
        : prev.workoutTitle === "Full Rest & Recovery"
        ? `${selectedDay} Training Session`
        : prev.workoutTitle,
      targetMuscleGroup: nextRest
        ? "Rest"
        : prev.targetMuscleGroup === "Rest"
        ? "Full Body"
        : prev.targetMuscleGroup
    }), nextRest ? "Switched to Rest Day & synced to Planner" : "Converted to Training Session & synced to Planner");
  };

  // Save edited workout title & muscle focus
  const handleSaveWorkoutTitle = () => {
    const nextTitle = titleDraft.trim() || `${selectedDay} Session`;
    const nextFocus = focusDraft.trim() || "Full Body";
    updateMatrixDayPlan((prev) => ({
      ...prev,
      workoutTitle: nextTitle,
      targetMuscleGroup: nextFocus
    }), `✓ Renamed to "${nextTitle}" & synced to Planner`);
    setIsEditingTitle(false);
  };

  // Add a new exercise to today's session & sync with planner
  const handleAddExerciseSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const name = addForm.name.trim();
    if (!name) return;

    const targetWeightNum = addForm.weight === "" ? undefined : Number(addForm.weight);
    const targetRepsStr = addForm.reps.trim() || "8-12";
    const targetSetsNum = Math.max(1, Number(addForm.sets) || 3);

    const newPlannedEx: PlannedExercise = {
      exerciseName: name,
      muscleGroup: addForm.muscleGroup,
      targetSets: targetSetsNum,
      targetReps: targetRepsStr,
      targetWeight: targetWeightNum,
      warmupNotes: addForm.notes.trim() || undefined,
      sets: Array.from({ length: targetSetsNum }, (_, i) => ({
        setNumber: i + 1,
        weight: targetWeightNum,
        reps: targetRepsStr
      }))
    };

    saveCustomExerciseToCatalog({
      name,
      muscleGroup: addForm.muscleGroup,
      defaultIncrement: unit === "lbs" ? 5 : 2.5
    });

    updateMatrixDayPlan((prev) => {
      const existing = prev.exercises || [];
      return {
        ...prev,
        isRestDay: false,
        workoutTitle:
          prev.isRestDay && prev.workoutTitle === "Full Rest & Recovery"
            ? `${selectedDay} Training Session`
            : prev.workoutTitle,
        targetMuscleGroup:
          prev.targetMuscleGroup === "Rest" || !prev.targetMuscleGroup
            ? addForm.muscleGroup
            : prev.targetMuscleGroup,
        exercises: [...existing, newPlannedEx]
      };
    }, `✓ "${name}" added to Today's Session & Planner`);

    setIsAddModalOpen(false);
    setAddForm({
      name: "",
      muscleGroup: "Chest",
      equipmentType: "barbell",
      sets: 3,
      reps: "8-12",
      weight: 60,
      notes: ""
    });
  };

  // Open Edit Exercise modal
  const handleOpenEditExercise = (idx: number) => {
    const ex = exerciseLogs[idx];
    if (!ex) return;
    setEditingExIndex(idx);
    setEditForm({
      name: ex.exerciseName,
      muscleGroup: (ex.muscleGroup as MuscleGroup) || "Chest",
      equipmentType: ex.equipmentType || "barbell",
      machineId: ex.machineId,
      sets: ex.sets.length,
      reps: String(ex.sets[0]?.targetReps ?? "8-12"),
      weight: ex.sets[0]?.targetWeight !== undefined ? ex.sets[0]?.targetWeight : 0,
      notes: ex.notes || ""
    });
  };

  // Save changes from Edit Exercise modal
  const handleSaveEditExercise = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (editingExIndex === null) return;
    const name = editForm.name.trim();
    if (!name) return;

    const targetWeightNum = editForm.weight === "" ? undefined : Number(editForm.weight);
    const targetRepsStr = editForm.reps.trim() || "8-12";
    const targetSetsNum = Math.max(1, Number(editForm.sets) || 3);

    setExerciseLogs((prev) => {
      const copy = [...prev];
      if (copy[editingExIndex]) {
        copy[editingExIndex] = {
          ...copy[editingExIndex],
          exerciseName: name,
          muscleGroup: editForm.muscleGroup,
          equipmentType: editForm.equipmentType,
          machineId: editForm.machineId,
          notes: editForm.notes.trim() || undefined
        };
      }
      autoSaveLocalDraft(copy);
      return copy;
    });

    updateMatrixDayPlan((prev) => {
      const updated = (prev.exercises || []).map((ex, idx) => {
        if (idx !== editingExIndex) return ex;
        return {
          ...ex,
          exerciseName: name,
          muscleGroup: editForm.muscleGroup,
          targetSets: targetSetsNum,
          targetReps: targetRepsStr,
          targetWeight: targetWeightNum,
          warmupNotes: editForm.notes.trim() || undefined
        };
      });
      return { ...prev, exercises: updated };
    }, `✓ Updated "${name}" & synced to Planner`);

    setEditingExIndex(null);
  };

  // Delete exercise from session & planner
  const handleDeleteExercise = (exIndex: number) => {
    const exName = exerciseLogs[exIndex]?.exerciseName || "Exercise";
    setExerciseLogs((prev) => {
      const next = prev.filter((_, i) => i !== exIndex);
      autoSaveLocalDraft(next);
      return next;
    });

    updateMatrixDayPlan((prev) => ({
      ...prev,
      exercises: (prev.exercises || []).filter((_, i) => i !== exIndex)
    }), `✓ Removed "${exName}" & updated Planner`);
  };

  // Clear all exercises & logs for session
  const handleClearAllSession = () => {
    if (!window.confirm("Are you sure you want to clear all exercises and reset this session?")) {
      return;
    }
    setExerciseLogs([]);
    clearWorkoutDraft(activeUid, currentDayKey);
    clearWorkoutDraft(activeUid, `plan_${currentDayKey}`);
    clearWorkoutDraft(activeUid, `w${selectedWeek}-${selectedDay}`);

    if (workouts && workouts.length > 0) {
      const matchW = workouts.find(
        (w) =>
          w.date === selectedDayDate ||
          w.dayKey === currentDayKey ||
          (w.weekNumber === selectedWeek && w.dayOfWeek === selectedDay)
      );
      if (matchW && onDeleteWorkout) {
        onDeleteWorkout(matchW.id);
      }
    }

    updateMatrixDayPlan((prev) => ({
      ...prev,
      exercises: [],
      workoutTitle: `${selectedDay} Session`,
      notes: ""
    }), "✓ Cleared all exercises & reset session.");
  };

  // Reorder exercises
  const handleMoveExercise = (fromIndex: number, direction: "up" | "down") => {
    const toIndex = direction === "up" ? fromIndex - 1 : fromIndex + 1;
    if (toIndex < 0 || toIndex >= exerciseLogs.length) return;

    setExerciseLogs((prev) => {
      const list = [...prev];
      const [moved] = list.splice(fromIndex, 1);
      list.splice(toIndex, 0, moved);
      autoSaveLocalDraft(list);
      return list;
    });

    updateMatrixDayPlan((prev) => {
      const list = [...(prev.exercises || [])];
      if (toIndex >= list.length) return prev;
      const [moved] = list.splice(fromIndex, 1);
      list.splice(toIndex, 0, moved);
      return { ...prev, exercises: list };
    }, "✓ Reordered exercises & synced to Planner");
  };

  // Stepper to increment/decrement Target Weight directly on the card
  const handleStepTargetWeight = (exIndex: number, delta: number) => {
    const currentEx = exerciseLogs[exIndex];
    if (!currentEx) return;
    const currentWeight = currentEx.sets[0]?.targetWeight || 0;
    const newWeight = Math.max(0, Math.round((currentWeight + delta) * 10) / 10);

    setExerciseLogs((prev) => {
      const copy = [...prev];
      if (copy[exIndex]) {
        copy[exIndex] = {
          ...copy[exIndex],
          sets: copy[exIndex].sets.map((s) => ({
            ...s,
            targetWeight: newWeight,
            actualWeight: s.actualWeight === currentWeight || s.actualWeight === 0 ? newWeight : s.actualWeight
          }))
        };
      }
      autoSaveLocalDraft(copy);
      return copy;
    });

    updateMatrixDayPlan((prev) => {
      const updated = (prev.exercises || []).map((ex, idx) => {
        if (idx !== exIndex) return ex;
        return { ...ex, targetWeight: newWeight };
      });
      return { ...prev, exercises: updated };
    }, `Target: ${newWeight} ${unit} (synced)`);
  };

  // Add set (syncs targetSets with planner)
  const handleAddSet = (exIndex: number) => {
    setExerciseLogs((prev) => {
      const copy = [...prev];
      const ex = { ...copy[exIndex] };
      const lastSet = ex.sets[ex.sets.length - 1];
      const newSet: SetLogRow = {
        setNumber: ex.sets.length + 1,
        targetWeight: lastSet?.targetWeight,
        targetReps: lastSet?.targetReps || "8-12",
        actualWeight: lastSet?.actualWeight || 0,
        actualReps: lastSet?.actualReps || 10,
        rpe: lastSet?.rpe || sessionRpe || 9,
        completed: false
      };
      ex.sets = [...ex.sets, newSet];
      copy[exIndex] = ex;
      autoSaveLocalDraft(copy);
      return copy;
    });

    updateMatrixDayPlan((prev) => {
      const updated = (prev.exercises || []).map((ex, idx) => {
        if (idx !== exIndex) return ex;
        const currentSets = ex.sets && ex.sets.length > 0
          ? [...ex.sets]
          : Array.from({ length: ex.targetSets || 3 }, (_, i) => ({
              setNumber: i + 1,
              weight: ex.targetWeight,
              reps: ex.targetReps
            }));
        const lastPlannedSet = currentSets[currentSets.length - 1];
        const newPlannedSet: PlannedSet = {
          setNumber: currentSets.length + 1,
          weight: lastPlannedSet?.weight ?? ex.targetWeight,
          reps: lastPlannedSet?.reps ?? ex.targetReps
        };
        const nextSets = [...currentSets, newPlannedSet];
        return {
          ...ex,
          targetSets: nextSets.length,
          sets: nextSets
        };
      });
      return { ...prev, exercises: updated };
    }, "✓ Added set & synced to Planner");
  };

  // Remove set (syncs targetSets with planner)
  const handleRemoveSet = (exIndex: number, setIndex: number) => {
    setExerciseLogs((prev) => {
      const copy = [...prev];
      const ex = { ...copy[exIndex] };
      if (ex.sets.length <= 1) return prev;
      const filtered = ex.sets.filter((_, i) => i !== setIndex).map((s, idx) => ({
        ...s,
        setNumber: idx + 1
      }));
      ex.sets = filtered;
      copy[exIndex] = ex;
      autoSaveLocalDraft(copy);
      return copy;
    });

    updateMatrixDayPlan((prev) => {
      const updated = (prev.exercises || []).map((ex, idx) => {
        if (idx !== exIndex) return ex;
        const currentSets = ex.sets && ex.sets.length > 0
          ? [...ex.sets]
          : Array.from({ length: ex.targetSets || 3 }, (_, i) => ({
              setNumber: i + 1,
              weight: ex.targetWeight,
              reps: ex.targetReps
            }));
        if (currentSets.length <= 1) return ex;
        const filtered = currentSets.filter((_, i) => i !== setIndex).map((s, i) => ({
          ...s,
          setNumber: i + 1
        }));
        return {
          ...ex,
          targetSets: filtered.length,
          sets: filtered
        };
      });
      return { ...prev, exercises: updated };
    }, "✓ Removed set & synced to Planner");
  };

  // Copy last week's logged weights
  const handleCopyLastWeekWeights = (exIndex: number) => {
    const currentEx = exerciseLogs[exIndex];
    if (!currentEx || !workouts || workouts.length === 0) return;

    const matchingWorkout = workouts.find((w) =>
      w.exercises.some((e) => e.exerciseName.toLowerCase() === currentEx.exerciseName.toLowerCase())
    );

    if (!matchingWorkout) return;

    const pastEx = matchingWorkout.exercises.find(
      (e) => e.exerciseName.toLowerCase() === currentEx.exerciseName.toLowerCase()
    );

    if (pastEx && pastEx.sets && pastEx.sets.length > 0) {
      setExerciseLogs((prev) => {
        const copy = [...prev];
        const targetEx = { ...copy[exIndex] };
        targetEx.sets = targetEx.sets.map((set, sIdx) => {
          const pastSet = pastEx.sets[sIdx] || pastEx.sets[pastEx.sets.length - 1];
          return {
            ...set,
            actualWeight: pastSet.weight !== undefined ? pastSet.weight : set.actualWeight,
            actualReps: pastSet.reps !== undefined ? pastSet.reps : set.actualReps
          };
        });
        copy[exIndex] = targetEx;
        autoSaveLocalDraft(copy);
        return copy;
      });
      triggerSyncNotification(`Loaded prior weights for ${currentEx.exerciseName}`);
    }
  };

  // Toggle set completed
  const handleToggleSetCompleted = (exIndex: number, setIndex: number) => {
    setExerciseLogs((prev) => {
      const copy = [...prev];
      const ex = { ...copy[exIndex] };
      const sets = [...ex.sets];
      const set = { ...sets[setIndex] };
      set.completed = !set.completed;
      sets[setIndex] = set;
      ex.sets = sets;
      copy[exIndex] = ex;
      autoSaveLocalDraft(copy);
      return copy;
    });
  };

  const handleUpdateSetWeight = (exIndex: number, setIndex: number, weight: number) => {
    const cleanW = isNaN(weight) ? 0 : weight;
    setExerciseLogs((prev) => {
      const copy = [...prev];
      const ex = { ...copy[exIndex] };
      const sets = [...ex.sets];
      sets[setIndex] = { 
        ...sets[setIndex], 
        actualWeight: cleanW, 
        weight: cleanW, 
        targetWeight: cleanW 
      };
      ex.sets = sets;
      copy[exIndex] = ex;
      autoSaveLocalDraft(copy);
      return copy;
    });

    updateMatrixDayPlan((prev) => {
      const exercises = (prev.exercises || []).map((ex, idx) => {
        if (idx !== exIndex) return ex;
        const currentSets = ex.sets && ex.sets.length > 0 ? [...ex.sets] : [];
        if (currentSets[setIndex]) {
          currentSets[setIndex] = { ...currentSets[setIndex], weight: cleanW };
        }
        return { ...ex, sets: currentSets, targetWeight: cleanW };
      });
      return { ...prev, exercises };
    });
  };

  const handleUpdateSetReps = (exIndex: number, setIndex: number, reps: number) => {
    const cleanR = isNaN(reps) ? 0 : reps;
    setExerciseLogs((prev) => {
      const copy = [...prev];
      const ex = { ...copy[exIndex] };
      const sets = [...ex.sets];
      sets[setIndex] = { 
        ...sets[setIndex], 
        actualReps: cleanR, 
        reps: cleanR, 
        targetReps: cleanR 
      };
      ex.sets = sets;
      copy[exIndex] = ex;
      autoSaveLocalDraft(copy);
      return copy;
    });

    updateMatrixDayPlan((prev) => {
      const exercises = (prev.exercises || []).map((ex, idx) => {
        if (idx !== exIndex) return ex;
        const currentSets = ex.sets && ex.sets.length > 0 ? [...ex.sets] : [];
        if (currentSets[setIndex]) {
          currentSets[setIndex] = { ...currentSets[setIndex], reps: cleanR };
        }
        return { ...ex, sets: currentSets };
      });
      return { ...prev, exercises };
    });
  };

  const handleUpdateSetRpe = (exIndex: number, setIndex: number, rpe: number) => {
    setExerciseLogs((prev) => {
      const copy = [...prev];
      const ex = { ...copy[exIndex] };
      const sets = [...ex.sets];
      sets[setIndex] = { ...sets[setIndex], rpe };
      ex.sets = sets;
      copy[exIndex] = ex;
      autoSaveLocalDraft(copy);
      return copy;
    });

    updateMatrixDayPlan((prev) => {
      const exercises = (prev.exercises || []).map((ex, idx) => {
        if (idx !== exIndex) return ex;
        const currentSets = ex.sets && ex.sets.length > 0 ? [...ex.sets] : [];
        if (currentSets[setIndex]) {
          currentSets[setIndex] = { ...currentSets[setIndex], rpe };
        }
        return { ...ex, sets: currentSets };
      });
      return { ...prev, exercises };
    });
  };

  const handleUpdateEquipmentType = (exIndex: number, equipmentType: EquipmentType) => {
    setExerciseLogs((prev) => {
      const copy = [...prev];
      copy[exIndex] = {
        ...copy[exIndex],
        equipmentType,
        machineId: undefined
      };
      autoSaveLocalDraft(copy);
      return copy;
    });
  };

  const handleUpdateMachineId = (exIndex: number, machineId: string) => {
    setExerciseLogs((prev) => {
      const copy = [...prev];
      copy[exIndex] = {
        ...copy[exIndex],
        machineId: machineId || undefined
      };
      autoSaveLocalDraft(copy);
      return copy;
    });
  };

  // Quick mark all sets completed
  const handleMarkAllSetsCompleted = () => {
    setExerciseLogs((prev) => {
      const next = prev.map((ex) => ({
        ...ex,
        sets: ex.sets.map((s) => ({ ...s, completed: true }))
      }));
      autoSaveLocalDraft(next);
      return next;
    });
  };

  // Gym management
  const handleSelectDiaryGym = (newGymId: string) => {
    setSelectedGymId(newGymId);
    const gymObj = gyms.find((g) => g.id === newGymId);

    // 1. Update matrixPlans for the current day
    if (onUpdatePlans && matrixPlans && matrixPlans.length > 0) {
      const updated = matrixPlans.map((w) => {
        if (w.weekNumber !== selectedWeek) return w;
        const cell = w.days?.[selectedDay] || {
          day: selectedDay,
          workoutTitle: `${selectedDay} Session`,
          isRestDay: false,
          exercises: []
        };
        return {
          ...w,
          days: {
            ...w.days,
            [selectedDay]: {
              ...cell,
              gymId: newGymId || undefined,
              gymName: gymObj?.name || undefined
            }
          }
        };
      });
      onUpdatePlans(updated);
    }

    // 2. Also update completed workout if one exists for this day/date
    const matchW = workouts.find(
      (w) =>
        (resolvedSession.completedWorkout && w.id === resolvedSession.completedWorkout.id) ||
        w.date === selectedDayDate ||
        w.dayKey === currentDayKey ||
        (w.weekNumber === selectedWeek && w.dayOfWeek === selectedDay)
    );
    if (matchW && onFinishSession) {
      onFinishSession({
        ...matchW,
        gymId: newGymId || undefined,
        gymName: gymObj?.name || undefined,
        updatedAt: new Date().toISOString()
      });
    }

    // 3. Also update any active draft for this day
    try {
      const draft = getWorkoutDraft(activeUid, currentDayKey);
      if (draft) {
        saveWorkoutDraft(activeUid, {
          ...draft,
          gymId: newGymId || undefined,
          gymName: gymObj?.name || undefined
        });
      }
    } catch {}

    triggerSyncNotification(`Gym set to "${gymObj?.name || 'No Gym'}" & synced`);
  };

  const handleCreateGym = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGymName.trim()) return;
    const newGym: Gym = {
      id: `gym-${Date.now()}`,
      name: newGymName.trim(),
      location: newGymLocation.trim() || undefined,
      isDefault: gyms.length === 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    const updated = addOrUpdateGym(activeUid, newGym);
    setGyms(updated);
    setNewGymName("");
    setNewGymLocation("");
    setIsGymModalOpen(false);
    handleSelectDiaryGym(newGym.id);
  };

  // Active gym machines
  const activeGym = gyms.find((g) => g.id === selectedGymId);
  const activeGymMachines = activeGym?.machines || [];

  // Calculate live session statistics
  const totalSets = exerciseLogs.reduce((acc, ex) => acc + ex.sets.length, 0);
  const completedSets = exerciseLogs.reduce(
    (acc, ex) => acc + ex.sets.filter((s) => s.completed).length,
    0
  );
  const totalVolumeLifted = exerciseLogs.reduce(
    (acc, ex) =>
      acc +
      ex.sets.reduce((sAcc, s) => sAcc + (s.completed ? s.actualWeight * s.actualReps : 0), 0),
    0
  );

  const dayKey = `w${selectedWeek}-${selectedDay}`;
  const isDayAlreadyCompleted = completedDaysRecord[dayKey] || resolvedSession.isCompleted;

  // Alternate week session for the same day (e.g. Wednesday was logged in Week 1, user is viewing Week 2)
  const altWeekWorkout = useMemo(() => {
    if (isDayAlreadyCompleted) return null;
    return (
      workouts.find((w) => w.dayOfWeek === selectedDay && w.weekNumber !== selectedWeek) ||
      workouts.find((w) => {
        if (!w.date) return false;
        const dName = getDayOfWeekName(w.date);
        return dName === selectedDay && w.weekNumber !== selectedWeek;
      })
    );
  }, [workouts, selectedDay, selectedWeek, isDayAlreadyCompleted]);

  const handleCopyAltWeekSession = (srcWorkout: WorkoutSession) => {
    const targetDate = selectedDayDate;
    const targetDayKey = `w${selectedWeek}-${selectedDay}`;
    const copiedWorkout: WorkoutSession = {
      ...srcWorkout,
      id: `workout-${Date.now()}`,
      date: targetDate,
      weekNumber: selectedWeek,
      dayKey: targetDayKey,
      dayOfWeek: selectedDay,
      notes: `${srcWorkout.notes || ""} (Copied from W${srcWorkout.weekNumber || 1})`.trim(),
      updatedAt: new Date().toISOString()
    };
    onFinishSession(copiedWorkout);
    if (onSavePlannedDayCompleted) {
      onSavePlannedDayCompleted(selectedWeek, selectedDay);
    }
    triggerSyncNotification(`Copied session "${srcWorkout.title}" from Week ${srcWorkout.weekNumber || 1} to Week ${selectedWeek}!`);
  };

  // Save Workout In Progress (Leaves workout open, persists locally and syncs to cloud + updates matrix and completed facts)
  const handleSaveWorkoutInProgress = () => {
    autoSaveLocalDraft(exerciseLogs, false);

    // Build workout session so planner and dashboard immediately show current actual facts
    const activeExercises: ExerciseLog[] = exerciseLogs.map((ex) => {
      const completedSets = ex.sets.filter((s) => s.completed);
      const setsToInclude = completedSets.length > 0 ? completedSets : ex.sets;
      return {
        id: `ex-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        exerciseName: ex.exerciseName,
        muscleGroup: (ex.muscleGroup as MuscleGroup) || "Chest",
        equipmentType: ex.equipmentType,
        machineId: ex.machineId,
        gymId: selectedGymId || undefined,
        sets: setsToInclude.map((s) => ({
          id: `set-${s.setNumber}-${Date.now()}`,
          setNumber: s.setNumber,
          weight: cleanNumber(s.actualWeight),
          reps: Math.round(s.actualReps),
          rpe: s.rpe
        }))
      };
    });

    const workoutId =
      resolvedSession.isCompleted && resolvedSession.completedWorkout
        ? resolvedSession.completedWorkout.id
        : `workout-${Date.now()}`;
    const dateFormatted =
      resolvedSession.isCompleted && resolvedSession.completedWorkout?.date
        ? resolvedSession.completedWorkout.date
        : selectedDayDate || getTodayDateStr();

    const inProgressWorkout: WorkoutSession = {
      id: workoutId,
      date: dateFormatted,
      dayOfWeek: selectedDay,
      title: titleDraft.trim() || dayPlan?.workoutTitle || `${selectedDay} Workout`,
      durationMinutes: 60,
      exercises: activeExercises,
      rpe: sessionRpe || 8,
      sessionRpe: sessionRpe || 8,
      notes: journalNotes.trim()
        ? `[${programName} W${selectedWeek}] ${journalNotes.trim()}`
        : `[${programName} W${selectedWeek} ${selectedDay}] In progress session.`,
      weekNumber: selectedWeek,
      dayKey,
      programId: activeProgram?.id,
      gymId: selectedGymId || undefined,
      updatedAt: new Date().toISOString()
    };

    const normalizedEnergy = energyLevel === "moderate" ? ("medium" as const) : energyLevel;
    const newFeeling: SessionFeeling = {
      workoutId,
      rating: sessionRating,
      soreness: sorenessRating,
      rpeAverage: sessionRpe || 8,
      energyLevel: normalizedEnergy,
      loggedAt: dateFormatted,
      notes: journalNotes.trim()
    };

    onFinishSession(inProgressWorkout, newFeeling);
    if (onUpdateSessionFeeling) {
      onUpdateSessionFeeling(newFeeling);
    }

    if (onSavePlannedDayCompleted) {
      onSavePlannedDayCompleted(selectedWeek, selectedDay);
    } else if (onMarkDayCompleted) {
      onMarkDayCompleted(selectedWeek, selectedDay);
    }

    if (onUpdatePlans && matrixPlans && matrixPlans.length > 0) {
      const updatedPlans = matrixPlans.map((w) => {
        if (w.weekNumber !== selectedWeek) return w;
        const cell = w.days?.[selectedDay];
        if (!cell) return w;
        return {
          ...w,
          days: {
            ...w.days,
            [selectedDay]: {
              ...cell,
              date: dateFormatted,
              gymId: selectedGymId || cell.gymId,
              exercises: exerciseLogs.map((ex) => ({
                exerciseName: ex.exerciseName,
                muscleGroup: ex.muscleGroup,
                targetSets: ex.sets.length,
                targetReps: ex.sets[0] ? `${ex.sets[0].actualReps}` : "8-12",
                targetWeight: ex.sets[0] ? ex.sets[0].actualWeight : undefined,
                equipmentType: ex.equipmentType,
                machineId: ex.machineId,
                sets: ex.sets.map((s) => ({
                  setNumber: s.setNumber,
                  weight: s.actualWeight,
                  reps: s.actualReps
                }))
              }))
            }
          }
        };
      });
      onUpdatePlans(updatedPlans);
    }

    triggerSyncNotification("✓ Workout saved in progress (local & cloud)");
  };

  // Explicitly save feeling & diary journal at any time with immediate local & cloud persistence
  const handleSaveFeelingAndJournal = () => {
    const workoutId =
      resolvedSession.isCompleted && resolvedSession.completedWorkout
        ? resolvedSession.completedWorkout.id
        : `workout-${Date.now()}`;
    const dateFormatted =
      resolvedSession.isCompleted && resolvedSession.completedWorkout?.date
        ? resolvedSession.completedWorkout.date
        : selectedDayDate || dayPlan?.date || getTodayDateStr();

    const normalizedEnergy = energyLevel === "moderate" ? ("medium" as const) : energyLevel;
    const newFeeling: SessionFeeling = {
      workoutId,
      rating: sessionRating,
      soreness: sorenessRating,
      rpeAverage: sessionRpe || 8,
      energyLevel: normalizedEnergy,
      loggedAt: dateFormatted,
      notes: journalNotes.trim()
    };

    if (onUpdateSessionFeeling) {
      onUpdateSessionFeeling(newFeeling);
    }

    if (resolvedSession.completedWorkout) {
      const updatedWorkout: WorkoutSession = {
        ...resolvedSession.completedWorkout,
        notes: journalNotes.trim()
          ? `[${programName} W${selectedWeek}] ${journalNotes.trim()}`
          : resolvedSession.completedWorkout.notes,
        sessionRpe: sessionRpe,
        rpe: sessionRpe,
        updatedAt: new Date().toISOString()
      };
      onFinishSession(updatedWorkout, newFeeling);
    } else {
      handleSaveWorkoutInProgress();
    }

    triggerSyncNotification("✓ Subjective Feeling & Diary Journal saved");
  };

  // Pre-finish check: Prompt if uncompleted sets exist
  const handleRequestFinish = () => {
    const uncompletedCount = totalSets - completedSets;
    if (uncompletedCount > 0) {
      setIsFinishConfirmOpen(true);
    } else {
      executeFinishSession(false);
    }
  };

  // Save session as completed workout
  const executeFinishSession = (markRemainingAsDone = false) => {
    const finalLogs = markRemainingAsDone
      ? exerciseLogs.map((ex) => ({
          ...ex,
          sets: ex.sets.map((s) => ({ ...s, completed: true }))
        }))
      : exerciseLogs;

    const workoutExercises: ExerciseLog[] = finalLogs.map((ex) => {
      const completedSets = ex.sets.filter((s) => markRemainingAsDone || s.completed);
      const setsToInclude = completedSets.length > 0 ? completedSets : ex.sets;
      return {
        id: `ex-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        exerciseName: ex.exerciseName,
        muscleGroup: (ex.muscleGroup as MuscleGroup) || "Chest",
        equipmentType: ex.equipmentType,
        machineId: ex.machineId,
        gymId: selectedGymId || undefined,
        sets: setsToInclude.map((s) => ({
          id: `set-${s.setNumber}-${Date.now()}`,
          setNumber: s.setNumber,
          weight: cleanNumber(s.actualWeight),
          reps: Math.round(s.actualReps),
          rpe: s.rpe
        }))
      };
    });

    const workoutId =
      resolvedSession.isCompleted && resolvedSession.completedWorkout
        ? resolvedSession.completedWorkout.id
        : `workout-${Date.now()}`;
    const dateFormatted =
      resolvedSession.isCompleted && resolvedSession.completedWorkout?.date
        ? resolvedSession.completedWorkout.date
        : selectedDayDate || getTodayDateStr();

    const allLoggedRpes = workoutExercises
      .flatMap((e) => e.sets)
      .map((s) => s.rpe)
      .filter((r): r is number => r !== undefined && r !== null && !isNaN(r) && r > 0);
    const avgSetRpe =
      allLoggedRpes.length > 0
        ? Number((allLoggedRpes.reduce((a, b) => a + b, 0) / allLoggedRpes.length).toFixed(1))
        : sessionRpe;

    const newWorkout: WorkoutSession = {
      id: workoutId,
      date: dateFormatted,
      dayOfWeek: selectedDay,
      title: titleDraft.trim() || dayPlan?.workoutTitle || `${selectedDay} Workout`,
      durationMinutes: 60,
      exercises: workoutExercises,
      rpe: sessionRpe ?? avgSetRpe ?? 9,
      sessionRpe: sessionRpe ?? avgSetRpe ?? 9,
      notes: journalNotes.trim()
        ? `[${programName} W${selectedWeek}] ${journalNotes.trim()}`
        : `[${programName} W${selectedWeek} ${selectedDay}] Completed planned session.`,
      weekNumber: selectedWeek,
      dayKey,
      programId: activeProgram?.id,
      gymId: selectedGymId || undefined,
      updatedAt: new Date().toISOString()
    };

    const normalizedEnergy = energyLevel === "moderate" ? ("medium" as const) : energyLevel;
    const newFeeling: SessionFeeling = {
      workoutId,
      rating: sessionRating,
      soreness: sorenessRating,
      rpeAverage: sessionRpe ?? avgSetRpe ?? 9,
      energyLevel: normalizedEnergy,
      loggedAt: dateFormatted,
      notes: journalNotes.trim() || `Felt solid. Total volume: ${totalVolumeLifted.toLocaleString()} ${unit}.`
    };

    onFinishSession(newWorkout, newFeeling);
    if (onUpdateSessionFeeling) {
      onUpdateSessionFeeling(newFeeling);
    }

    if (onSavePlannedDayCompleted) {
      onSavePlannedDayCompleted(selectedWeek, selectedDay);
    } else if (onMarkDayCompleted) {
      onMarkDayCompleted(selectedWeek, selectedDay);
    }

    if (onUpdatePlans && matrixPlans && matrixPlans.length > 0) {
      const updatedPlans = matrixPlans.map((w) => {
        if (w.weekNumber !== selectedWeek) return w;
        const cell = w.days?.[selectedDay];
        if (!cell) return w;
        return {
          ...w,
          days: {
            ...w.days,
            [selectedDay]: {
              ...cell,
              date: dateFormatted,
              gymId: selectedGymId || cell.gymId,
              exercises: finalLogs.map((ex) => ({
                exerciseName: ex.exerciseName,
                muscleGroup: ex.muscleGroup,
                targetSets: ex.sets.length,
                targetReps: ex.sets[0] ? `${ex.sets[0].actualReps}` : "8-12",
                targetWeight: ex.sets[0] ? ex.sets[0].actualWeight : undefined,
                equipmentType: ex.equipmentType,
                machineId: ex.machineId,
                sets: ex.sets.map((s) => ({
                  setNumber: s.setNumber,
                  weight: s.actualWeight,
                  reps: s.actualReps
                }))
              }))
            }
          }
        };
      });
      onUpdatePlans(updatedPlans);
    }

    clearWorkoutDraft(activeUid, currentDayKey);
    setIsFinishConfirmOpen(false);
    setIsSavedCelebration(true);
  };

  const selectedDateDisplayString = useMemo(() => {
    try {
      if (selectedDayDate) {
        const parts = selectedDayDate.split("-");
        if (parts.length === 3) {
          const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
          return d.toLocaleDateString(undefined, {
            weekday: "long",
            month: "short",
            day: "numeric",
            year: "numeric"
          });
        }
      }
    } catch (e) {}
    return selectedDayDate;
  }, [selectedDayDate]);

  const catalog = getFullExerciseCatalog();

  return (
    <div className="space-y-6">
      {/* Floating live sync feedback pill */}
      {syncToast && (
        <div className="fixed bottom-6 right-6 z-50 bg-[#222222] text-white px-4 py-2.5 rounded-2xl shadow-xl border border-white/20 text-xs font-bold flex items-center gap-2 animate-in fade-in slide-in-from-bottom-3 duration-200">
          <Zap className="w-4 h-4 text-emerald-400 fill-emerald-400" />
          <span>{syncToast}</span>
        </div>
      )}

      {/* Header card with Week & Day Selector & Persistence Status */}
      <div className="p-6 rounded-3xl bg-white border border-black/[0.08] shadow-sm space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="w-2.5 h-2.5 rounded-full bg-[#AD314D] animate-pulse" />
              <h2 className="text-xl font-bold text-[#222222]">
                Today&apos;s Training Diary
              </h2>
              <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-rose-50 text-[#AD314D] border border-rose-100">
                Live Workout Log
              </span>
              <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${
                selectedWeek === canonicalTodayInfo.weekNumber && selectedDay === canonicalTodayInfo.dayOfWeek
                  ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                  : "bg-amber-50 text-amber-900 border-amber-200"
              }`}>
                {selectedWeek === canonicalTodayInfo.weekNumber && selectedDay === canonicalTodayInfo.dayOfWeek
                  ? `Today's Active Session (${selectedDateDisplayString})`
                  : `Viewing: ${selectedDateDisplayString} • Week ${selectedWeek} ${selectedDay}`}
              </span>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-emerald-600" /> Auto-Syncs with Planner
              </span>
              {isDayAlreadyCompleted && (
                <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Completed &amp; Saved
                </span>
              )}
            </div>
            <p className="text-xs text-[#4A4A4A] mt-1">
              Changes auto-save locally to IndexedDB &amp; sync seamlessly to the Planner, Dashboard, and cloud.
            </p>
          </div>

          {/* Top Status & Controls */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Quick Direct Date Picker */}
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-2xl bg-[#F0F0EE] border border-black/[0.06] shadow-2xs">
              <Calendar className="w-3.5 h-3.5 text-[#AD314D]" />
              <span className="text-xs font-bold text-neutral-600 hidden sm:inline">Date:</span>
              <input
                type="date"
                value={selectedDayDate}
                onChange={(e) => handleDirectDateSelect(e.target.value)}
                className="text-xs font-black text-[#222222] bg-transparent outline-none cursor-pointer"
                title="Jump directly to any date"
              />
            </div>

            {/* Jump to Today button if looking at another day */}
            {(selectedWeek !== canonicalTodayInfo.weekNumber || selectedDay !== canonicalTodayInfo.dayOfWeek) && (
              <button
                type="button"
                onClick={() => {
                  userHasManuallySelectedRef.current = false;
                  setSelectedWeek(canonicalTodayInfo.weekNumber);
                  setSelectedDay(canonicalTodayInfo.dayOfWeek);
                }}
                className="px-3.5 py-1.5 rounded-2xl bg-rose-50 hover:bg-rose-100 border border-rose-300 text-xs font-extrabold text-[#AD314D] transition-all flex items-center gap-1.5 shadow-2xs cursor-pointer active:scale-95"
                title="Return to today's active session"
              >
                <Sparkles className="w-3.5 h-3.5 text-[#AD314D]" />
                <span>Jump to Today (W{canonicalTodayInfo.weekNumber} {canonicalTodayInfo.dayOfWeek})</span>
              </button>
            )}

            {/* Week selector */}
            <div className="flex items-center bg-[#F0F0EE] p-1 rounded-2xl border border-black/[0.04]">
              {matrixPlans.map((w) => {
                const count = workouts.filter(
                  (wo) => wo.weekNumber === w.weekNumber || wo.dayKey?.startsWith(`w${w.weekNumber}-`)
                ).length;
                return (
                  <button
                    key={w.weekNumber}
                    type="button"
                    onClick={() => {
                      userHasManuallySelectedRef.current = true;
                      setSelectedWeek(w.weekNumber);
                    }}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                      selectedWeek === w.weekNumber
                        ? "bg-white text-[#222222] shadow-sm font-bold"
                        : "text-[#777777] hover:text-[#222222]"
                    }`}
                  >
                    W{w.weekNumber}{count > 0 ? ` (${count}✓)` : ""}
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={onNavigateToPlanner}
              className="px-3 py-2 rounded-2xl border border-black/[0.08] hover:bg-neutral-50 text-xs font-semibold text-[#222222] transition-colors flex items-center gap-1.5"
            >
              <span>View Full Matrix</span>
              <ArrowRight className="w-3.5 h-3.5 text-[#AD314D]" />
            </button>
          </div>
        </div>

        {/* Day of week pill selector */}
        <div className="pt-3 border-t border-black/[0.05] flex items-center gap-1.5 overflow-x-auto pb-1">
          {DAYS_OF_WEEK.map((d) => {
            const isToday = selectedWeek === canonicalTodayInfo.weekNumber && d === canonicalTodayInfo.dayOfWeek;
            const isSelected = d === selectedDay;
            const dayCell = currentWeekPlan?.days?.[d];
            const isRest = dayCell?.isRestDay;
            const exCount = dayCell?.exercises?.length || 0;
            const pillDate = dayCell?.date || computeDateForDay(matrixPlans[0]?.startDate || CANONICAL_PROGRAM_START_DATE, selectedWeek, d);
            const isPillCompleted = !!(
              completedDaysRecord[`w${selectedWeek}-${d}`] ||
              completedDaysRecord[`${selectedWeek}-${d}`] ||
              (pillDate && completedDaysRecord[pillDate]) ||
              workouts.some(
                (wo) =>
                  (wo.weekNumber === selectedWeek && wo.dayOfWeek === d) ||
                  wo.dayKey === `w${selectedWeek}-${d}` ||
                  (pillDate && wo.date === pillDate)
              )
            );

            return (
              <button
                key={d}
                type="button"
                onClick={() => {
                  userHasManuallySelectedRef.current = true;
                  setSelectedDay(d);
                }}
                className={`px-3.5 py-1.5 rounded-2xl text-xs font-semibold transition-all shrink-0 flex items-center gap-1.5 ${
                  isSelected
                    ? "bg-[#222222] text-white shadow-sm"
                    : isToday
                    ? "bg-rose-50 text-[#AD314D] border border-rose-200"
                    : isPillCompleted
                    ? "bg-emerald-50 text-emerald-900 border border-emerald-200 hover:bg-emerald-100"
                    : "bg-[#F8F8F7] hover:bg-[#F0F0EE] text-[#4A4A4A]"
                }`}
              >
                <span>{d}</span>
                {isToday && (
                  <span
                    className={`text-[9px] px-1.5 py-0.2 rounded-full font-bold uppercase ${
                      isSelected ? "bg-white/20 text-white" : "bg-[#AD314D] text-white"
                    }`}
                  >
                    Today
                  </span>
                )}
                {isPillCompleted && (
                  <span
                    className={`text-[10px] font-bold ${
                      isSelected ? "text-emerald-300" : "text-emerald-700"
                    }`}
                    title="Completed & Logged"
                  >
                    ✓
                  </span>
                )}
                {isRest ? (
                  <span className="text-[10px] opacity-70">
                    (Rest)
                  </span>
                ) : (
                  <span className="text-[10px] opacity-80 font-bold">
                    {exCount}ex
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Real-time Gym Check-In Feature */}
      <GymCheckInWidget
        currentGymId={selectedGymId}
        currentGymName={activeGym?.name || dayPlan?.gymName}
        gyms={gyms}
        activeWorkout={workouts.find((w) => w.date === selectedDayDate || w.dayKey === `w${selectedWeek}-${selectedDay}`) || null}
        onUpdateGym={(gym) => {
          const updatedGyms = addOrUpdateGym(activeUid, gym);
          setGyms(updatedGyms);
          handleSelectDiaryGym(gym.id);
        }}
        onCheckInSuccess={({ gym, checkInTime, checkInLocation, distanceKm }) => {
          setSyncToast(`✓ Checked in at ${gym.name} (${checkInTime})`);
          if (showGlobalToast) {
            showGlobalToast(`✓ Checked in at ${gym.name} (${checkInTime})`);
          }
          handleSelectDiaryGym(gym.id);
        }}
      />

      {/* Google Maps Gym Location Recognition & Selector */}
      <GymLocationSelector
        selectedGymId={selectedGymId}
        selectedGymName={activeGym?.name || dayPlan?.gymName}
        gyms={gyms}
        onSelectGym={(gym) => {
          const updatedGyms = addOrUpdateGym(activeUid, gym);
          setGyms(updatedGyms);
          handleSelectDiaryGym(gym.id);
        }}
      />

      {/* Rest Timer Sticky Bar */}
      <div className="sticky top-4 z-30 p-4 rounded-3xl bg-[#222222] text-white shadow-xl border border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3 backdrop-blur-md bg-opacity-95">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center text-amber-400">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-white/70">
                Inter-Set Rest Timer
              </span>
              {timerSeconds > 0 && (
                <span className="text-xs font-extrabold text-amber-400 font-mono animate-pulse">
                  {Math.floor(timerSeconds / 60)}:{(timerSeconds % 60).toString().padStart(2, "0")} remaining
                </span>
              )}
            </div>
            <p className="text-[11px] text-white/60">
              Pre-planned rest intervals: 45s, 90s (Default), 2 min, 3 min. Audio &amp; haptic alert on completion.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            type="button"
            onClick={() => handleStartTimer(45)}
            className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-semibold transition-colors"
          >
            45s
          </button>
          <button
            type="button"
            onClick={() => handleStartTimer(90)}
            className="px-3 py-1.5 rounded-xl bg-[#AD314D] hover:bg-[#92263F] text-white text-xs font-bold transition-colors"
          >
            90s (Default)
          </button>
          <button
            type="button"
            onClick={() => handleStartTimer(120)}
            className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-semibold transition-colors"
          >
            2 min (120s)
          </button>
          <button
            type="button"
            onClick={() => handleStartTimer(180)}
            className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-semibold transition-colors"
          >
            3 min (180s)
          </button>
          {timerSeconds > 0 && (
            <button
              type="button"
              onClick={handleStopTimer}
              className="px-2.5 py-1.5 rounded-xl bg-white/15 hover:bg-white/25 text-xs text-white/80"
              title="Reset Timer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Workout Session Details Card */}
      <div className="p-6 rounded-3xl bg-white border border-black/[0.08] shadow-sm space-y-6">
        {/* Session Banner */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-black/[0.06]">
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-bold text-[#AD314D] uppercase tracking-wider">
                {selectedDay} • Week {selectedWeek}
              </span>
              <span className="text-xs text-[#777777]">• {selectedDateDisplayString}</span>
              {selectedWeek === canonicalTodayInfo.weekNumber && selectedDay === canonicalTodayInfo.dayOfWeek && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-100 text-[#AD314D] border border-rose-200">
                  Today&apos;s Session
                </span>
              )}

              {/* Gym Selector */}
              <div className="flex items-center gap-1.5 bg-neutral-100 px-2.5 py-1 rounded-full text-xs font-semibold text-[#222222] border border-black/[0.06]">
                <Building2 className="w-3.5 h-3.5 text-indigo-600" />
                <select
                  value={selectedGymId}
                  onChange={(e) => handleSelectDiaryGym(e.target.value)}
                  className="bg-transparent border-none text-xs font-bold text-[#222222] outline-none cursor-pointer"
                >
                  <option value="">No Gym Selected</option>
                  {gyms.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setIsGymModalOpen(true)}
                  className="text-[10px] font-bold text-indigo-600 hover:underline ml-1"
                >
                  + Add Gym
                </button>
              </div>

              {/* Rest / Active Session Toggle Pill */}
              <button
                type="button"
                onClick={() => handleToggleRestDay()}
                className={`text-xs font-bold px-2.5 py-1 rounded-full border transition-all flex items-center gap-1.5 ${
                  dayPlan?.isRestDay
                    ? "bg-amber-50 text-amber-900 border-amber-200 hover:bg-amber-100"
                    : "bg-emerald-50 text-emerald-900 border-emerald-200 hover:bg-emerald-100"
                }`}
                title="Click to toggle between Rest Day and Training Day"
              >
                {dayPlan?.isRestDay ? (
                  <>
                    <span>🧘 Rest Day</span>
                    <span className="text-[10px] text-amber-700 underline font-normal">Switch to Training</span>
                  </>
                ) : (
                  <>
                    <span>💪 Training Day</span>
                    <span className="text-[10px] text-emerald-700 underline font-normal">Switch to Rest</span>
                  </>
                )}
              </button>
            </div>

            {/* Title Editing or Display */}
            {isEditingTitle ? (
              <div className="mt-3 flex flex-col sm:flex-row items-start sm:items-center gap-2">
                <input
                  type="text"
                  value={titleDraft}
                  onChange={(e) => setTitleDraft(e.target.value)}
                  placeholder="Workout title (e.g. Sunday Push Session)"
                  className="px-3 py-1.5 rounded-xl border border-black/[0.15] text-sm font-bold text-[#222222] focus:ring-2 focus:ring-[#AD314D] outline-none"
                />
                <select
                  value={focusDraft}
                  onChange={(e) => setFocusDraft(e.target.value)}
                  className="px-3 py-1.5 rounded-xl border border-black/[0.15] text-xs font-bold text-[#222222] bg-white outline-none"
                >
                  {MUSCLE_GROUPS.map((g) => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                </select>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={handleSaveWorkoutTitle}
                    className="px-3 py-1.5 rounded-xl bg-[#AD314D] text-white text-xs font-bold flex items-center gap-1 shadow-sm"
                  >
                    <Check className="w-3.5 h-3.5" /> Save
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsEditingTitle(false)}
                    className="px-3 py-1.5 rounded-xl bg-neutral-100 text-[#4A4A4A] text-xs font-semibold"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 mt-1">
                <h3 className="text-2xl font-black text-[#222222]">
                  {dayPlan?.workoutTitle || (dayPlan?.isRestDay ? "Full Rest & Recovery" : "Scheduled Workout")}
                </h3>
                <button
                  type="button"
                  onClick={() => {
                    setTitleDraft(dayPlan?.workoutTitle || `${selectedDay} Session`);
                    setFocusDraft(dayPlan?.targetMuscleGroup || "Full Body");
                    setIsEditingTitle(true);
                  }}
                  className="p-1 text-[#777777] hover:text-[#222222] hover:bg-neutral-100 rounded-lg transition-colors"
                  title="Rename workout title & target focus"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
              </div>
            )}

            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-neutral-100 text-[#4A4A4A]">
                Target: {dayPlan?.targetMuscleGroup || (dayPlan?.isRestDay ? "Rest" : "General")}
              </span>
              {dayPlan?.notes && (
                <span className="text-xs text-[#777777] italic">
                  &ldquo;{dayPlan.notes}&rdquo;
                </span>
              )}
            </div>
          </div>

          {/* Top Session Actions */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={handleSaveWorkoutInProgress}
              className="px-4 py-2 rounded-xl bg-neutral-100 hover:bg-neutral-200 text-[#222222] text-xs font-bold border border-black/[0.08] transition-all flex items-center gap-1.5 shadow-2xs"
              title="Save current set progress without finishing"
            >
              <Save className="w-4 h-4 text-emerald-600" />
              <span>Save Workout</span>
            </button>

            <button
              type="button"
              onClick={() => setIsAddModalOpen(true)}
              className="px-4 py-2 rounded-xl bg-[#AD314D] hover:bg-[#92263F] text-white text-xs font-bold shadow-sm transition-all flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>Add Exercise</span>
            </button>

            {!dayPlan?.isRestDay && exerciseLogs.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={handleClearAllSession}
                  className="px-3.5 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-800 text-xs font-semibold border border-rose-200 transition-colors flex items-center gap-1.5"
                  title="Clear all exercises and reset session"
                >
                  <Trash2 className="w-4 h-4 text-rose-600" />
                  <span>Clear All</span>
                </button>
                <button
                  type="button"
                  onClick={handleMarkAllSetsCompleted}
                  className="px-3.5 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-semibold border border-emerald-200 transition-colors flex items-center gap-1.5"
                >
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>Mark All Done</span>
                </button>
              </>
            )}

            <div className="px-4 py-2 rounded-xl bg-[#F8F8F7] border border-black/[0.06] text-right">
              <div className="text-[10px] uppercase font-bold text-[#777777]">Live Tonnage</div>
              <div className="text-sm font-extrabold text-[#AD314D]">
                {totalVolumeLifted.toLocaleString()} {unit}
              </div>
            </div>
          </div>
        </div>

        {/* ALT WEEK WORKOUT NOTICE (e.g. Wednesday or Thursday was logged under Week 1) */}
        {altWeekWorkout && !isDayAlreadyCompleted && (
          <div className="p-4 rounded-2xl bg-gradient-to-r from-emerald-50 via-teal-50 to-indigo-50 border border-emerald-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0 mt-0.5">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <h5 className="text-xs font-bold text-emerald-950 flex items-center gap-1.5">
                  <span>Logged Session Found in Week {altWeekWorkout.weekNumber}:</span>
                  <span className="text-[#AD314D] font-black">{altWeekWorkout.title}</span>
                </h5>
                <p className="text-[11px] text-emerald-800 mt-0.5">
                  You have a completed {altWeekWorkout.dayOfWeek} session in Week {altWeekWorkout.weekNumber} with {altWeekWorkout.exercises?.length || 0} exercises ({altWeekWorkout.exercises?.reduce((sum, e) => sum + (e.sets?.length || 0), 0) || 0} sets). Your data is 100% saved!
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => {
                  userHasManuallySelectedRef.current = true;
                  setSelectedWeek(altWeekWorkout.weekNumber || 1);
                }}
                className="px-3 py-1.5 rounded-xl bg-white hover:bg-neutral-50 text-[#222222] text-xs font-bold border border-emerald-300 shadow-2xs flex items-center gap-1 cursor-pointer"
              >
                <span>View Week {altWeekWorkout.weekNumber} Session</span>
                <ArrowRight className="w-3.5 h-3.5 text-emerald-600" />
              </button>
              <button
                type="button"
                onClick={() => handleCopyAltWeekSession(altWeekWorkout)}
                className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-2xs flex items-center gap-1 cursor-pointer"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>Copy to Week {selectedWeek}</span>
              </button>
            </div>
          </div>
        )}

        {/* REST DAY NOTICE */}
        {dayPlan?.isRestDay ? (
          <div className="p-8 rounded-3xl bg-gradient-to-b from-[#FAF9F8] to-[#F5F4F2] border border-black/[0.06] text-center space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-amber-100 text-amber-800 flex items-center justify-center mx-auto shadow-sm">
              <Calendar className="w-7 h-7" />
            </div>
            <div>
              <h4 className="text-lg font-bold text-[#222222]">
                Scheduled Rest &amp; Recovery Day
              </h4>
              <p className="text-xs text-[#777777] max-w-md mx-auto leading-relaxed mt-1">
                Currently designated as a recovery period in your training program. Want to train today or log active mobility? Add exercises directly below without leaving this page.
              </p>
            </div>

            <div className="pt-2 flex flex-wrap justify-center gap-3">
              <button
                type="button"
                onClick={() => setIsAddModalOpen(true)}
                className="px-5 py-2.5 rounded-2xl bg-[#AD314D] hover:bg-[#92263F] text-white text-xs font-bold shadow-sm transition-all flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                <span>Add Exercise to Today&apos;s Session</span>
              </button>
              <button
                type="button"
                onClick={() => handleToggleRestDay(false)}
                className="px-5 py-2.5 rounded-2xl bg-[#222222] hover:bg-black text-white text-xs font-bold shadow-sm transition-all flex items-center gap-1.5"
              >
                <Dumbbell className="w-4 h-4 text-emerald-400" />
                <span>Convert to Active Training Day</span>
              </button>
            </div>
          </div>
        ) : exerciseLogs.length === 0 ? (
          <div className="p-8 text-center bg-[#FBFBFA] rounded-3xl border border-black/[0.06] space-y-4">
            <Dumbbell className="w-10 h-10 text-[#777777] mx-auto opacity-40" />
            <div>
              <h4 className="text-base font-bold text-[#222222]">
                No Exercises Scheduled for This Session Yet
              </h4>
              <p className="text-xs text-[#777777] max-w-sm mx-auto mt-1">
                Add exercises right here in your live diary. Any movement you add will automatically appear in your Weekly Planner.
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setIsAddModalOpen(true)}
                className="px-5 py-2.5 rounded-2xl bg-[#AD314D] hover:bg-[#92263F] text-white text-xs font-bold shadow-sm transition-all flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                <span>Add Exercise to This Session</span>
              </button>
              <button
                type="button"
                onClick={() => handleToggleRestDay(true)}
                className="px-4 py-2.5 rounded-2xl bg-white border border-black/[0.1] text-xs font-semibold text-[#4A4A4A] hover:bg-neutral-50"
              >
                Mark as Rest Day Instead
              </button>
            </div>
          </div>
        ) : (
          /* LIST OF EXERCISES WITH THE CANONICAL TABLE STRUCTURE */
          <div className="space-y-6">
            <div className="flex items-center justify-between gap-2 px-1">
              <span className="text-xs font-bold text-[#777777] uppercase tracking-wider">
                {exerciseLogs.length} Exercise{exerciseLogs.length > 1 ? "s" : ""} in Session
              </span>
              <button
                type="button"
                onClick={() => setIsAddModalOpen(true)}
                className="text-xs font-bold text-[#AD314D] hover:underline flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Another Exercise</span>
              </button>
            </div>

            {exerciseLogs.map((exLog, exIdx) => {
              const plannedEx = dayPlan?.exercises?.[exIdx];
              const exTargetWeight = plannedEx?.targetWeight ?? exLog.sets[0]?.targetWeight ?? 0;
              const exTargetReps = plannedEx?.targetReps ?? exLog.sets[0]?.targetReps ?? "8-12";
              const exTotalVolume = exLog.sets.reduce(
                (sum, s) => sum + (s.completed ? s.actualWeight * s.actualReps : 0),
                0
              );

              return (
                <div
                  key={exIdx}
                  className="p-5 rounded-3xl bg-[#FAF9F8] border border-black/[0.06] shadow-sm space-y-4 transition-all"
                >
                  {/* Exercise Header */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-black/[0.05]">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="w-6 h-6 rounded-lg bg-[#222222] text-white font-bold text-xs flex items-center justify-center">
                          {exIdx + 1}
                        </span>
                        <h4 className="text-base font-bold text-[#222222]">
                          {exLog.exerciseName}
                        </h4>
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-neutral-200 text-[#4A4A4A]">
                          {exLog.muscleGroup}
                        </span>

                        {/* Equipment / Machine Selector */}
                        <div className="flex items-center gap-1 bg-white border border-black/[0.08] px-2 py-0.5 rounded-xl shadow-2xs">
                          <select
                            value={exLog.equipmentType || "barbell"}
                            onChange={(e) => handleUpdateEquipmentType(exIdx, e.target.value as EquipmentType)}
                            className="bg-transparent border-none text-[11px] font-bold text-[#4A4A4A] outline-none cursor-pointer"
                          >
                            {Object.entries(EQUIPMENT_LABELS).map(([key, label]) => (
                              <option key={key} value={key}>
                                {label}
                              </option>
                            ))}
                          </select>

                          {/* Machine dropdown if machine equipment selected */}
                          {(exLog.equipmentType?.includes("machine") || exLog.equipmentType === "cable_machine") && activeGymMachines.length > 0 && (
                            <select
                              value={exLog.machineId || ""}
                              onChange={(e) => handleUpdateMachineId(exIdx, e.target.value)}
                              className="bg-transparent border-l border-black/[0.1] pl-1 text-[11px] font-bold text-indigo-700 outline-none cursor-pointer max-w-[120px] truncate"
                            >
                              <option value="">(Select Machine)</option>
                              {activeGymMachines.map((m) => (
                                <option key={m.id} value={m.id}>
                                  {m.customName}
                                </option>
                              ))}
                            </select>
                          )}
                        </div>

                        {/* Reorder Up/Down */}
                        <div className="flex items-center gap-0.5 ml-1">
                          <button
                            type="button"
                            disabled={exIdx === 0}
                            onClick={() => handleMoveExercise(exIdx, "up")}
                            className="p-1 text-[#777777] hover:text-[#222222] disabled:opacity-20 transition-colors"
                            title="Move Exercise Up"
                          >
                            <ArrowUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            disabled={exIdx === exerciseLogs.length - 1}
                            onClick={() => handleMoveExercise(exIdx, "down")}
                            className="p-1 text-[#777777] hover:text-[#222222] disabled:opacity-20 transition-colors"
                            title="Move Exercise Down"
                          >
                            <ArrowDown className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {exLog.notes ? (
                        <p className="text-xs text-[#777777] mt-1 italic pl-8">
                          Cue: {exLog.notes}
                        </p>
                      ) : (
                        <p className="text-[11px] text-[#999999] mt-0.5 pl-8">
                          Target: {exLog.sets.length} sets × {exTargetReps} reps • {exTargetWeight} {unit}
                        </p>
                      )}
                    </div>

                    {/* Weight Stepper & Action Controls */}
                    <div className="flex items-center gap-2 self-start sm:self-auto pl-8 sm:pl-0 flex-wrap">
                      <div className="flex items-center bg-white border border-black/[0.08] rounded-xl p-0.5 shadow-2xs">
                        <button
                          type="button"
                          onClick={() => handleStepTargetWeight(exIdx, unit === "lbs" ? -5 : -2.5)}
                          className="w-7 h-7 flex items-center justify-center font-bold text-xs text-[#777777] hover:text-[#222222] hover:bg-neutral-100 rounded-lg transition-colors"
                          title="Decrease target weight"
                        >
                          -
                        </button>
                        <span className="px-2 text-xs font-bold text-[#222222] min-w-[56px] text-center" title="Target weight synced with planner">
                          {exTargetWeight} {unit}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleStepTargetWeight(exIdx, unit === "lbs" ? 5 : 2.5)}
                          className="w-7 h-7 flex items-center justify-center font-bold text-xs text-[#777777] hover:text-[#222222] hover:bg-neutral-100 rounded-lg transition-colors"
                          title="Increase target weight"
                        >
                          +
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleCopyLastWeekWeights(exIdx)}
                        className="px-2.5 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-950 border border-indigo-200 text-xs font-bold flex items-center gap-1 transition-colors"
                        title="Copy weights from previous completed workout session"
                      >
                        <RefreshCw className="w-3 h-3 text-indigo-600" />
                        <span className="hidden sm:inline">Copy Last Wk</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleOpenEditExercise(exIdx)}
                        className="p-1.5 rounded-xl bg-white border border-black/[0.08] text-[#777777] hover:text-[#222222] hover:bg-neutral-50 transition-colors"
                        title="Edit exercise details"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDeleteExercise(exIdx)}
                        className="p-1.5 rounded-xl bg-white border border-black/[0.08] text-[#777777] hover:text-rose-600 hover:bg-rose-50 transition-colors"
                        title="Delete exercise"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* SETS TABLE: | Exercise | Equipment / machine | Set | Planned weight | Planned reps | Actual weight | Actual reps | RPE | Done | */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="text-[#777777] border-b border-black/[0.05] pb-1 font-bold uppercase text-[10px]">
                          <th className="py-2 pl-2 w-12">Set</th>
                          <th className="py-2 w-28">Planned Weight</th>
                          <th className="py-2 w-24">Planned Reps</th>
                          <th className="py-2 w-32">Actual Weight ({unit})</th>
                          <th className="py-2 w-28">Actual Reps</th>
                          <th className="py-2 w-24">RPE</th>
                          <th className="py-2 w-28 text-center">Done</th>
                          <th className="py-2 w-10"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-black/[0.04]">
                        {exLog.sets.map((s, sIdx) => (
                          <tr
                            key={sIdx}
                            className={`transition-colors ${
                              s.completed ? "bg-emerald-50/40" : "hover:bg-black/[0.01]"
                            }`}
                          >
                            <td className="py-2.5 pl-2 font-bold text-[#222222]">
                              #{s.setNumber}
                            </td>
                            <td className="py-2.5 text-[#777777] font-semibold">
                              {s.targetWeight !== undefined ? `${s.targetWeight} ${unit}` : "BW"}
                            </td>
                            <td className="py-2.5 text-[#777777] font-semibold">
                              {s.targetReps}
                            </td>
                            <td className="py-2.5">
                              <input
                                type="number"
                                step={0.5}
                                min={0}
                                value={s.actualWeight}
                                onChange={(e) =>
                                  handleUpdateSetWeight(
                                    exIdx,
                                    sIdx,
                                    parseFloat(e.target.value) || 0
                                  )
                                }
                                className="w-20 px-2.5 py-1.5 rounded-xl border border-black/[0.12] bg-white text-xs font-bold text-[#222222] focus:ring-2 focus:ring-[#AD314D] outline-none"
                              />
                            </td>
                            <td className="py-2.5">
                              <input
                                type="number"
                                min={0}
                                value={s.actualReps}
                                onChange={(e) =>
                                  handleUpdateSetReps(
                                    exIdx,
                                    sIdx,
                                    parseInt(e.target.value) || 0
                                  )
                                }
                                className="w-16 px-2.5 py-1.5 rounded-xl border border-black/[0.12] bg-white text-xs font-bold text-[#222222] focus:ring-2 focus:ring-[#AD314D] outline-none"
                              />
                            </td>
                            <td className="py-2.5">
                              <select
                                value={s.rpe}
                                onChange={(e) =>
                                  handleUpdateSetRpe(exIdx, sIdx, parseFloat(e.target.value))
                                }
                                className="px-2 py-1.5 rounded-xl border border-black/[0.12] bg-white text-xs font-semibold text-[#222222] outline-none"
                              >
                                <option value={6}>RPE 6</option>
                                <option value={6.5}>RPE 6.5</option>
                                <option value={7}>RPE 7</option>
                                <option value={7.5}>RPE 7.5</option>
                                <option value={8}>RPE 8</option>
                                <option value={8.5}>RPE 8.5</option>
                                <option value={9}>RPE 9</option>
                                <option value={9.5}>RPE 9.5</option>
                                <option value={10}>RPE 10</option>
                              </select>
                            </td>
                            <td className="py-2.5 text-center">
                              <button
                                type="button"
                                onClick={() => handleToggleSetCompleted(exIdx, sIdx)}
                                className={`px-3 py-1 rounded-xl text-xs font-bold transition-all inline-flex items-center gap-1 ${
                                  s.completed
                                    ? "bg-emerald-600 text-white shadow-sm"
                                    : "bg-neutral-100 hover:bg-neutral-200 text-[#4A4A4A]"
                                }`}
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>{s.completed ? "Done" : "Mark"}</span>
                              </button>
                            </td>
                            <td className="py-2.5 text-right pr-2">
                              {exLog.sets.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => handleRemoveSet(exIdx, sIdx)}
                                  className="text-[#777777] hover:text-rose-600 transition-colors p-1"
                                  title="Remove set"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Add set button & Exercise tonnage footer */}
                  <div className="pt-2 flex items-center justify-between text-xs text-[#777777]">
                    <button
                      type="button"
                      onClick={() => handleAddSet(exIdx)}
                      className="px-3 py-1.5 rounded-xl bg-white border border-black/[0.08] hover:bg-neutral-50 text-xs font-bold text-[#222222] flex items-center gap-1.5 transition-colors shadow-2xs"
                    >
                      <Plus className="w-3 h-3 text-[#AD314D]" />
                      <span>Add Set</span>
                    </button>
                    <span className="font-semibold text-[#4A4A4A]">
                      Exercise Volume: <strong>{exTotalVolume.toLocaleString()} {unit}</strong>
                    </span>
                  </div>
                </div>
              );
            })}

            {/* Bottom Add Exercise Trigger */}
            <div className="pt-2 text-center">
              <button
                type="button"
                onClick={() => setIsAddModalOpen(true)}
                className="px-5 py-3 rounded-2xl border-2 border-dashed border-black/[0.15] hover:border-[#AD314D] hover:bg-rose-50/40 text-xs font-bold text-[#222222] transition-all inline-flex items-center gap-2"
              >
                <Plus className="w-4 h-4 text-[#AD314D]" />
                <span>Add Another Exercise to Today&apos;s Session</span>
              </button>
            </div>
          </div>
        )}

        {/* POST-SESSION BIOMETRICS & JOURNAL */}
        {!dayPlan?.isRestDay && exerciseLogs.length > 0 && (
          <div className="p-6 rounded-3xl bg-[#F8F8F7] border border-black/[0.06] space-y-4">
            <h4 className="font-bold text-sm text-[#222222] flex items-center gap-2">
              <Smile className="w-4 h-4 text-[#AD314D]" />
              <span>Session Subjective Feeling &amp; Diary Journal</span>
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-semibold text-[#4A4A4A] mb-1">
                  Overall Session Rating (1-5)
                </label>
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setSessionRating(star)}
                      className={`w-9 h-9 rounded-xl font-bold text-xs transition-all ${
                        sessionRating >= star
                          ? "bg-amber-400 text-amber-950 shadow-sm"
                          : "bg-white border border-black/[0.08] text-[#777777]"
                      }`}
                    >
                      ★ {star}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#4A4A4A] mb-1">
                  Session RPE ({sessionRpe})
                </label>
                <select
                  value={sessionRpe}
                  onChange={(e) => setSessionRpe(parseFloat(e.target.value))}
                  className="w-full px-3 py-2 rounded-xl border border-black/[0.1] bg-white text-xs font-semibold text-[#222222]"
                >
                  <option value={6}>6 - Light Warmup Effort</option>
                  <option value={6.5}>6.5 - Moderate Effort</option>
                  <option value={7}>7 - 3 Reps in Reserve</option>
                  <option value={7.5}>7.5 - 2-3 Reps in Reserve</option>
                  <option value={8}>8 - 2 Reps in Reserve</option>
                  <option value={8.5}>8.5 - 1-2 Reps in Reserve</option>
                  <option value={9}>9 - 1 Rep in Reserve (Heavy)</option>
                  <option value={9.5}>9.5 - 0-1 Rep in Reserve</option>
                  <option value={10}>10 - Maximum Exertion (0 RIR)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#4A4A4A] mb-1">
                  Muscle Soreness Level (1-5)
                </label>
                <select
                  value={sorenessRating}
                  onChange={(e) => setSorenessRating(parseInt(e.target.value))}
                  className="w-full px-3 py-2 rounded-xl border border-black/[0.1] bg-white text-xs font-semibold text-[#222222]"
                >
                  <option value={1}>1 - Fresh / No Soreness</option>
                  <option value={2}>2 - Mild Warmth / Light Pump</option>
                  <option value={3}>3 - Moderate Fatigue</option>
                  <option value={4}>4 - Heavy Soreness</option>
                  <option value={5}>5 - Maximum Fatigue / DOMS</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#4A4A4A] mb-1">
                  Energy &amp; Readiness
                </label>
                <select
                  value={energyLevel}
                  onChange={(e) => setEnergyLevel(e.target.value as any)}
                  className="w-full px-3 py-2 rounded-xl border border-black/[0.1] bg-white text-xs font-semibold text-[#222222]"
                >
                  <option value="high">High - Explosive power</option>
                  <option value="moderate">Moderate - Standard grind</option>
                  <option value="low">Low - Needed extra warmup</option>
                </select>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-[#4A4A4A]">
                  Lifting Diary Notes
                </label>
                <button
                  type="button"
                  onClick={handleSaveFeelingAndJournal}
                  className="text-xs font-bold text-[#AD314D] hover:text-[#881D35] transition-colors inline-flex items-center gap-1 px-2.5 py-1 rounded-lg hover:bg-rose-50"
                  title="Save subjective feeling and journal notes immediately to local & cloud"
                >
                  <Save className="w-3.5 h-3.5 text-[#AD314D]" />
                  <span>Save Feeling &amp; Notes</span>
                </button>
              </div>
              <textarea
                rows={2}
                placeholder="Log form notes, barbell velocity, joint comfort, or PR attempts..."
                value={journalNotes}
                onChange={(e) => setJournalNotes(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-black/[0.1] bg-white text-xs text-[#222222] focus:ring-2 focus:ring-[#AD314D] outline-none"
              />
            </div>

            {/* FINISH & SAVE BUTTONS */}
            <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-black/[0.06] pt-4">
              <div className="text-xs text-[#777777]">
                Completed: <strong>{completedSets} / {totalSets} sets</strong> • Volume: <strong>{totalVolumeLifted.toLocaleString()} {unit}</strong>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={handleSaveFeelingAndJournal}
                  className="px-4 py-2.5 rounded-2xl bg-white hover:bg-rose-50/50 text-[#AD314D] text-xs font-bold border border-[#AD314D]/30 shadow-2xs transition-all flex items-center gap-1.5"
                  title="Save subjective feeling, RPE, soreness, and notes immediately"
                >
                  <Smile className="w-4 h-4 text-[#AD314D]" />
                  <span>Save Journal &amp; Feeling</span>
                </button>

                <button
                  type="button"
                  onClick={handleSaveWorkoutInProgress}
                  className="px-5 py-2.5 rounded-2xl bg-white hover:bg-neutral-100 text-[#222222] text-xs font-bold border border-black/[0.1] shadow-2xs transition-all flex items-center gap-1.5"
                >
                  <Save className="w-4 h-4 text-emerald-600" />
                  <span>Save Workout (In Progress)</span>
                </button>

                <button
                  type="button"
                  onClick={handleRequestFinish}
                  className="px-6 py-2.5 rounded-2xl bg-gradient-to-r from-[#AD314D] to-[#881D35] hover:from-[#92263F] hover:to-[#6D1528] text-white text-xs font-bold shadow-md transition-all flex items-center justify-center gap-2"
                >
                  <CheckCircle2 className="w-4 h-4 text-white" />
                  <span>{isDayAlreadyCompleted ? "Save Changes to Diary" : "Finish & Save to Diary"}</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* MODAL: INCOMPLETE SETS CONFIRMATION */}
      {isFinishConfirmOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-black/[0.1] space-y-4">
            <div className="flex items-center gap-3 text-amber-600">
              <AlertTriangle className="w-6 h-6 flex-shrink-0" />
              <h3 className="text-base font-bold text-[#222222]">
                Uncompleted Sets in Session
              </h3>
            </div>
            <p className="text-xs text-[#4A4A4A] leading-relaxed">
              You have <strong>{totalSets - completedSets} uncompleted sets</strong>. Would you like to mark all sets as done or finish the workout logging only the completed sets?
            </p>
            <div className="flex flex-col sm:flex-row gap-2 pt-2">
              <button
                type="button"
                onClick={() => executeFinishSession(true)}
                className="flex-1 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-sm"
              >
                Mark All Done &amp; Finish
              </button>
              <button
                type="button"
                onClick={() => executeFinishSession(false)}
                className="flex-1 px-4 py-2 rounded-xl bg-neutral-900 hover:bg-black text-white text-xs font-bold shadow-sm"
              >
                Finish &amp; Skip Unchecked
              </button>
              <button
                type="button"
                onClick={() => setIsFinishConfirmOpen(false)}
                className="px-3 py-2 rounded-xl bg-neutral-100 text-[#4A4A4A] text-xs font-semibold"
              >
                Keep Training
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: ADD GYM */}
      {isGymModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-black/[0.1] space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-black/[0.06]">
              <h3 className="text-base font-bold text-[#222222] flex items-center gap-2">
                <Building2 className="w-5 h-5 text-indigo-600" />
                <span>Add Training Gym</span>
              </h3>
              <button
                type="button"
                onClick={() => setIsGymModalOpen(false)}
                className="p-1 rounded-full hover:bg-neutral-100 text-[#777777]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateGym} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-[#222222] mb-1">
                  Gym / Facility Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Gold's Gym Venice, Equinox"
                  value={newGymName}
                  onChange={(e) => setNewGymName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-black/[0.15] text-xs font-semibold text-[#222222] outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#222222] mb-1">
                  Location (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Venice Beach, CA"
                  value={newGymLocation}
                  onChange={(e) => setNewGymLocation(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-black/[0.15] text-xs font-semibold text-[#222222] outline-none"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsGymModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-neutral-100 text-[#4A4A4A] text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-sm"
                >
                  Add Gym
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ADD EXERCISE */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-black/[0.1] max-h-[90vh] overflow-y-auto space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-black/[0.06]">
              <div>
                <h3 className="text-lg font-bold text-[#222222] flex items-center gap-2">
                  <Plus className="w-5 h-5 text-[#AD314D]" />
                  <span>Add Exercise to Today&apos;s Session</span>
                </h3>
                <p className="text-xs text-[#777777]">
                  Instantly syncs with {selectedDay} (Week {selectedWeek}) in the Planner.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="p-1.5 rounded-full hover:bg-neutral-100 text-[#777777] transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Quick-Pick Popular Movements */}
            <div>
              <label className="block text-[11px] font-bold text-[#777777] uppercase tracking-wider mb-1.5">
                Quick-Pick Popular Movements:
              </label>
              <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto pr-1">
                {POPULAR_EXERCISES.map((pop) => (
                  <button
                    key={pop.name}
                    type="button"
                    onClick={() => {
                      setAddForm({
                        name: pop.name,
                        muscleGroup: pop.group,
                        equipmentType: pop.equipment,
                        sets: 3,
                        reps: pop.reps,
                        weight: pop.weight,
                        notes: ""
                      });
                    }}
                    className={`px-2.5 py-1 rounded-xl text-xs font-semibold transition-all border ${
                      addForm.name === pop.name
                        ? "bg-[#AD314D] text-white border-[#AD314D]"
                        : "bg-[#F8F8F7] hover:bg-neutral-100 text-[#4A4A4A] border-black/[0.06]"
                    }`}
                  >
                    {pop.name}
                  </button>
                ))}
              </div>
            </div>

            <form onSubmit={handleAddExerciseSubmit} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-[#222222] mb-1">
                  Exercise Name *
                </label>
                <input
                  type="text"
                  required
                  list="diary-exercise-catalog"
                  placeholder="e.g. Incline Dumbbell Bench Press"
                  value={addForm.name}
                  onChange={(e) => {
                    const typed = e.target.value;
                    const matched = catalog.find(
                      (c) => c.name.toLowerCase() === typed.trim().toLowerCase()
                    );
                    setAddForm((prev) => ({
                      ...prev,
                      name: typed,
                      muscleGroup: matched ? matched.muscleGroup : prev.muscleGroup
                    }));
                  }}
                  className="w-full px-3.5 py-2 rounded-xl border border-black/[0.15] text-xs font-semibold text-[#222222] focus:ring-2 focus:ring-[#AD314D] outline-none"
                />
                <datalist id="diary-exercise-catalog">
                  {catalog.map((c) => (
                    <option key={c.name} value={c.name}>
                      {c.muscleGroup}
                    </option>
                  ))}
                </datalist>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-[#222222] mb-1">
                    Target Muscle Group
                  </label>
                  <select
                    value={addForm.muscleGroup}
                    onChange={(e) =>
                      setAddForm((prev) => ({ ...prev, muscleGroup: e.target.value as MuscleGroup }))
                    }
                    className="w-full px-3.5 py-2 rounded-xl border border-black/[0.15] text-xs font-semibold text-[#222222] bg-white outline-none"
                  >
                    {MUSCLE_GROUPS.map((mg) => (
                      <option key={mg} value={mg}>
                        {mg}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#222222] mb-1">
                    Equipment Type
                  </label>
                  <select
                    value={addForm.equipmentType}
                    onChange={(e) =>
                      setAddForm((prev) => ({ ...prev, equipmentType: e.target.value as EquipmentType }))
                    }
                    className="w-full px-3.5 py-2 rounded-xl border border-black/[0.15] text-xs font-semibold text-[#222222] bg-white outline-none"
                  >
                    {Object.entries(EQUIPMENT_LABELS).map(([k, lbl]) => (
                      <option key={k} value={k}>
                        {lbl}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-[#222222] mb-1">
                    Target Sets
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={12}
                    value={addForm.sets}
                    onChange={(e) =>
                      setAddForm((prev) => ({ ...prev, sets: parseInt(e.target.value) || 1 }))
                    }
                    className="w-full px-3 py-2 rounded-xl border border-black/[0.15] text-xs font-bold text-[#222222] outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#222222] mb-1">
                    Target Reps
                  </label>
                  <input
                    type="text"
                    placeholder="8-12"
                    value={addForm.reps}
                    onChange={(e) => setAddForm((prev) => ({ ...prev, reps: e.target.value }))}
                    className="w-full px-3 py-2 rounded-xl border border-black/[0.15] text-xs font-bold text-[#222222] outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#222222] mb-1">
                    Target Weight ({unit})
                  </label>
                  <input
                    type="number"
                    step={0.5}
                    min={0}
                    placeholder="0"
                    value={addForm.weight}
                    onChange={(e) =>
                      setAddForm((prev) => ({
                        ...prev,
                        weight: e.target.value === "" ? "" : parseFloat(e.target.value) || 0
                      }))
                    }
                    className="w-full px-3 py-2 rounded-xl border border-black/[0.15] text-xs font-bold text-[#222222] outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#222222] mb-1">
                  Warmup Cues or Notes (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. 2s paused at bottom, focus on lat stretch"
                  value={addForm.notes}
                  onChange={(e) => setAddForm((prev) => ({ ...prev, notes: e.target.value }))}
                  className="w-full px-3.5 py-2 rounded-xl border border-black/[0.15] text-xs text-[#222222] outline-none"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-neutral-100 hover:bg-neutral-200 text-[#4A4A4A] text-xs font-bold transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-[#AD314D] hover:bg-[#92263F] text-white text-xs font-bold shadow-md transition-colors"
                >
                  Add to Today&apos;s Session
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: EDIT EXERCISE */}
      {editingExIndex !== null && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-black/[0.1] space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-black/[0.06]">
              <h3 className="text-lg font-bold text-[#222222] flex items-center gap-2">
                <Edit2 className="w-5 h-5 text-[#AD314D]" />
                <span>Edit Exercise &amp; Settings</span>
              </h3>
              <button
                type="button"
                onClick={() => setEditingExIndex(null)}
                className="p-1.5 rounded-full hover:bg-neutral-100 text-[#777777]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEditExercise} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-[#222222] mb-1">
                  Exercise Name *
                </label>
                <input
                  type="text"
                  required
                  value={editForm.name}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, name: e.target.value }))}
                  className="w-full px-3.5 py-2 rounded-xl border border-black/[0.15] text-xs font-semibold text-[#222222] outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-[#222222] mb-1">
                    Target Muscle Group
                  </label>
                  <select
                    value={editForm.muscleGroup}
                    onChange={(e) =>
                      setEditForm((prev) => ({ ...prev, muscleGroup: e.target.value as MuscleGroup }))
                    }
                    className="w-full px-3.5 py-2 rounded-xl border border-black/[0.15] text-xs font-semibold text-[#222222] bg-white outline-none"
                  >
                    {MUSCLE_GROUPS.map((mg) => (
                      <option key={mg} value={mg}>
                        {mg}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#222222] mb-1">
                    Equipment Type
                  </label>
                  <select
                    value={editForm.equipmentType}
                    onChange={(e) =>
                      setEditForm((prev) => ({ ...prev, equipmentType: e.target.value as EquipmentType }))
                    }
                    className="w-full px-3.5 py-2 rounded-xl border border-black/[0.15] text-xs font-semibold text-[#222222] bg-white outline-none"
                  >
                    {Object.entries(EQUIPMENT_LABELS).map(([k, lbl]) => (
                      <option key={k} value={k}>
                        {lbl}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#222222] mb-1">
                  Warmup Cues or Notes
                </label>
                <input
                  type="text"
                  value={editForm.notes}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, notes: e.target.value }))}
                  className="w-full px-3.5 py-2 rounded-xl border border-black/[0.15] text-xs text-[#222222] outline-none"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingExIndex(null)}
                  className="px-4 py-2 rounded-xl bg-neutral-100 hover:bg-neutral-200 text-[#4A4A4A] text-xs font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-[#AD314D] hover:bg-[#92263F] text-white text-xs font-bold shadow-md"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
