import React, { useState, useRef, useEffect, useMemo } from "react";
import {
  WeeklyMatrixPlan,
  DayOfWeek,
  PlannedExercise,
  PlannedSet,
  WeightUnit,
  UserProfile,
  WorkoutPlan,
  MatrixDayCell,
  MuscleGroup,
  TrainingProgram,
  WorkoutSession,
  ExerciseLog,
  ExerciseReference,
  FitnessGoal,
  Gym,
  GymMachine
} from "../types";
import {
  DAYS_OF_WEEK,
  autoFillWeeksFromWeek1,
  createPreplannedPrograms,
  createBlankMatrixPlan,
  isDeloadWeek,
  getWeekTheme,
  computeDateForDay,
  formatFriendlyDate,
  shiftAllMatrixDates,
  getTodayOrCurrentMondayDate,
  getTodayDateStr,
  CANONICAL_PROGRAM_START_DATE,
  isValidDateStr
} from "../utils/fitnessData";
import { resolveSession, cleanNumber } from "../utils/sessionResolver";
import {
  EXERCISE_CATALOG,
  calculateSmartProgression,
  exportMatrixPlanToExcelBlob,
  exportWorkoutLogsToExcelBlob,
  smartParseMatrixSpreadsheet,
  saveCustomExerciseToCatalog,
  getFullExerciseCatalog,
  isSameExercise
} from "../utils/calculations";
import {
  Sparkles,
  Calendar,
  CalendarDays,
  ChevronRight,
  ChevronLeft,
  ArrowLeft,
  Plus,
  Play,
  Copy,
  RefreshCw,
  CheckCircle2,
  TrendingUp,
  Dumbbell,
  Clock,
  Layers,
  ChevronDown,
  ChevronUp,
  Trash2,
  Edit2,
  Check,
  X,
  SlidersHorizontal,
  ArrowRight,
  RotateCcw,
  Maximize2,
  Target,
  BookOpen,
  FileSpreadsheet,
  Download,
  Upload,
  Zap,
  Eraser,
  Info,
  Database,
  Save,
  ZoomIn,
  ZoomOut,
  Building2,
  ListChecks
} from "lucide-react";
import { getStoredGyms, addOrUpdateGym, addOrUpdateMachine, getWorkoutDraft, saveWorkoutDraft } from "../utils/userStorage";

interface WeeklyMatrixPlannerProps {
  matrixPlans: WeeklyMatrixPlan[];
  onUpdatePlans?: (plans: WeeklyMatrixPlan[]) => void;
  onUpdateMatrixPlans?: (plans: WeeklyMatrixPlan[]) => void;
  unit: WeightUnit;
  userProfile?: UserProfile;
  onStartSession?: (dayPlan: MatrixDayCell) => void;
  onStartWorkout?: (plan: WorkoutPlan) => void;
  onOpenAiGenerator: () => void;
  onOpenOnboarding?: () => void;
  programs?: TrainingProgram[];
  activeProgramId?: string;
  onSelectProgram?: (programId: string) => void;
  onUpdateProgram?: (program: TrainingProgram) => void;
  onUpdateProgramObjectives?: (programId: string, primary: string, secondary?: string) => void;
  onUpdateProgramName?: (programId: string, newName: string) => void;
  onCreateCustomProgram?: (newProgram: TrainingProgram) => void;
  onDeleteProgram?: (programId: string) => void;
  onNavigateToDiary?: (target?: { week?: number; day?: DayOfWeek; date?: string }) => void;
  workouts?: WorkoutSession[];
  completedDaysRecord?: Record<string, boolean>;
  onSaveDayCompleted?: (weekOrKey: number | string, dayOrCompleted?: DayOfWeek | boolean, isCompleted?: boolean) => void;
  onUpdateWorkout?: (workout: WorkoutSession) => void;
}

export const WeeklyMatrixPlanner: React.FC<WeeklyMatrixPlannerProps> = ({
  matrixPlans,
  onUpdatePlans,
  onUpdateMatrixPlans,
  unit,
  userProfile,
  onStartSession,
  onStartWorkout,
  onOpenAiGenerator,
  onOpenOnboarding,
  programs = [],
  activeProgramId,
  onSelectProgram,
  onUpdateProgram,
  onUpdateProgramObjectives,
  onUpdateProgramName,
  onCreateCustomProgram,
  onDeleteProgram,
  onNavigateToDiary,
  workouts = [],
  completedDaysRecord = {},
  onSaveDayCompleted,
  onUpdateWorkout
}) => {
  const [totalWeeksView, setTotalWeeksView] = useState<number>(() => {
    try {
      const saved = localStorage.getItem("pulse_matrix_total_weeks");
      if (saved) {
        const parsed = Number(saved);
        if (parsed > 0) return parsed;
      }
    } catch {}
    return 12;
  });
  const [showMatrixInfoModal, setShowMatrixInfoModal] = useState(false);
  const [confirmDeleteProgramId, setConfirmDeleteProgramId] = useState<string | null>(null);
  const [isSavedFeedback, setIsSavedFeedback] = useState(false);
  const [gridMode, setGridMode] = useState<"plan" | "completed" | "compare">("plan");
  const [showDayInspector, setShowDayInspector] = useState(false);
  const [selectedCell, setSelectedCell] = useState<{ weekNumber: number; day: DayOfWeek }>({
    weekNumber: 1,
    day: "Monday"
  });

  // Gyms & Machines state
  const currentUserId = userProfile?.id || "default";
  const [plannerGyms, setPlannerGyms] = useState<Gym[]>(() => getStoredGyms(currentUserId));
  const [isPlannerGymModalOpen, setIsPlannerGymModalOpen] = useState(false);
  const [newPlannerGymName, setNewPlannerGymName] = useState("");
  const [newPlannerGymLocation, setNewPlannerGymLocation] = useState("");

  const [isPlannerMachineModalOpen, setIsPlannerMachineModalOpen] = useState(false);
  const [addingMachineForPlannerExIdx, setAddingMachineForPlannerExIdx] = useState<number | null>(null);
  const [newPlannerMachineName, setNewPlannerMachineName] = useState("");
  const [newPlannerMachineBrand, setNewPlannerMachineBrand] = useState("");

  useEffect(() => {
    const handleGymsUpdate = () => {
      setPlannerGyms(getStoredGyms(currentUserId));
    };
    handleGymsUpdate();
    window.addEventListener("gyms-updated", handleGymsUpdate);
    window.addEventListener("storage", handleGymsUpdate);
    return () => {
      window.removeEventListener("gyms-updated", handleGymsUpdate);
      window.removeEventListener("storage", handleGymsUpdate);
    };
  }, [currentUserId]);

  // In-grid inline quick-add exercise state
  const [activeQuickAddCell, setActiveQuickAddCell] = useState<{ weekNumber: number; day: DayOfWeek } | null>(null);
  const [cellQuickAddName, setCellQuickAddName] = useState("Barbell Bench Press");
  const [cellQuickAddWeight, setCellQuickAddWeight] = useState<number | "">(60);
  const [cellQuickAddSets, setCellQuickAddSets] = useState(3);
  const [cellQuickAddReps, setCellQuickAddReps] = useState("8-12");

  // Dynamic current week detection based on today's calendar date
  const detectedActualWeekNumber = useMemo(() => {
    const today = new Date().toISOString().split("T")[0];
    // 1. Direct match on cell date
    for (const plan of matrixPlans) {
      if (plan.days) {
        for (const day of DAYS_OF_WEEK) {
          if (plan.days[day]?.date === today) {
            return plan.weekNumber;
          }
        }
      }
    }
    // 2. Range match between startDate and startDate + 7 days
    for (const plan of matrixPlans) {
      if (plan.startDate) {
        const start = new Date(plan.startDate).getTime();
        const end = start + 7 * 86400000;
        const now = new Date(today).getTime();
        if (now >= start && now < end) {
          return plan.weekNumber;
        }
      }
    }
    return 1;
  }, [matrixPlans]);

  // 2-Week Carousel & Readability Zoom State (defaults to current actual week)
  const [startWeekIndex, setStartWeekIndex] = useState<number>(() => {
    const today = new Date().toISOString().split("T")[0];
    for (const plan of matrixPlans) {
      if (plan.days) {
        for (const day of DAYS_OF_WEEK) {
          if (plan.days[day]?.date === today) {
            // For week 1 or 2, default to index 0 so Week 1 and Week 2 are both immediately visible
            return plan.weekNumber <= 2 ? 0 : Math.max(0, plan.weekNumber - 2);
          }
        }
      }
      if (plan.startDate) {
        const start = new Date(plan.startDate).getTime();
        const end = start + 7 * 86400000;
        const now = new Date(today).getTime();
        if (now >= start && now < end) {
          return plan.weekNumber <= 2 ? 0 : Math.max(0, plan.weekNumber - 2);
        }
      }
    }
    return 0;
  });
  const [viewMode, setViewMode] = useState<"2weeks" | "3weeks" | "all">("2weeks");

  // Readability Zoom state (persisted in localStorage for gym workout readability)
  const [isZoomed, setIsZoomed] = useState<boolean>(() => {
    try {
      return localStorage.getItem("pulse_matrix_zoom") === "true";
    } catch {
      return false;
    }
  });

  const toggleZoom = () => {
    setIsZoomed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("pulse_matrix_zoom", String(next));
      } catch {}
      return next;
    });
  };

  // Mobile Single-Week Vertical Layout state (defaults to current actual week)
  const [mobileSelectedWeek, setMobileSelectedWeek] = useState<number>(() => {
    const today = new Date().toISOString().split("T")[0];
    for (const plan of matrixPlans) {
      if (plan.days) {
        for (const day of DAYS_OF_WEEK) {
          if (plan.days[day]?.date === today) {
            return plan.weekNumber;
          }
        }
      }
      if (plan.startDate) {
        const start = new Date(plan.startDate).getTime();
        const end = start + 7 * 86400000;
        const now = new Date(today).getTime();
        if (now >= start && now < end) {
          return plan.weekNumber;
        }
      }
    }
    return 1;
  });
  const [mobileViewMode, setMobileViewMode] = useState<"vertical" | "grid">("vertical");

  // Track if user has manually browsed to another week during this session
  const hasUserOverriddenWeekRef = useRef(false);

  // Auto-align planner to the actual current week when matrixPlans updates
  useEffect(() => {
    if (!hasUserOverriddenWeekRef.current && detectedActualWeekNumber > 0) {
      setMobileSelectedWeek(detectedActualWeekNumber);
      // For week 1 or 2, default to index 0 so Week 1 and Week 2 are both immediately visible
      const targetStartIdx = detectedActualWeekNumber <= 2
        ? 0
        : Math.max(0, Math.min(Math.max(0, totalWeeksView - 2), detectedActualWeekNumber - 2));
      setStartWeekIndex(targetStartIdx);
    }
  }, [detectedActualWeekNumber, totalWeeksView]);

  // Cycle Start Date state (defaults to Week 1 startDate or CANONICAL_PROGRAM_START_DATE)
  const [cycleStartDate, setCycleStartDate] = useState<string>(() => {
    const sDate = matrixPlans[0]?.startDate;
    if (sDate && isValidDateStr(sDate)) return sDate;
    return CANONICAL_PROGRAM_START_DATE;
  });

  // Keep cycleStartDate synchronized when active program changes
  React.useEffect(() => {
    const sDate = matrixPlans[0]?.startDate;
    if (sDate && isValidDateStr(sDate)) {
      setCycleStartDate(sDate);
    } else {
      setCycleStartDate(CANONICAL_PROGRAM_START_DATE);
    }
  }, [activeProgramId, matrixPlans[0]?.startDate]);

  // Inline Cell Date Editing state: which cell currently has date picker open
  const [editingCellDateKey, setEditingCellDateKey] = useState<string | null>(null);

  // Table horizontal scroll container ref for finger touch and programmatic scrolling
  const tableContainerRef = useRef<HTMLDivElement>(null);

  // Helper to compute or get explicit date for a cell
  const getCellDate = (weekNumber: number, day: DayOfWeek, cell?: MatrixDayCell): string => {
    if (cell?.date) return cell.date;
    return computeDateForDay(cycleStartDate, weekNumber, day);
  };

  // Handler to shift the entire cycle start date across all weeks
  const handleCycleStartDateChange = (newDate: string) => {
    if (!newDate) return;
    setCycleStartDate(newDate);
    const shifted = shiftAllMatrixDates(matrixPlans, newDate);
    handleUpdatePlans(shifted);
    showToast(`Cycle schedule aligned: Week 1 starts on ${formatFriendlyDate(newDate)}`);
  };

  // Handler to update the date for a specific cell
  const handleCellDateChange = (weekNumber: number, day: DayOfWeek, newDate: string) => {
    if (!newDate) return;
    const newPlans = matrixPlans.map((wp) => {
      if (wp.weekNumber !== weekNumber) return wp;
      const dayCell = wp.days[day];
      if (!dayCell) return wp;
      return {
        ...wp,
        days: {
          ...wp.days,
          [day]: {
            ...dayCell,
            date: newDate
          }
        }
      };
    });
    handleUpdatePlans(newPlans);
    setEditingCellDateKey(null);
    showToast(`Updated date for Week ${weekNumber} • ${day} to ${formatFriendlyDate(newDate)}`);
  };

  // Carousel navigation handlers
  const windowSize = viewMode === "2weeks" ? 2 : viewMode === "3weeks" ? 3 : totalWeeksView;
  const maxStartWeekIndex = Math.max(0, totalWeeksView - windowSize);

  const handlePrevWeeks = () => {
    hasUserOverriddenWeekRef.current = true;
    setStartWeekIndex((prev) => Math.max(0, prev - 1));
    if (tableContainerRef.current) {
      tableContainerRef.current.scrollTo({ left: 0, behavior: "smooth" });
    }
  };

  const handleNextWeeks = () => {
    hasUserOverriddenWeekRef.current = true;
    setStartWeekIndex((prev) => Math.min(maxStartWeekIndex, prev + 1));
    if (tableContainerRef.current) {
      tableContainerRef.current.scrollTo({ left: 0, behavior: "smooth" });
    }
  };

  const handleJumpToWeek = (targetWeekNum: number) => {
    hasUserOverriddenWeekRef.current = true;
    setMobileSelectedWeek(targetWeekNum);
    const newIdx = Math.max(0, Math.min(maxStartWeekIndex, targetWeekNum - 1));
    setStartWeekIndex(newIdx);
    if (tableContainerRef.current) {
      tableContainerRef.current.scrollTo({ left: 0, behavior: "smooth" });
    }
  };

  const handleJumpToCurrentWeek = () => {
    hasUserOverriddenWeekRef.current = false;
    setMobileSelectedWeek(detectedActualWeekNumber);
    const newIdx = Math.max(0, Math.min(maxStartWeekIndex, detectedActualWeekNumber - 1));
    setStartWeekIndex(newIdx);
    if (tableContainerRef.current) {
      tableContainerRef.current.scrollTo({ left: 0, behavior: "smooth" });
    }
    showToast(`Centered on actual current week (Week ${detectedActualWeekNumber})`);
  };

  // Helper to match a completed workout session strictly to a specific cell
  const getCompletedSessionForCell = (weekNumber: number, day: DayOfWeek): WorkoutSession | undefined => {
    if (!workouts || workouts.length === 0) return undefined;

    const plan = matrixPlans.find((p) => p.weekNumber === weekNumber);
    const dayCell = plan?.days?.[day];
    const cellDate = dayCell?.date || computeDateForDay(cycleStartDate, weekNumber, day);
    const cellDayKey = `w${weekNumber}-${day}`;

    // 1. High precision match: Both exact cell date AND exact cell dayKey/week/day
    if (cellDate) {
      const exactBothMatch = workouts.find(
        (w) =>
          w.date === cellDate &&
          (w.dayKey === cellDayKey ||
            w.dayKey === `${weekNumber}-${day}` ||
            (w.weekNumber === weekNumber && w.dayOfWeek === day))
      );
      if (exactBothMatch) return exactBothMatch;
    }

    // 2. Direct dayKey match (where workout date matches cellDate or is unset)
    const exactDayKeyMatch = workouts.find((w) => {
      if (w.date && cellDate && w.date !== cellDate) return false;
      return (
        w.dayKey === cellDayKey ||
        w.dayKey === `${weekNumber}-${day}` ||
        w.dayKey === `plan_${cellDayKey}` ||
        w.dayKey === `plan_${weekNumber}-${day}`
      );
    });
    if (exactDayKeyMatch) return exactDayKeyMatch;

    // 3. Explicit weekNumber AND dayOfWeek match (ONLY if the workout date does NOT contradict the cell date)
    const weekDayMatch = workouts.find((w) => {
      if (w.date && cellDate && w.date !== cellDate) return false;
      return w.weekNumber === weekNumber && w.dayOfWeek === day;
    });
    if (weekDayMatch) return weekDayMatch;

    // 4. Fallback: match by date if dayOfWeek matches or is empty
    if (cellDate) {
      const dateMatch = workouts.find((w) => w.date === cellDate && (!w.dayOfWeek || w.dayOfWeek === day));
      if (dateMatch) return dateMatch;
    }

    return undefined;
  };

  // Helper to determine if a cell is completed via real logged workouts or completion record
  const isCellCompleted = (weekNumber: number, day: DayOfWeek): boolean => {
    const key = `w${weekNumber}-${day}`;
    if (completedDaysRecord && (completedDaysRecord[key] || completedDaysRecord[`${weekNumber}-${day}`])) {
      return true;
    }
    const plan = matrixPlans.find((p) => p.weekNumber === weekNumber);
    const cellDate = plan?.days?.[day]?.date || computeDateForDay(cycleStartDate, weekNumber, day);
    if (cellDate && completedDaysRecord && (completedDaysRecord[cellDate] || completedDaysRecord[`day-${cellDate}`])) {
      return true;
    }
    return getCompletedSessionForCell(weekNumber, day) !== undefined;
  };

  // Direct Cell Handlers for In-Grid Editing
  const handleCellUpdateExercise = (
    weekNumber: number,
    day: DayOfWeek,
    exIndex: number,
    updates: Partial<PlannedExercise>
  ) => {
    const newPlans = matrixPlans.map((wp) => {
      if (wp.weekNumber !== weekNumber) return wp;
      const dayCell = wp.days[day];
      if (!dayCell) return wp;
      const newExercises = [...dayCell.exercises];
      const targetEx = { ...newExercises[exIndex], ...updates };

      if (updates.targetWeight !== undefined) {
        if (targetEx.sets && targetEx.sets.length > 0) {
          targetEx.sets = targetEx.sets.map((s) => ({
            ...s,
            weight: updates.targetWeight
          }));
        }
      }

      if (updates.targetSets !== undefined && updates.targetSets > 0) {
        const currentSets = targetEx.sets || [];
        if (currentSets.length < updates.targetSets) {
          const added = Array.from({ length: updates.targetSets - currentSets.length }, (_, i) => ({
            setNumber: currentSets.length + i + 1,
            weight: targetEx.targetWeight,
            reps: targetEx.targetReps
          }));
          targetEx.sets = [...currentSets, ...added];
        } else if (currentSets.length > updates.targetSets) {
          targetEx.sets = currentSets.slice(0, updates.targetSets);
        }
      }

      if (updates.targetReps !== undefined) {
        if (targetEx.sets && targetEx.sets.length > 0) {
          targetEx.sets = targetEx.sets.map((s) => ({
            ...s,
            reps: updates.targetReps
          }));
        }
      }

      newExercises[exIndex] = targetEx;
      return {
        ...wp,
        days: {
          ...wp.days,
          [day]: {
            ...dayCell,
            exercises: newExercises
          }
        }
      };
    });
    handleUpdatePlans(newPlans);

    const existingCompleted = getCompletedSessionForCell(weekNumber, day);
    if (existingCompleted && onUpdateWorkout) {
      const updatedExercises = (existingCompleted.exercises || []).map((ex, idx) => {
        if (idx !== exIndex && !isSameExercise(ex.exerciseName, updates.exerciseName || "")) return ex;
        return {
          ...ex,
          exerciseName: updates.exerciseName || ex.exerciseName,
          muscleGroup: (updates.muscleGroup as MuscleGroup) || ex.muscleGroup,
          sets: ex.sets.map((s) => ({
            ...s,
            weight: updates.targetWeight !== undefined ? cleanNumber(updates.targetWeight) : s.weight,
            reps: updates.targetReps !== undefined ? (parseInt(String(updates.targetReps)) || s.reps) : s.reps
          }))
        };
      });
      onUpdateWorkout({
        ...existingCompleted,
        exercises: updatedExercises,
        updatedAt: new Date().toISOString()
      });
    }
  };

  const handleCellStepWeight = (
    weekNumber: number,
    day: DayOfWeek,
    exIndex: number,
    delta: number
  ) => {
    const weekPlan = matrixPlans.find((w) => w.weekNumber === weekNumber);
    const dayCell = weekPlan?.days[day];
    if (!dayCell || !dayCell.exercises[exIndex]) return;
    const currentWeight = Number(dayCell.exercises[exIndex].targetWeight) || 0;
    const newWeight = Math.max(0, Math.round((currentWeight + delta) * 100) / 100);
    handleCellUpdateExercise(weekNumber, day, exIndex, { targetWeight: newWeight });
  };

  const handleCellToggleRestDay = (weekNumber: number, day: DayOfWeek) => {
    const newPlans = matrixPlans.map((wp) => {
      if (wp.weekNumber !== weekNumber) return wp;
      const dayCell = wp.days[day];
      if (!dayCell) return wp;
      const willBeRest = !dayCell.isRestDay;
      return {
        ...wp,
        days: {
          ...wp.days,
          [day]: {
            ...dayCell,
            isRestDay: willBeRest,
            workoutTitle: willBeRest
              ? "Rest & Active Recovery"
              : dayCell.workoutTitle === "Rest & Active Recovery"
              ? `${day} Training`
              : dayCell.workoutTitle
          }
        }
      };
    });
    handleUpdatePlans(newPlans);
    const isNowRest = newPlans.find((w) => w.weekNumber === weekNumber)?.days[day]?.isRestDay;
    showToast(`Week ${weekNumber} ${day} set to ${isNowRest ? "Rest Day" : "Training Day"}.`);
  };

  const handleCellDeleteExercise = (weekNumber: number, day: DayOfWeek, exIndex: number) => {
    const newPlans = matrixPlans.map((wp) => {
      if (wp.weekNumber !== weekNumber) return wp;
      const dayCell = wp.days[day];
      if (!dayCell) return wp;
      return {
        ...wp,
        days: {
          ...wp.days,
          [day]: {
            ...dayCell,
            exercises: dayCell.exercises.filter((_, i) => i !== exIndex)
          }
        }
      };
    });
    handleUpdatePlans(newPlans);
    showToast("Exercise removed from cell.");
  };

  const handleCellQuickAdd = (weekNumber: number, day: DayOfWeek) => {
    if (!cellQuickAddName.trim()) return;
    const matched = catalogExercises.find((c) => c.name.toLowerCase() === cellQuickAddName.toLowerCase());
    const muscle = matched ? matched.muscleGroup : "Full Body";
    const weightVal = cellQuickAddWeight === "" ? undefined : Number(cellQuickAddWeight);
    const newEx: PlannedExercise = {
      exerciseName: cellQuickAddName.trim(),
      muscleGroup: muscle,
      targetSets: cellQuickAddSets,
      targetReps: cellQuickAddReps,
      targetWeight: weightVal,
      sets: Array.from({ length: cellQuickAddSets }, (_, i) => ({
        setNumber: i + 1,
        weight: weightVal,
        reps: cellQuickAddReps
      }))
    };

    const newPlans = matrixPlans.map((wp) => {
      if (wp.weekNumber !== weekNumber) return wp;
      const dayCell = wp.days[day];
      if (!dayCell) return wp;
      return {
        ...wp,
        days: {
          ...wp.days,
          [day]: {
            ...dayCell,
            isRestDay: false,
            exercises: [...dayCell.exercises, newEx]
          }
        }
      };
    });
    handleUpdatePlans(newPlans);
    setActiveQuickAddCell(null);
    showToast(`Added "${cellQuickAddName}" to Week ${weekNumber} ${day}.`);
  };

  const handleCellUpdateSet = (
    weekNumber: number,
    day: DayOfWeek,
    exIndex: number,
    setIndex: number,
    newWeight?: number,
    newReps?: string | number
  ) => {
    const newPlans = matrixPlans.map((wp) => {
      if (wp.weekNumber !== weekNumber) return wp;
      const dayCell = wp.days[day];
      if (!dayCell) return wp;
      const newExercises = [...dayCell.exercises];
      const targetEx = { ...newExercises[exIndex] };
      const currentSets: PlannedSet[] =
        targetEx.sets && targetEx.sets.length > 0
          ? [...targetEx.sets]
          : Array.from({ length: targetEx.targetSets || 3 }, (_, i) => ({
              setNumber: i + 1,
              weight: targetEx.targetWeight,
              reps: targetEx.targetReps
            }));
      while (currentSets.length <= setIndex) {
        currentSets.push({
          setNumber: currentSets.length + 1,
          weight: targetEx.targetWeight,
          reps: targetEx.targetReps
        });
      }
      currentSets[setIndex] = {
        ...currentSets[setIndex],
        weight: newWeight !== undefined ? newWeight : currentSets[setIndex].weight,
        reps: newReps !== undefined ? newReps : currentSets[setIndex].reps
      };
      targetEx.sets = currentSets;
      targetEx.targetSets = currentSets.length;
      if (setIndex === 0 && newWeight !== undefined) {
        targetEx.targetWeight = newWeight;
      }
      newExercises[exIndex] = targetEx;
      return {
        ...wp,
        days: {
          ...wp.days,
          [day]: {
            ...dayCell,
            exercises: newExercises
          }
        }
      };
    });
    handleUpdatePlans(newPlans);
  };

  const handleCellAddSet = (weekNumber: number, day: DayOfWeek, exIndex: number) => {
    const newPlans = matrixPlans.map((wp) => {
      if (wp.weekNumber !== weekNumber) return wp;
      const dayCell = wp.days[day];
      if (!dayCell) return wp;
      const newExercises = [...dayCell.exercises];
      const targetEx = { ...newExercises[exIndex] };
      const currentSets: PlannedSet[] =
        targetEx.sets && targetEx.sets.length > 0
          ? [...targetEx.sets]
          : Array.from({ length: targetEx.targetSets || 3 }, (_, i) => ({
              setNumber: i + 1,
              weight: targetEx.targetWeight,
              reps: targetEx.targetReps
            }));
      const lastSet = currentSets[currentSets.length - 1];
      currentSets.push({
        setNumber: currentSets.length + 1,
        weight: lastSet?.weight ?? targetEx.targetWeight,
        reps: lastSet?.reps ?? targetEx.targetReps
      });
      targetEx.sets = currentSets;
      targetEx.targetSets = currentSets.length;
      newExercises[exIndex] = targetEx;
      return {
        ...wp,
        days: {
          ...wp.days,
          [day]: {
            ...dayCell,
            exercises: newExercises
          }
        }
      };
    });
    handleUpdatePlans(newPlans);
    showToast("Added set column to exercise.");
  };

  const handleCellRemoveSet = (weekNumber: number, day: DayOfWeek, exIndex: number) => {
    const newPlans = matrixPlans.map((wp) => {
      if (wp.weekNumber !== weekNumber) return wp;
      const dayCell = wp.days[day];
      if (!dayCell) return wp;
      const newExercises = [...dayCell.exercises];
      const targetEx = { ...newExercises[exIndex] };
      const currentSets: PlannedSet[] =
        targetEx.sets && targetEx.sets.length > 0
          ? [...targetEx.sets]
          : Array.from({ length: targetEx.targetSets || 3 }, (_, i) => ({
              setNumber: i + 1,
              weight: targetEx.targetWeight,
              reps: targetEx.targetReps
            }));
      if (currentSets.length <= 1) return wp;
      currentSets.pop();
      targetEx.sets = currentSets;
      targetEx.targetSets = currentSets.length;
      newExercises[exIndex] = targetEx;
      return {
        ...wp,
        days: {
          ...wp.days,
          [day]: {
            ...dayCell,
            exercises: newExercises
          }
        }
      };
    });
    handleUpdatePlans(newPlans);
    showToast("Removed last set from exercise.");
  };

  // Programs & Objectives State
  const [isProgramModalOpen, setIsProgramModalOpen] = useState(false);
  const [isCustomProgramModalOpen, setIsCustomProgramModalOpen] = useState(false);
  const [isEditProgramModalOpen, setIsEditProgramModalOpen] = useState(false);
  const [programToEdit, setProgramToEdit] = useState<TrainingProgram | null>(null);
  const [isEditingObjectives, setIsEditingObjectives] = useState(false);

  const currentProgram = programs.find((p) => p.id === activeProgramId) || programs[0];

  // Active matrix days count (detects if user has populated a 6th day or custom split)
  const activeMatrixDaysCount = React.useMemo(() => {
    if (!matrixPlans || matrixPlans.length === 0) return 0;
    let maxDays = 0;
    for (const wp of matrixPlans) {
      if (!wp.days) continue;
      let count = 0;
      for (const d of DAYS_OF_WEEK) {
        const cell = wp.days[d];
        if (cell && ((cell.exercises && cell.exercises.length > 0) || (cell.mainFocus && cell.mainFocus.trim() !== "" && !cell.isRestDay))) {
          count++;
        }
      }
      if (count > maxDays) maxDays = count;
    }
    return maxDays;
  }, [matrixPlans]);

  const [objPrimaryDraft, setObjPrimaryDraft] = useState(currentProgram?.primaryObjective || "");
  const [objSecondaryDraft, setObjSecondaryDraft] = useState(currentProgram?.secondaryObjective || "");
  const [objDaysDraft, setObjDaysDraft] = useState<number>(() => {
    return currentProgram?.daysPerWeek || currentProgram?.splitDaysPerWeek || (activeMatrixDaysCount > 0 ? activeMatrixDaysCount : 5);
  });
  const [objGoalDraft, setObjGoalDraft] = useState<FitnessGoal>(currentProgram?.goal || "bulk");

  // Edit program form state
  const [editProgName, setEditProgName] = useState("");
  const [editProgGoal, setEditProgGoal] = useState<FitnessGoal>("bulk");
  const [editProgDays, setEditProgDays] = useState<number>(6);
  const [editProgWeeks, setEditProgWeeks] = useState<number>(8);
  const [editProgPrimary, setEditProgPrimary] = useState("");
  const [editProgSecondary, setEditProgSecondary] = useState("");
  const [editProgDescription, setEditProgDescription] = useState("");

  // Custom program form state
  const [customProgName, setCustomProgName] = useState("");
  const [customProgGoal, setCustomProgGoal] = useState<"bulk" | "cut" | "recomp" | "strength">("strength");
  const [customProgDays, setCustomProgDays] = useState<number>(() => (activeMatrixDaysCount > 0 ? activeMatrixDaysCount : 6));
  const [customProgPrimary, setCustomProgPrimary] = useState("");
  const [customProgSecondary, setCustomProgSecondary] = useState("");
  const [customProgStartDate, setCustomProgStartDate] = useState<string>(getTodayDateStr);

  // Sync draft when currentProgram or activeMatrixDays changes
  React.useEffect(() => {
    if (currentProgram) {
      setObjPrimaryDraft(currentProgram.primaryObjective);
      setObjSecondaryDraft(currentProgram.secondaryObjective || "");
      const effDays = currentProgram.daysPerWeek || currentProgram.splitDaysPerWeek || (activeMatrixDaysCount > 0 ? activeMatrixDaysCount : 5);
      setObjDaysDraft(effDays);
      setObjGoalDraft(currentProgram.goal || "bulk");
    }
  }, [currentProgram?.id, currentProgram?.primaryObjective, currentProgram?.secondaryObjective, currentProgram?.daysPerWeek, currentProgram?.splitDaysPerWeek, currentProgram?.goal, activeMatrixDaysCount]);

  const handleOpenEditProgram = (prog?: TrainingProgram) => {
    const target = prog || currentProgram;
    if (!target) return;
    setProgramToEdit(target);
    setEditProgName(target.name);
    setEditProgGoal(target.goal || "bulk");
    const effDays = target.daysPerWeek || target.splitDaysPerWeek || (activeMatrixDaysCount > 0 ? activeMatrixDaysCount : 6);
    setEditProgDays(effDays);
    setEditProgWeeks(target.totalWeeks || target.durationWeeks || matrixPlans.length || 8);
    setEditProgPrimary(target.primaryObjective || "");
    setEditProgSecondary(target.secondaryObjective || "");
    setEditProgDescription(target.description || "");
    setIsEditProgramModalOpen(true);
  };

  const handleSaveEditProgram = (e: React.FormEvent) => {
    e.preventDefault();
    if (!programToEdit || !editProgName.trim()) return;

    const updatedProg: TrainingProgram = {
      ...programToEdit,
      name: editProgName.trim(),
      goal: editProgGoal,
      daysPerWeek: editProgDays,
      splitDaysPerWeek: editProgDays,
      durationWeeks: editProgWeeks,
      totalWeeks: editProgWeeks,
      primaryObjective: editProgPrimary.trim(),
      secondaryObjective: editProgSecondary.trim() || undefined,
      description: editProgDescription.trim() || programToEdit.description,
      isCustom: true,
      updatedAt: new Date().toISOString()
    };

    if (onUpdateProgram) {
      onUpdateProgram(updatedProg);
    } else {
      if (onUpdateProgramName) onUpdateProgramName(updatedProg.id, updatedProg.name);
      if (onUpdateProgramObjectives) onUpdateProgramObjectives(updatedProg.id, updatedProg.primaryObjective, updatedProg.secondaryObjective);
    }

    setIsEditProgramModalOpen(false);
    showToast(`Program "${updatedProg.name}" updated (${editProgDays} Days/Wk).`);
  };

  const handleQuickSyncDaysFromMatrix = () => {
    if (!currentProgram || activeMatrixDaysCount <= 0) return;
    const updatedProg: TrainingProgram = {
      ...currentProgram,
      daysPerWeek: activeMatrixDaysCount,
      splitDaysPerWeek: activeMatrixDaysCount,
      isCustom: true,
      updatedAt: new Date().toISOString()
    };
    if (onUpdateProgram) {
      onUpdateProgram(updatedProg);
    } else if (onUpdateProgramObjectives) {
      onUpdateProgramObjectives(currentProgram.id, currentProgram.primaryObjective, currentProgram.secondaryObjective);
    }
    showToast(`Aligned program setup to ${activeMatrixDaysCount} Days/Wk to match your planner!`);
  };

  // Mode toggles & modal
  const [isCellModalOpen, setIsCellModalOpen] = useState(false);
  const editorRef = useRef<HTMLDivElement>(null);
  const [isEditingDayDetails, setIsEditingDayDetails] = useState(false);
  const [isAddingExercise, setIsAddingExercise] = useState(false);
  const [progressionRate, setProgressionRate] = useState<number>(2.5);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // New exercise draft state
  const [newExName, setNewExName] = useState("Barbell Bench Press");
  const [newExMuscle, setNewExMuscle] = useState<MuscleGroup>("Chest");
  const [newExSets, setNewExSets] = useState(3);
  const [newExReps, setNewExReps] = useState("8-12");
  const [newExWeight, setNewExWeight] = useState<number | "">(60);
  const [newExNotes, setNewExNotes] = useState("");

  // Program Name editing state
  const [isEditingProgramName, setIsEditingProgramName] = useState(false);
  const [programNameDraft, setProgramNameDraft] = useState(currentProgram?.name || "");

  // Excel Modal State
  const [isExcelModalOpen, setIsExcelModalOpen] = useState(false);
  const [excelImportError, setExcelImportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Exercise catalog with custom exercises
  const [catalogExercises, setCatalogExercises] = useState<ExerciseReference[]>(() =>
    getFullExerciseCatalog()
  );

  useEffect(() => {
    setCatalogExercises(getFullExerciseCatalog());
  }, []);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const handleSelectCell = (weekNumber: number, day: DayOfWeek, openModal = true) => {
    setSelectedCell({ weekNumber, day });
    if (openModal) {
      setIsCellModalOpen(true);
    } else {
      setShowDayInspector(true);
      setTimeout(() => {
        editorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 50);
    }
  };

  // Safe wrapper to call parent update
  const handleUpdatePlans = (newPlans: WeeklyMatrixPlan[]) => {
    if (onUpdatePlans) onUpdatePlans(newPlans);
    if (onUpdateMatrixPlans) onUpdateMatrixPlans(newPlans);
  };

  // Auto-fill weeks 2..N from Week 1
  const handleAutoFill = () => {
    const week1 = matrixPlans[0];
    if (!week1) return;
    const filled = autoFillWeeksFromWeek1(week1, totalWeeksView, progressionRate);
    handleUpdatePlans(filled);
    showToast(`Auto-filled Weeks 2 through ${totalWeeksView} from Week 1 with +${progressionRate}% overload!`);
  };

  // Dynamically add a new week to the matrix
  const handleAddWeek = () => {
    const newWeekNum = matrixPlans.length + 1;
    const baseDate = cycleStartDate || new Date().toISOString().split("T")[0];
    const prevWeek = matrixPlans[matrixPlans.length - 1];

    let newWeekPlan: WeeklyMatrixPlan;

    if (prevWeek) {
      const isDeload = isDeloadWeek(newWeekNum);
      const overloadMult = isDeload ? 0.85 : 1 + (progressionRate / 100);
      const daysRec: Record<DayOfWeek, MatrixDayCell> = {} as any;

      for (const day of DAYS_OF_WEEK) {
        const prevCell = prevWeek.days[day];
        const cellDate = computeDateForDay(baseDate, newWeekNum, day);

        if (prevCell) {
          daysRec[day] = {
            day,
            date: cellDate,
            workoutTitle: prevCell.workoutTitle,
            isRestDay: prevCell.isRestDay,
            targetMuscleGroup: prevCell.targetMuscleGroup,
            notes: isDeload ? "Cycle Deload Week (50% Volume, 85% Load)" : prevCell.notes || `Week ${newWeekNum} progression`,
            exercises: prevCell.exercises.map((ex) => {
              const scaledWeight = ex.targetWeight ? Math.round(ex.targetWeight * overloadMult * 10) / 10 : undefined;
              return {
                ...ex,
                targetWeight: scaledWeight,
                sets: ex.sets ? ex.sets.map((s) => ({
                  ...s,
                  weight: s.weight ? Math.round(s.weight * overloadMult * 10) / 10 : scaledWeight
                })) : undefined
              };
            })
          };
        } else {
          daysRec[day] = {
            day,
            date: cellDate,
            workoutTitle: day === "Sunday" ? "Rest & Recovery" : `${day} Training Session`,
            isRestDay: day === "Sunday",
            targetMuscleGroup: day === "Sunday" ? "Rest" : "Full Body",
            notes: "",
            exercises: []
          };
        }
      }

      newWeekPlan = {
        weekNumber: newWeekNum,
        weekTheme: isDeload ? "Cycle Deload & Recovery" : `Week ${newWeekNum} Routine`,
        startDate: computeDateForDay(baseDate, newWeekNum, "Monday"),
        days: daysRec
      };
    } else {
      const daysRec: Record<DayOfWeek, MatrixDayCell> = {} as any;
      for (const day of DAYS_OF_WEEK) {
        const cellDate = computeDateForDay(baseDate, newWeekNum, day);
        const isSun = day === "Sunday";
        daysRec[day] = {
          day,
          date: cellDate,
          workoutTitle: isSun ? "Full Rest & Recovery" : `${day} Training Session`,
          isRestDay: isSun,
          targetMuscleGroup: isSun ? "Rest" : "Full Body",
          notes: "",
          exercises: []
        };
      }
      newWeekPlan = {
        weekNumber: newWeekNum,
        weekTheme: `Week ${newWeekNum} Routine`,
        startDate: computeDateForDay(baseDate, newWeekNum, "Monday"),
        days: daysRec
      };
    }

    const newPlans = [...matrixPlans, newWeekPlan];
    setTotalWeeksView(newPlans.length);
    handleUpdatePlans(newPlans);
    showToast(`Added Week ${newWeekNum} to the matrix!`);
  };

  // Dynamically add a Deload week at the end of the program
  const handleAddDeloadWeek = () => {
    const newWeekNum = matrixPlans.length + 1;
    const baseDate = cycleStartDate || new Date().toISOString().split("T")[0];
    const prevWeek = matrixPlans[matrixPlans.length - 1];

    const daysRec: Record<DayOfWeek, MatrixDayCell> = {} as any;
    const overloadMult = 0.85;

    for (const day of DAYS_OF_WEEK) {
      const prevCell = prevWeek?.days[day];
      const cellDate = computeDateForDay(baseDate, newWeekNum, day);
      if (prevCell) {
        daysRec[day] = {
          day,
          date: cellDate,
          workoutTitle: prevCell.isRestDay ? prevCell.workoutTitle : `${prevCell.workoutTitle} (Deload)`,
          isRestDay: prevCell.isRestDay,
          targetMuscleGroup: prevCell.targetMuscleGroup,
          notes: "Deload recovery session: 50% volume, 85% load, CNS & joint restoration",
          exercises: prevCell.exercises.map((ex) => {
            const scaledWeight = ex.targetWeight ? Math.round(ex.targetWeight * overloadMult * 10) / 10 : undefined;
            return {
              ...ex,
              targetWeight: scaledWeight,
              targetSets: Math.max(2, (ex.targetSets || 3) - 1),
              sets: ex.sets ? ex.sets.slice(0, Math.max(2, (ex.sets.length || 3) - 1)).map((s) => ({
                ...s,
                weight: s.weight ? Math.round(s.weight * overloadMult * 10) / 10 : scaledWeight
              })) : undefined
            };
          })
        };
      } else {
        daysRec[day] = {
          day,
          date: cellDate,
          workoutTitle: day === "Sunday" ? "Rest & Recovery" : `${day} Active Recovery`,
          isRestDay: day === "Sunday",
          targetMuscleGroup: day === "Sunday" ? "Rest" : "Full Body",
          notes: "Deload recovery session",
          exercises: []
        };
      }
    }

    const newWeekPlan: WeeklyMatrixPlan = {
      weekNumber: newWeekNum,
      weekTheme: `Week ${newWeekNum} Deload (Active Recovery)`,
      startDate: computeDateForDay(baseDate, newWeekNum, "Monday"),
      isDeload: true,
      days: daysRec
    };

    const newPlans = [...matrixPlans, newWeekPlan];
    setTotalWeeksView(newPlans.length);
    handleUpdatePlans(newPlans);
    showToast(`Added Week ${newWeekNum} Deload week at the end of the program!`);
  };

  // Toggle Deload status for any week
  const handleToggleDeloadWeek = (weekNumber: number) => {
    const newPlans = matrixPlans.map((wp) => {
      if (wp.weekNumber !== weekNumber) return wp;
      const currentlyDeload = isDeloadWeek(wp.weekNumber, wp);
      const isNowDeload = !currentlyDeload;
      return {
        ...wp,
        isDeload: isNowDeload,
        weekTheme: isNowDeload
          ? `Week ${weekNumber} Deload (Active Recovery)`
          : `Training Week ${weekNumber}`
      };
    });
    handleUpdatePlans(newPlans);
    const targetW = newPlans.find((w) => w.weekNumber === weekNumber);
    showToast(
      targetW?.isDeload
        ? `Week ${weekNumber} set as Deload week 🧘`
        : `Week ${weekNumber} converted back to Training week 💪`
    );
  };

  // Dynamically delete a specific week from the matrix
  const handleDeleteWeek = (weekNumber: number) => {
    if (matrixPlans.length <= 1) {
      showToast("Cannot delete the only week in the matrix. Maintain at least 1 week.");
      return;
    }

    const filtered = matrixPlans.filter((w) => w.weekNumber !== weekNumber);
    const baseDate = cycleStartDate || new Date().toISOString().split("T")[0];

    // Re-index remaining weeks sequentially 1..N
    const reindexed: WeeklyMatrixPlan[] = filtered.map((wp, idx) => {
      const newWkNum = idx + 1;
      const daysRec: Record<DayOfWeek, MatrixDayCell> = {} as any;

      for (const day of DAYS_OF_WEEK) {
        const cell = wp.days[day];
        const newDate = computeDateForDay(baseDate, newWkNum, day);
        daysRec[day] = cell ? { ...cell, date: newDate } : {
          day,
          date: newDate,
          workoutTitle: "Rest / Unscheduled",
          isRestDay: true,
          targetMuscleGroup: "Rest",
          notes: "",
          exercises: []
        };
      }

      return {
        ...wp,
        weekNumber: newWkNum,
        startDate: computeDateForDay(baseDate, newWkNum, "Monday"),
        days: daysRec
      };
    });

    const newTotal = reindexed.length;
    setTotalWeeksView(newTotal);

    if (selectedCell.weekNumber > newTotal) {
      setSelectedCell({ weekNumber: Math.max(1, newTotal), day: selectedCell.day });
    }
    if (mobileSelectedWeek > newTotal) {
      setMobileSelectedWeek(Math.max(1, newTotal));
    }

    handleUpdatePlans(reindexed);
    showToast(`Deleted Week ${weekNumber}. Matrix recalculated to ${newTotal} weeks.`);
  };

  // Change total weeks to any target duration (1 to 52 weeks)
  const handleSetTotalWeeksCustom = (weeksCount: number) => {
    const validCount = Math.max(1, Math.min(52, weeksCount));
    setTotalWeeksView(validCount);
    try {
      localStorage.setItem("pulse_matrix_total_weeks", String(validCount));
    } catch {}
    setStartWeekIndex((prev) => Math.min(Math.max(0, validCount - 3), prev));

    if (validCount > matrixPlans.length) {
      let currentPlans = [...matrixPlans];
      const baseDate = cycleStartDate || new Date().toISOString().split("T")[0];
      while (currentPlans.length < validCount) {
        const week1 = currentPlans[0];
        const newWkNum = currentPlans.length + 1;
        if (week1) {
          currentPlans = autoFillWeeksFromWeek1(week1, newWkNum, progressionRate);
        } else {
          currentPlans = createBlankMatrixPlan(newWkNum, baseDate);
        }
      }
      handleUpdatePlans(currentPlans);
    } else if (validCount < matrixPlans.length) {
      const truncated = matrixPlans.slice(0, validCount);
      handleUpdatePlans(truncated);
    }
    showToast(`Adjusted matrix duration to ${validCount} weeks.`);
  };

  // Explicit Save Program Matrix Plan handler
  const handleSavePlan = () => {
    try {
      localStorage.setItem("pulse_matrix_total_weeks", String(totalWeeksView));
      localStorage.setItem("pulse_matrix_progression_rate", String(progressionRate));
      localStorage.setItem("pulse_matrix_cycle_start_date", cycleStartDate);
    } catch {}
    handleUpdatePlans(matrixPlans);
    setIsSavedFeedback(true);
    showToast(`Saved ${totalWeeksView}-week program matrix & progression overload plan!`);
    setTimeout(() => setIsSavedFeedback(false), 3000);
  };

  const activeWeekPlan = matrixPlans.find((w) => w.weekNumber === selectedCell.weekNumber) || matrixPlans[0];
  const activeDayCell: MatrixDayCell | undefined = activeWeekPlan?.days?.[selectedCell.day];

  // Helper to update the currently selected cell
  const updateActiveDayCell = (updater: (prev: MatrixDayCell) => MatrixDayCell) => {
    if (!activeDayCell) return;
    const updatedCell = updater(activeDayCell);

    const newPlans = matrixPlans.map((wp) => {
      if (wp.weekNumber === selectedCell.weekNumber) {
        return {
          ...wp,
          days: {
            ...wp.days,
            [selectedCell.day]: updatedCell
          }
        };
      }
      return wp;
    });

    handleUpdatePlans(newPlans);

    const existingCompleted = getCompletedSessionForCell(selectedCell.weekNumber, selectedCell.day);
    if (existingCompleted && onUpdateWorkout) {
      const updatedWorkout: WorkoutSession = {
        ...existingCompleted,
        title: updatedCell.workoutTitle || existingCompleted.title,
        date: updatedCell.date || existingCompleted.date,
        gymId: updatedCell.gymId || existingCompleted.gymId,
        gymName: updatedCell.gymName || existingCompleted.gymName,
        updatedAt: new Date().toISOString()
      };
      onUpdateWorkout(updatedWorkout);
    }
  };

  const activeGymForDay = plannerGyms.find((g) => g.id === activeDayCell?.gymId);
  const plannerAvailableMachines = useMemo(() => {
    if (activeGymForDay && activeGymForDay.machines && activeGymForDay.machines.length > 0) {
      return activeGymForDay.machines;
    }
    return plannerGyms.flatMap((g) => g.machines || []);
  }, [activeGymForDay, plannerGyms]);

  const handleUpdateExerciseMachine = (exIndex: number, machineId?: string, machineName?: string) => {
    updateActiveDayCell((prev) => {
      const updated = (prev.exercises || []).map((item, idx) => {
        if (idx !== exIndex) return item;
        return {
          ...item,
          machineId: machineId || undefined,
          machineName: machineName || undefined
        };
      });
      return { ...prev, exercises: updated };
    });
  };

  const handleCreatePlannerGym = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPlannerGymName.trim()) return;
    const newGym: Gym = {
      id: `gym-${Date.now()}`,
      name: newPlannerGymName.trim(),
      location: newPlannerGymLocation.trim() || undefined,
      isDefault: plannerGyms.length === 0,
      machines: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    const updated = addOrUpdateGym(currentUserId, newGym);
    setPlannerGyms(updated);
    updateActiveDayCell((prev) => ({
      ...prev,
      gymId: newGym.id,
      gymName: newGym.name
    }));
    try {
      const dayKey = `w${selectedCell.weekNumber}-${selectedCell.day}`;
      const draft = getWorkoutDraft(currentUserId, dayKey);
      if (draft) {
        saveWorkoutDraft(currentUserId, {
          ...draft,
          gymId: newGym.id,
          gymName: newGym.name
        });
      }
    } catch {}
    setNewPlannerGymName("");
    setNewPlannerGymLocation("");
    setIsPlannerGymModalOpen(false);
    showToast(`Added gym "${newGym.name}" & assigned to session`);
  };

  const handleCreatePlannerMachine = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPlannerMachineName.trim()) return;
    const targetGymId = activeDayCell?.gymId || (plannerGyms[0]?.id || "default");
    const newMach: GymMachine = {
      id: `mach-${Date.now()}`,
      gymId: targetGymId,
      category: (activeDayCell?.targetMuscleGroup as MuscleGroup) || "Chest",
      name: newPlannerMachineName.trim(),
      brand: newPlannerMachineBrand.trim() || undefined,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    const updatedGyms = addOrUpdateMachine(currentUserId, targetGymId, newMach);
    setPlannerGyms(updatedGyms);
    if (addingMachineForPlannerExIdx !== null) {
      handleUpdateExerciseMachine(addingMachineForPlannerExIdx, newMach.id, newMach.name);
    }
    setNewPlannerMachineName("");
    setNewPlannerMachineBrand("");
    setIsPlannerMachineModalOpen(false);
    setAddingMachineForPlannerExIdx(null);
    showToast(`Added machine "${newMach.name}" & assigned to exercise`);
  };

  // Propagate this day's routine to all future weeks
  const handlePropagateDayToAllWeeks = () => {
    if (!activeDayCell) return;

    const newPlans = matrixPlans.map((wp) => {
      if (wp.weekNumber === selectedCell.weekNumber) {
        return wp;
      }
      // Only propagate forward from current week
      if (wp.weekNumber < selectedCell.weekNumber) {
        return wp;
      }

      const weekDiff = wp.weekNumber - selectedCell.weekNumber;
      const isDeload = isDeloadWeek(wp.weekNumber);
      const overloadMult = isDeload ? 0.85 : 1 + weekDiff * (progressionRate / 100);

      const propagatedCell: MatrixDayCell = {
        day: selectedCell.day,
        workoutTitle: activeDayCell.workoutTitle,
        isRestDay: activeDayCell.isRestDay,
        targetMuscleGroup: activeDayCell.targetMuscleGroup,
        notes: isDeload
          ? "Cycle Deload Week (50% Volume, 85% Load for CNS Recovery)"
          : activeDayCell.notes || `Progression cycle (+${((overloadMult - 1) * 100).toFixed(1)}%)`,
        exercises: activeDayCell.exercises.map((ex) => {
          const scaledWeight = ex.targetWeight ? Math.round(ex.targetWeight * overloadMult * 10) / 10 : undefined;
          const scaledSetsCount = isDeload ? Math.max(2, ex.targetSets - 1) : ex.targetSets;
          return {
            ...ex,
            targetWeight: scaledWeight,
            targetSets: scaledSetsCount,
            sets: ex.sets
              ? ex.sets.slice(0, scaledSetsCount).map((s) => ({
                  ...s,
                  weight: s.weight ? Math.round(s.weight * overloadMult * 10) / 10 : scaledWeight
                }))
              : undefined
          };
        })
      };

      return {
        ...wp,
        days: {
          ...wp.days,
          [selectedCell.day]: propagatedCell
        }
      };
    });

    handleUpdatePlans(newPlans);
    showToast(`Propagated ${selectedCell.day} workout to all subsequent weeks with +${progressionRate}% progressive overload!`);
  };

  // Launch the selected cell as an active workout plan
  const handleLaunchWorkout = () => {
    if (!activeDayCell || activeDayCell.isRestDay || activeDayCell.exercises.length === 0) return;

    if (onStartSession) {
      onStartSession(activeDayCell);
    } else if (onStartWorkout) {
      const plan: WorkoutPlan = {
        id: `matrix-${selectedCell.weekNumber}-${selectedCell.day}-${Date.now()}`,
        name: `Week ${selectedCell.weekNumber} - ${selectedCell.day} (${activeDayCell.workoutTitle})`,
        targetMuscleGroup: activeDayCell.targetMuscleGroup,
        notes: activeDayCell.notes,
        gymId: activeDayCell.gymId,
        gymName: activeDayCell.gymName,
        exercises: activeDayCell.exercises
      };
      onStartWorkout(plan);
    }
  };

  // --- Handlers for editing exercises ---
  const handleUpdateExerciseSets = (index: number, newSets: number) => {
    const clamped = Math.max(1, Math.min(15, newSets));
    updateActiveDayCell((prev) => {
      const newExercises = [...prev.exercises];
      const targetEx = { ...newExercises[index], targetSets: clamped };
      const currentSets = targetEx.sets || [];
      if (currentSets.length < clamped) {
        const added = Array.from({ length: clamped - currentSets.length }, (_, i) => ({
          setNumber: currentSets.length + i + 1,
          weight: targetEx.targetWeight,
          reps: targetEx.targetReps
        }));
        targetEx.sets = [...currentSets, ...added];
      } else if (currentSets.length > clamped) {
        targetEx.sets = currentSets.slice(0, clamped);
      }
      newExercises[index] = targetEx;
      return { ...prev, exercises: newExercises };
    });
  };

  const handleUpdateExerciseReps = (index: number, newReps: string) => {
    updateActiveDayCell((prev) => {
      const newExercises = [...prev.exercises];
      const targetEx = { ...newExercises[index], targetReps: newReps };
      if (targetEx.sets && targetEx.sets.length > 0) {
        targetEx.sets = targetEx.sets.map((s) => ({
          ...s,
          reps: newReps
        }));
      }
      newExercises[index] = targetEx;
      return { ...prev, exercises: newExercises };
    });
  };

  const handleUpdateExerciseWeight = (index: number, newWeight: number | undefined) => {
    updateActiveDayCell((prev) => {
      const newExercises = [...prev.exercises];
      const targetEx = { ...newExercises[index], targetWeight: newWeight };
      if (targetEx.sets && targetEx.sets.length > 0) {
        targetEx.sets = targetEx.sets.map((s) => ({
          ...s,
          weight: newWeight
        }));
      }
      newExercises[index] = targetEx;
      return { ...prev, exercises: newExercises };
    });
  };

  const handleUpdateExerciseName = (index: number, newName: string) => {
    const catalogMatch = EXERCISE_CATALOG.find((c) => c.name.toLowerCase() === newName.toLowerCase());
    updateActiveDayCell((prev) => {
      const newExercises = [...prev.exercises];
      newExercises[index] = {
        ...newExercises[index],
        exerciseName: newName,
        muscleGroup: catalogMatch ? catalogMatch.muscleGroup : newExercises[index].muscleGroup
      };
      return { ...prev, exercises: newExercises };
    });
  };

  const handleUpdateExerciseMuscle = (index: number, newMuscle: MuscleGroup) => {
    updateActiveDayCell((prev) => {
      const newExercises = [...prev.exercises];
      newExercises[index] = { ...newExercises[index], muscleGroup: newMuscle };
      return { ...prev, exercises: newExercises };
    });
  };

  const handleUpdateExerciseNotes = (index: number, newNotes: string) => {
    updateActiveDayCell((prev) => {
      const newExercises = [...prev.exercises];
      newExercises[index] = { ...newExercises[index], warmupNotes: newNotes };
      return { ...prev, exercises: newExercises };
    });
  };

  const handleDeleteExercise = (index: number) => {
    updateActiveDayCell((prev) => ({
      ...prev,
      exercises: prev.exercises.filter((_, i) => i !== index)
    }));
    showToast("Exercise removed from routine.");
  };

  const handleMoveExercise = (index: number, direction: "up" | "down") => {
    if (!activeDayCell) return;
    const target = direction === "up" ? index - 1 : index + 1;
    if (target < 0 || target >= activeDayCell.exercises.length) return;

    updateActiveDayCell((prev) => {
      const list = [...prev.exercises];
      const temp = list[index];
      list[index] = list[target];
      list[target] = temp;
      return { ...prev, exercises: list };
    });
  };

  const handleToggleRestDay = () => {
    if (!activeDayCell) return;
    updateActiveDayCell((prev) => ({
      ...prev,
      isRestDay: !prev.isRestDay,
      workoutTitle: !prev.isRestDay
        ? "Rest & Active Recovery"
        : prev.workoutTitle === "Rest & Active Recovery"
        ? `${selectedCell.day} Training`
        : prev.workoutTitle
    }));
    showToast(activeDayCell.isRestDay ? "Converted to training day." : "Marked as rest day.");
  };

  // Set-by-set column management handlers
  const handleUpdateExerciseSet = (
    exerciseIndex: number,
    setIndex: number,
    field: "weight" | "reps",
    value: any
  ) => {
    updateActiveDayCell((prev) => {
      const exercises = [...prev.exercises];
      const targetEx = { ...exercises[exerciseIndex] };
      const currentSets: PlannedSet[] =
        targetEx.sets && targetEx.sets.length > 0
          ? [...targetEx.sets]
          : Array.from({ length: targetEx.targetSets || 3 }, (_, i) => ({
              setNumber: i + 1,
              weight: targetEx.targetWeight,
              reps: targetEx.targetReps
            }));

      while (currentSets.length <= setIndex) {
        currentSets.push({
          setNumber: currentSets.length + 1,
          weight: targetEx.targetWeight,
          reps: targetEx.targetReps
        });
      }

      currentSets[setIndex] = {
        ...currentSets[setIndex],
        [field]: value === "" ? undefined : value
      };

      targetEx.sets = currentSets;
      targetEx.targetSets = currentSets.length;
      exercises[exerciseIndex] = targetEx;
      return { ...prev, exercises };
    });
  };

  // Adding sets adds a column to the right for a specific exercise!
  const handleAddSetColumn = (exerciseIndex?: number) => {
    if (exerciseIndex === undefined) {
      showToast("Please click '+ Set' on the specific exercise you wish to add a set to.");
      return;
    }
    updateActiveDayCell((prev) => {
      const exercises = [...prev.exercises];
      if (exerciseIndex < 0 || exerciseIndex >= exercises.length) return prev;
      const targetEx = { ...exercises[exerciseIndex] };
      const currentSets: PlannedSet[] =
        targetEx.sets && targetEx.sets.length > 0
          ? [...targetEx.sets]
          : Array.from({ length: targetEx.targetSets || 3 }, (_, i) => ({
              setNumber: i + 1,
              weight: targetEx.targetWeight,
              reps: targetEx.targetReps
            }));
      const lastSet = currentSets[currentSets.length - 1];
      currentSets.push({
        setNumber: currentSets.length + 1,
        weight: undefined, // blank for planning as user requested
        reps: lastSet?.reps ?? targetEx.targetReps
      });
      targetEx.sets = currentSets;
      targetEx.targetSets = currentSets.length;
      exercises[exerciseIndex] = targetEx;
      return { ...prev, exercises };
    });
    const exName = activeDayCell?.exercises?.[exerciseIndex]?.exerciseName || "exercise";
    showToast(`Added set to ${exName} only.`);
  };

  // Remove set column
  const handleRemoveSetColumn = (exerciseIndex: number, setIndex: number) => {
    updateActiveDayCell((prev) => {
      const exercises = [...prev.exercises];
      const targetEx = { ...exercises[exerciseIndex] };
      const currentSets = targetEx.sets || [];
      if (currentSets.length <= 1) return prev;
      const updatedSets = currentSets.filter((_, i) => i !== setIndex).map((s, i) => ({
        ...s,
        setNumber: i + 1
      }));
      targetEx.sets = updatedSets;
      targetEx.targetSets = updatedSets.length;
      exercises[exerciseIndex] = targetEx;
      return { ...prev, exercises };
    });
  };

  // Smart Progression Handler (Calculates from last session based on 8-12 rule)
  const handleCalculateSmartProgression = (exerciseIndex?: number) => {
    if (!workouts || workouts.length === 0) {
      showToast("No historical workout sessions found to calculate progression from.");
      return;
    }

    updateActiveDayCell((prev) => {
      const exercises = [...prev.exercises];

      if (exerciseIndex !== undefined) {
        const ex = exercises[exerciseIndex];
        const prog = calculateSmartProgression(
          ex.exerciseName,
          ex.targetReps,
          ex.targetSets || 3,
          workouts,
          unit
        );
        exercises[exerciseIndex] = {
          ...ex,
          targetWeight: prog.suggestedWeight,
          sets: prog.suggestedSets,
          progressionNote: prog.rationale
        };
        showToast(prog.rationale);
      } else {
        let count = 0;
        exercises.forEach((ex, idx) => {
          const prog = calculateSmartProgression(
            ex.exerciseName,
            ex.targetReps,
            ex.targetSets || 3,
            workouts,
            unit
          );
          exercises[idx] = {
            ...ex,
            targetWeight: prog.suggestedWeight,
            sets: prog.suggestedSets,
            progressionNote: prog.rationale
          };
          count++;
        });
        showToast(`⚡ Calculated smart progression for ${count} exercises based on last session.`);
      }

      return { ...prev, exercises };
    });
  };

  // Clear weights and reps to blank for planning
  const handleClearSetsToBlank = (exerciseIndex?: number) => {
    updateActiveDayCell((prev) => {
      const exercises = [...prev.exercises];
      if (exerciseIndex !== undefined) {
        const ex = exercises[exerciseIndex];
        const count = ex.targetSets || ex.sets?.length || 3;
        exercises[exerciseIndex] = {
          ...ex,
          targetWeight: undefined,
          sets: Array.from({ length: count }, (_, i) => ({
            setNumber: i + 1,
            weight: undefined,
            reps: undefined
          })),
          progressionNote: "Blank for planning / live entry"
        };
      } else {
        exercises.forEach((ex, idx) => {
          const count = ex.targetSets || ex.sets?.length || 3;
          exercises[idx] = {
            ...ex,
            targetWeight: undefined,
            sets: Array.from({ length: count }, (_, i) => ({
              setNumber: i + 1,
              weight: undefined,
              reps: undefined
            })),
            progressionNote: "Blank for planning / live entry"
          };
        });
      }
      return { ...prev, exercises };
    });
    showToast("Cleared weights and reps to blank for planning.");
  };

  // Clear all exercises from planner (remove unwanted template default exercises)
  const handleClearAllPlannerExercises = () => {
    if (!window.confirm("Are you sure you want to clear all exercises from all days and weeks in your planner? This will remove all default template exercises and give you a clean slate.")) {
      return;
    }
    const cleanedPlans = matrixPlans.map((w) => {
      const cleanDays = { ...w.days };
      for (const day of DAYS_OF_WEEK) {
        if (cleanDays[day]) {
          cleanDays[day] = {
            ...cleanDays[day],
            exercises: [],
            workoutTitle: `${day} Session`
          };
        }
      }
      return {
        ...w,
        days: cleanDays
      };
    });
    handleUpdatePlans(cleanedPlans);
    showToast("✓ Cleared all exercises from planner. You now have a clean slate.");
  };

  // Excel Export: Matrix Plan
  const handleExportMatrixExcel = () => {
    try {
      const blob = exportMatrixPlanToExcelBlob(matrixPlans, currentProgram?.name || "Training_Matrix");
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${(currentProgram?.name || "Matrix_Plan").replace(/\s+/g, "_")}_Schedule.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast("Excel spreadsheet exported successfully!");
    } catch (err: any) {
      showToast(`Export failed: ${err?.message || "Unknown error"}`);
    }
  };

  // Excel Export: Workout Session Logs
  const handleExportLogsExcel = () => {
    try {
      const blob = exportWorkoutLogsToExcelBlob(workouts);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Workout_Logs_History_${new Date().toISOString().split("T")[0]}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast("Workout logs Excel export generated!");
    } catch (err: any) {
      showToast(`Export failed: ${err?.message || "Unknown error"}`);
    }
  };

  // Excel Import: Parse file and update matrix plans
  const handleImportExcelFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setExcelImportError(null);
      const buffer = await file.arrayBuffer();
      const parseResult = smartParseMatrixSpreadsheet(buffer);
      if (!parseResult.matrixPlans || parseResult.matrixPlans.length === 0) {
        setExcelImportError("No readable workout plans found in the uploaded spreadsheet. Please check format.");
        return;
      }

      handleUpdatePlans(parseResult.matrixPlans);
      if (parseResult.programName && onUpdateProgramName && currentProgram) {
        onUpdateProgramName(currentProgram.id, parseResult.programName);
      }
      setIsExcelModalOpen(false);
      showToast(`Successfully imported ${parseResult.matrixPlans.length} weeks (${parseResult.totalExercises} exercises) from ${file.name}!`);
    } catch (err: any) {
      setExcelImportError(`Import error: ${err?.message || "Could not parse spreadsheet file"}`);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleAddExerciseSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newExName.trim()) return;

    // Save to catalog so it is stored and can be reused later
    saveCustomExerciseToCatalog({
      name: newExName.trim(),
      muscleGroup: newExMuscle,
      defaultIncrement: unit === "lbs" ? 5 : 2.5,
      isCustom: true
    });
    setCatalogExercises(getFullExerciseCatalog());

    const numSets = Number(newExSets) || 3;
    const initialSets: PlannedSet[] = Array.from({ length: numSets }, (_, i) => ({
      setNumber: i + 1,
      weight: newExWeight === "" ? undefined : Number(newExWeight),
      reps: newExReps.trim() || "8-12"
    }));

    const exerciseToAdd: PlannedExercise = {
      exerciseName: newExName.trim(),
      muscleGroup: newExMuscle,
      targetSets: numSets,
      targetReps: newExReps.trim() || "8-12",
      targetWeight: newExWeight === "" ? undefined : Number(newExWeight),
      warmupNotes: newExNotes.trim() || undefined,
      sets: initialSets
    };

    updateActiveDayCell((prev) => ({
      ...prev,
      isRestDay: false,
      exercises: [...prev.exercises, exerciseToAdd]
    }));

    setIsAddingExercise(false);
    setNewExNotes("");
    showToast(`Added "${exerciseToAdd.exerciseName}" to ${selectedCell.day}'s routine!`);
  };

  const handleAddExercise = () => {
    handleAddExerciseSubmit({ preventDefault: () => {} } as React.FormEvent);
  };

  // Quick rep preset options
  const REP_PRESETS = ["5", "6-8", "8-12", "10-12", "12-15", "15-20", "AMRAP"];

  const totalExercises = activeDayCell?.exercises?.length || 0;
  const totalSets = activeDayCell?.exercises?.reduce((sum, e) => sum + (e.targetSets || 0), 0) || 0;

  const renderEditorContent = (isModal: boolean) => {
    if (!activeDayCell) return null;
    return (
      <div className="space-y-5">
        {/* Day Inspector Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-black/[0.06] pb-4">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-extrabold uppercase tracking-wider text-[#AD314D] bg-rose-50 px-2.5 py-0.5 rounded-full border border-rose-100">
                Week {selectedCell.weekNumber} • {selectedCell.day}
              </span>
              <span className="text-xs text-[#777777]">|</span>
              <span className="text-xs font-semibold text-[#4A4A4A]">
                {activeDayCell.targetMuscleGroup || "General Training"}
              </span>
              <span className="text-xs text-[#777777]">|</span>
              <span className="text-xs text-[#777777]">
                {totalExercises} exercises • {totalSets} programmed sets
              </span>
              {!isModal && (
                <button
                  type="button"
                  onClick={() => setIsCellModalOpen(true)}
                  className="flex items-center gap-1.5 ml-2 px-2.5 py-1 rounded-xl bg-neutral-100 hover:bg-neutral-200 text-xs font-semibold text-[#222222] transition-colors"
                  title="Open in focused popup modal"
                >
                  <Maximize2 className="w-3.5 h-3.5 text-[#AD314D]" />
                  <span>Pop-up Modal</span>
                </button>
              )}
            </div>

            {!isEditingDayDetails ? (
              <div className="mt-1.5 flex items-center gap-3 flex-wrap">
                <h3 className="text-lg sm:text-xl font-bold text-[#222222]">
                  {activeDayCell.workoutTitle}
                </h3>
                {/* Date Picker Badge in Header */}
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-white border border-black/[0.08] shadow-2xs">
                  <Calendar className="w-3.5 h-3.5 text-[#AD314D]" />
                  <span className="text-xs font-bold text-neutral-600">Date:</span>
                  <input
                    type="date"
                    value={activeDayCell.date || getCellDate(selectedCell.weekNumber, selectedCell.day, activeDayCell)}
                    onChange={(e) => updateActiveDayCell((prev) => ({ ...prev, date: e.target.value }))}
                    className="text-xs font-black text-[#222222] bg-transparent outline-none cursor-pointer"
                    title="Change calendar date for this workout session"
                  />
                  <span className="text-[11px] font-semibold text-[#777777]">
                    ({formatFriendlyDate(activeDayCell.date || getCellDate(selectedCell.weekNumber, selectedCell.day, activeDayCell))})
                  </span>
                </div>

                {/* Gym Selector Badge in Header */}
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-white border border-black/[0.08] shadow-2xs">
                  <Building2 className="w-3.5 h-3.5 text-indigo-600" />
                  <span className="text-xs font-bold text-neutral-600">Gym:</span>
                  <select
                    value={activeDayCell.gymId || ""}
                    onChange={(e) => {
                      const gId = e.target.value;
                      const found = plannerGyms.find((g) => g.id === gId);
                      updateActiveDayCell((prev) => ({
                        ...prev,
                        gymId: gId || undefined,
                        gymName: found?.name || undefined
                      }));
                      const existingCompleted = getCompletedSessionForCell(selectedCell.weekNumber, selectedCell.day);
                      if (existingCompleted && onUpdateWorkout) {
                        onUpdateWorkout({
                          ...existingCompleted,
                          gymId: gId || undefined,
                          gymName: found?.name || undefined,
                          updatedAt: new Date().toISOString()
                        });
                      }
                      try {
                        const dayKey = `w${selectedCell.weekNumber}-${selectedCell.day}`;
                        const draft = getWorkoutDraft(currentUserId, dayKey);
                        if (draft) {
                          saveWorkoutDraft(currentUserId, {
                            ...draft,
                            gymId: gId || undefined,
                            gymName: found?.name || undefined
                          });
                        }
                      } catch {}
                    }}
                    className="text-xs font-bold text-indigo-700 bg-transparent outline-none cursor-pointer max-w-[130px] truncate"
                    title="Training gym for this session (synced with Dashboard and Today's Session)"
                  >
                    <option value="">No Gym</option>
                    {plannerGyms.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => setIsPlannerGymModalOpen(true)}
                    className="text-[10px] font-extrabold text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 px-1.5 py-0.5 rounded transition-colors"
                    title="Add new gym"
                  >
                    + Add
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setIsEditingDayDetails(true)}
                  className="flex items-center gap-1 text-xs text-[#AD314D] hover:underline font-semibold"
                >
                  <Edit2 className="w-3 h-3" />
                  <span>Edit Info</span>
                </button>
              </div>
            ) : (
              <div className="mt-2 space-y-2 p-3 rounded-2xl bg-[#F8F8F7] border border-black/[0.06]">
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                  <div>
                    <label className="text-[10px] font-bold uppercase text-[#777777]">Workout Title</label>
                    <input
                      type="text"
                      value={activeDayCell.workoutTitle}
                      onChange={(e) =>
                        updateActiveDayCell((prev) => ({ ...prev, workoutTitle: e.target.value }))
                      }
                      className="w-full text-xs font-bold p-1.5 rounded-xl border border-black/[0.1] bg-white outline-none focus:ring-1 focus:ring-[#AD314D]"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold uppercase text-[#777777]">Workout Date</label>
                    <input
                      type="date"
                      value={activeDayCell.date || getCellDate(selectedCell.weekNumber, selectedCell.day, activeDayCell)}
                      onChange={(e) =>
                        updateActiveDayCell((prev) => ({ ...prev, date: e.target.value }))
                      }
                      className="w-full text-xs font-bold p-1.5 rounded-xl border border-black/[0.1] bg-white outline-none focus:ring-1 focus:ring-[#AD314D]"
                    />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-0.5">
                      <label className="text-[10px] font-bold uppercase text-[#777777]">Training Gym</label>
                      <button
                        type="button"
                        onClick={() => setIsPlannerGymModalOpen(true)}
                        className="text-[9px] font-bold text-indigo-600 hover:underline"
                      >
                        + Add Gym
                      </button>
                    </div>
                    <select
                      value={activeDayCell.gymId || ""}
                      onChange={(e) => {
                        const gId = e.target.value;
                        const found = plannerGyms.find((g) => g.id === gId);
                        updateActiveDayCell((prev) => ({
                          ...prev,
                          gymId: gId || undefined,
                          gymName: found?.name || undefined
                        }));
                        const existingCompleted = getCompletedSessionForCell(selectedCell.weekNumber, selectedCell.day);
                        if (existingCompleted && onUpdateWorkout) {
                          onUpdateWorkout({
                            ...existingCompleted,
                            gymId: gId || undefined,
                            gymName: found?.name || undefined,
                            updatedAt: new Date().toISOString()
                          });
                        }
                        try {
                          const dayKey = `w${selectedCell.weekNumber}-${selectedCell.day}`;
                          const draft = getWorkoutDraft(currentUserId, dayKey);
                          if (draft) {
                            saveWorkoutDraft(currentUserId, {
                              ...draft,
                              gymId: gId || undefined,
                              gymName: found?.name || undefined
                            });
                          }
                        } catch {}
                      }}
                      className="w-full text-xs font-bold p-1.5 rounded-xl border border-black/[0.1] bg-white text-indigo-700 outline-none focus:ring-1 focus:ring-indigo-500"
                    >
                      <option value="">(No Gym Selected)</option>
                      {plannerGyms.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold uppercase text-[#777777]">Target Muscle Focus</label>
                    <input
                      type="text"
                      value={activeDayCell.targetMuscleGroup || ""}
                      onChange={(e) =>
                        updateActiveDayCell((prev) => ({ ...prev, targetMuscleGroup: e.target.value }))
                      }
                      placeholder="e.g. Chest & Triceps"
                      className="w-full text-xs p-1.5 rounded-xl border border-black/[0.1] bg-white outline-none focus:ring-1 focus:ring-[#AD314D]"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase text-[#777777]">Session Notes / Strategy</label>
                  <input
                    type="text"
                    value={activeDayCell.notes || ""}
                    onChange={(e) =>
                      updateActiveDayCell((prev) => ({ ...prev, notes: e.target.value }))
                    }
                    placeholder="e.g. 2-3 min rest on heavy compounds"
                    className="w-full text-xs p-1.5 rounded-xl border border-black/[0.1] bg-white outline-none focus:ring-1 focus:ring-[#AD314D]"
                  />
                </div>
                <div className="flex justify-end pt-1">
                  <button
                    type="button"
                    onClick={() => setIsEditingDayDetails(false)}
                    className="px-3 py-1 bg-[#222222] text-white text-xs font-semibold rounded-xl"
                  >
                    Done Editing Info
                  </button>
                </div>
              </div>
            )}

            {activeDayCell.notes && !isEditingDayDetails && (
              <p className="text-xs text-[#4A4A4A] mt-1 italic">
                "{activeDayCell.notes}"
              </p>
            )}
          </div>

          {/* Top Action Buttons for Selected Day */}
          <div className="flex items-center gap-2 flex-wrap self-start md:self-auto">
            <button
              type="button"
              onClick={handleToggleRestDay}
              className={`px-3 py-2 rounded-2xl text-xs font-semibold border transition-all ${
                activeDayCell.isRestDay
                  ? "bg-rose-50 border-rose-200 text-[#AD314D]"
                  : "bg-[#F0F0EE] border-black/[0.06] text-[#4A4A4A] hover:text-[#222222]"
              }`}
            >
              {activeDayCell.isRestDay ? "✓ Rest Day (Click to Make Workout)" : "Mark as Rest Day"}
            </button>

            {/* Propagate to all weeks button */}
            <button
              type="button"
              onClick={handlePropagateDayToAllWeeks}
              title="Copies this day's routine to all future weeks with progressive overload"
              className="flex items-center gap-1.5 px-3 py-2 rounded-2xl bg-[#EFEFED] hover:bg-[#E4E4E1] text-[#222222] text-xs font-semibold border border-black/[0.06] shadow-2xs transition-all"
            >
              <Copy className="w-3.5 h-3.5 text-[#AD314D]" />
              <span>Propagate to Future Weeks</span>
            </button>

            {/* Mark Completed & Logged Toggle Button */}
            {!activeDayCell.isRestDay && (
              <button
                type="button"
                onClick={() => {
                  const currentlyDone = isCellCompleted(selectedCell.weekNumber, selectedCell.day);
                  if (onSaveDayCompleted) {
                    onSaveDayCompleted(selectedCell.weekNumber, selectedCell.day, !currentlyDone);
                  }
                  showToast(!currentlyDone ? "Marked session as completed & logged in diary & cloud!" : "Session marked incomplete.");
                }}
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-2xl text-xs font-bold transition-all shadow-2xs cursor-pointer active:scale-95 ${
                  isCellCompleted(selectedCell.weekNumber, selectedCell.day)
                    ? "bg-emerald-100 hover:bg-emerald-200 text-emerald-900 border border-emerald-300"
                    : "bg-[#222222] hover:bg-black text-white"
                }`}
              >
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                <span>
                  {isCellCompleted(selectedCell.weekNumber, selectedCell.day)
                    ? "✓ Session Logged (Click to Undo)"
                    : "Mark Completed & Logged"}
                </span>
              </button>
            )}

            {onNavigateToDiary && !activeDayCell.isRestDay && (
              <button
                type="button"
                onClick={() =>
                  onNavigateToDiary({
                    week: selectedCell.weekNumber,
                    day: selectedCell.day,
                    date: activeDayCell.date || computeDateForDay(cycleStartDate, selectedCell.weekNumber, selectedCell.day)
                  })
                }
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-2xl bg-indigo-50 hover:bg-indigo-100 text-indigo-900 border border-indigo-200 text-xs font-bold transition-all shadow-2xs cursor-pointer"
              >
                <BookOpen className="w-3.5 h-3.5 text-indigo-600" />
                <span>Open in Today&apos;s Diary</span>
              </button>
            )}

            {!activeDayCell.isRestDay && activeDayCell.exercises.length > 0 && (
              <button
                type="button"
                onClick={handleLaunchWorkout}
                className="flex items-center gap-1.5 px-4 py-2 rounded-2xl bg-[#AD314D] hover:bg-[#92263F] text-white text-xs font-bold shadow-sm transition-all"
              >
                <Play className="w-3.5 h-3.5 fill-white" />
                <span>Start Workout Now</span>
              </button>
            )}
          </div>
        </div>

        {/* Completed Facts Recorded Banner if Workout has been logged */}
        {(() => {
          const completedWorkout = getCompletedSessionForCell(selectedCell.weekNumber, selectedCell.day);
          if (!completedWorkout) return null;

          return (
            <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-300 shadow-xs space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-emerald-200/80 pb-2.5">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-xl bg-emerald-500 text-white flex items-center justify-center font-bold shrink-0">
                    <CheckCircle2 className="w-4 h-4" />
                  </div>
                  <div>
                    <h5 className="text-xs sm:text-sm font-black text-emerald-950">
                      Completed Workout Facts Logged ({completedWorkout.date})
                    </h5>
                    <p className="text-[11px] text-emerald-700">
                      Editable actual sets, loads, and repetitions logged for this session.
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap self-start sm:self-auto">
                  {onNavigateToDiary && (
                    <button
                      type="button"
                      onClick={() => {
                        setIsCellModalOpen(false);
                        onNavigateToDiary({
                          week: selectedCell.weekNumber,
                          day: selectedCell.day,
                          date: completedWorkout.date
                        });
                      }}
                      className="px-3 py-1.5 rounded-xl bg-[#AD314D] hover:bg-[#8C1E37] text-white text-xs font-extrabold shadow-2xs transition-colors flex items-center gap-1 cursor-pointer"
                    >
                      <BookOpen className="w-3.5 h-3.5 text-white" />
                      <span>Edit in Diary</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      if (!completedWorkout.exercises) return;
                      // Copy completed facts into planned exercises so target loads match reality
                      const updatedExercises = activeDayCell.exercises.map((pEx) => {
                        const match = completedWorkout.exercises.find((cEx) => isSameExercise(cEx.exerciseName, pEx.exerciseName));
                        if (match && match.sets && match.sets.length > 0) {
                          return {
                            ...pEx,
                            targetWeight: match.sets[0]?.weight ?? pEx.targetWeight,
                            targetReps: `${match.sets[0]?.reps ?? pEx.targetReps}`,
                            targetSets: match.sets.length,
                            sets: match.sets.map((s) => ({
                              setNumber: s.setNumber,
                              weight: s.weight,
                              reps: `${s.reps}`
                            }))
                          };
                        }
                        return pEx;
                      });
                      updateActiveDayCell((prev) => ({
                        ...prev,
                        exercises: updatedExercises
                      }));
                      showToast("Synced completed actual weights & reps into plan!");
                    }}
                    className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-2xs transition-colors"
                    title="Overwrites target weights and reps with your actual logged weights & reps"
                  >
                    Sync Actuals into Plan
                  </button>
                </div>
              </div>

              {/* Grid of completed facts with editable inputs */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
                {completedWorkout.exercises?.map((cEx, cIdx) => (
                  <div key={cIdx} className="p-3 rounded-xl bg-white border border-emerald-200/80 shadow-2xs space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black text-[#111111] truncate">{cEx.exerciseName}</span>
                      <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100 px-1.5 py-0.5 rounded">
                        {cEx.sets?.length || 0} sets
                      </span>
                    </div>
                    <div className="space-y-1.5">
                      {cEx.sets?.map((s, si) => (
                        <div
                          key={si}
                          className="text-[11px] font-bold bg-emerald-50/70 border border-emerald-200/80 text-emerald-950 p-1.5 rounded-lg flex items-center justify-between gap-1.5"
                        >
                          <span className="text-emerald-700 text-[10px] font-black shrink-0">
                            Set #{s.setNumber}:
                          </span>
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              step={0.5}
                              min={0}
                              value={s.weight}
                              onChange={(e) => {
                                const newW = parseFloat(e.target.value) || 0;
                                if (!onUpdateWorkout) return;
                                const updatedExercises = (completedWorkout.exercises || []).map((ex, i) => {
                                  if (i !== cIdx) return ex;
                                  const sets = [...(ex.sets || [])];
                                  if (sets[si]) sets[si] = { ...sets[si], weight: newW };
                                  return { ...ex, sets };
                                });
                                onUpdateWorkout({
                                  ...completedWorkout,
                                  exercises: updatedExercises,
                                  updatedAt: new Date().toISOString()
                                });
                              }}
                              className="w-16 px-1.5 py-0.5 rounded border border-emerald-300 bg-white font-black text-xs text-emerald-950 outline-none text-center"
                            />
                            <span className="text-[10px] text-emerald-800 font-semibold">{unit}</span>
                            <span className="text-emerald-400 font-black">×</span>
                            <input
                              type="number"
                              min={0}
                              value={s.reps}
                              onChange={(e) => {
                                const newR = parseInt(e.target.value, 10) || 0;
                                if (!onUpdateWorkout) return;
                                const updatedExercises = (completedWorkout.exercises || []).map((ex, i) => {
                                  if (i !== cIdx) return ex;
                                  const sets = [...(ex.sets || [])];
                                  if (sets[si]) sets[si] = { ...sets[si], reps: newR };
                                  return { ...ex, sets };
                                });
                                onUpdateWorkout({
                                  ...completedWorkout,
                                  exercises: updatedExercises,
                                  updatedAt: new Date().toISOString()
                                });
                              }}
                              className="w-14 px-1.5 py-0.5 rounded border border-emerald-300 bg-white font-black text-xs text-emerald-950 outline-none text-center"
                            />
                            <span className="text-[10px] text-emerald-800 font-semibold">reps</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}

        {/* EXERCISE LIST / EDITOR */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-bold text-[#222222]">
                Planned Exercises ({activeDayCell.exercises.length})
              </h4>
              <span className="text-xs text-[#777777]">
                • Adjust sets, reps, target load, or reorder
              </span>
            </div>

            {!activeDayCell.isRestDay && (
              <button
                type="button"
                onClick={() => setIsAddingExercise(!isAddingExercise)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-black/[0.05] hover:bg-black/[0.1] text-xs font-semibold text-[#222222] transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{isAddingExercise ? "Cancel Adding" : "+ Add Exercise"}</span>
              </button>
            )}
          </div>

          {/* Add Exercise Panel */}
          {isAddingExercise && (
            <div className="p-4 rounded-2xl bg-[#F8F8F7] border border-black/[0.08] space-y-3 animate-in fade-in">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[#222222]">Add New Exercise</span>
                <button
                  type="button"
                  onClick={() => setIsAddingExercise(false)}
                  className="text-xs text-[#777777] hover:text-[#222222]"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Quick Select from Catalog or Custom */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold uppercase text-[#777777] block mb-1">
                    Select From Catalog ({catalogExercises.length} Movements)
                  </label>
                  <select
                    value={newExName}
                    onChange={(e) => {
                      const selected = catalogExercises.find((ex) => ex.name === e.target.value);
                      if (selected) {
                        setNewExName(selected.name);
                        setNewExMuscle(selected.muscleGroup);
                      } else {
                        setNewExName(e.target.value);
                      }
                    }}
                    className="w-full text-xs p-2 rounded-xl border border-black/[0.1] bg-white outline-none focus:ring-1 focus:ring-[#AD314D]"
                  >
                    {catalogExercises.map((ex, i) => (
                      <option key={i} value={ex.name}>
                        {ex.name} ({ex.muscleGroup}){ex.isCustom ? " ★ Custom" : ""}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-bold uppercase text-[#777777] block mb-1">
                    Or Type Custom Name
                  </label>
                  <input
                    type="text"
                    value={newExName}
                    onChange={(e) => setNewExName(e.target.value)}
                    placeholder="Custom Exercise Name"
                    className="w-full text-xs p-2 rounded-xl border border-black/[0.1] bg-white outline-none focus:ring-1 focus:ring-[#AD314D]"
                  />
                </div>
              </div>

              {/* Muscle, Sets, Reps, Weight */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div>
                  <label className="text-[10px] font-bold uppercase text-[#777777] block mb-1">
                    Muscle
                  </label>
                  <select
                    value={newExMuscle}
                    onChange={(e) => setNewExMuscle(e.target.value as MuscleGroup)}
                    className="w-full text-xs p-2 rounded-xl border border-black/[0.1] bg-white outline-none"
                  >
                    {[
                      "Chest",
                      "Back",
                      "Legs",
                      "Shoulders",
                      "Arms",
                      "Core",
                      "Full Body",
                      "Cardio"
                    ].map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-bold uppercase text-[#777777] block mb-1">
                    Sets
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={12}
                    value={newExSets}
                    onChange={(e) => setNewExSets(parseInt(e.target.value) || 1)}
                    className="w-full text-xs p-2 rounded-xl border border-black/[0.1] bg-white outline-none"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold uppercase text-[#777777] block mb-1">
                    Reps Target
                  </label>
                  <input
                    type="text"
                    value={newExReps}
                    onChange={(e) => setNewExReps(e.target.value)}
                    placeholder="e.g. 8-12"
                    className="w-full text-xs p-2 rounded-xl border border-black/[0.1] bg-white outline-none"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold uppercase text-[#777777] block mb-1">
                    Weight ({unit})
                  </label>
                  <input
                    type="number"
                    step={0.5}
                    min={0}
                    value={newExWeight}
                    onChange={(e) =>
                      setNewExWeight(e.target.value === "" ? "" : parseFloat(e.target.value))
                    }
                    placeholder="0"
                    className="w-full text-xs p-2 rounded-xl border border-black/[0.1] bg-white outline-none"
                  />
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="text-[10px] font-bold uppercase text-[#777777] block mb-1">
                  Technique Cues / Warmup Notes (Optional)
                </label>
                <input
                  type="text"
                  value={newExNotes}
                  onChange={(e) => setNewExNotes(e.target.value)}
                  placeholder="e.g. 2 warm-up sets, pause 1s at chest"
                  className="w-full text-xs p-2 rounded-xl border border-black/[0.1] bg-white outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setIsAddingExercise(false)}
                  className="px-3 py-1.5 rounded-xl border border-black/[0.1] text-xs font-semibold text-[#4A4A4A]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleAddExercise}
                  className="px-4 py-1.5 rounded-xl bg-[#AD314D] hover:bg-[#92263F] text-white text-xs font-bold shadow-sm"
                >
                  Add to Routine
                </button>
              </div>
            </div>
          )}

          {/* Exercise Items List */}
          {activeDayCell.isRestDay ? (
            <div className="p-8 rounded-2xl bg-[#FBFBFA] border border-black/[0.04] text-center space-y-2">
              <Calendar className="w-8 h-8 text-[#777777] mx-auto opacity-50" />
              <h5 className="text-sm font-bold text-[#222222]">Scheduled Rest Day</h5>
              <p className="text-xs text-[#777777] max-w-sm mx-auto">
                No lifting planned. Focus on tissue regeneration, stretching, hydration, and restful sleep.
              </p>
              <button
                type="button"
                onClick={handleToggleRestDay}
                className="mt-2 px-4 py-2 rounded-xl bg-rose-50 text-[#AD314D] text-xs font-bold border border-rose-200"
              >
                Convert into a Workout Day
              </button>
            </div>
          ) : activeDayCell.exercises.length === 0 ? (
            <div className="p-8 rounded-2xl bg-[#FBFBFA] border border-black/[0.04] text-center space-y-2">
              <Dumbbell className="w-8 h-8 text-[#777777] mx-auto opacity-40" />
              <h5 className="text-sm font-bold text-[#222222]">No exercises programmed yet</h5>
              <p className="text-xs text-[#777777]">
                Click "+ Add Exercise" above to build this session or use the AI Generator.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Tool bar for Grid Operations */}
              <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-2xl bg-[#F6F6F4] border border-black/[0.06]">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleClearAllPlannerExercises}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-[#AD314D] border border-rose-200 text-xs font-bold transition-colors"
                    title="Clear all default template exercises across all weeks and days to start clean"
                  >
                    <Eraser className="w-3.5 h-3.5" />
                    <span>Clear All Planner Template</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleCalculateSmartProgression()}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-900 border border-amber-500/20 text-xs font-bold transition-colors"
                    title="Calculate suggested loads based on the 8-12 reps completion rule (+2.5kg if >50kg, +1.25kg if <=50kg) from your last completed workout"
                  >
                    <Zap className="w-3.5 h-3.5 fill-amber-500 text-amber-600" />
                    <span>⚡ Calculate Progression (8-12 Rule)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleClearSetsToBlank()}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white hover:bg-neutral-100 text-[#4A4A4A] border border-black/[0.08] text-xs font-semibold transition-colors"
                    title="Clear all weights and reps to blank for blank planning or live entry"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Blank for Planning</span>
                  </button>
                </div>

                <div className="text-[11px] text-[#777777] font-medium hidden sm:block">
                  💡 Exercises can have different set counts (e.g. 3, 4, or 5 sets). Use the <strong className="text-[#AD314D]">+Set</strong> button or set stepper on each movement.
                </div>
              </div>

              {/* Set-by-Set Excel Grid Table */}
              {(() => {
                const maxSetCols = Math.max(
                  3,
                  ...activeDayCell.exercises.map((e) =>
                    e.sets && e.sets.length > 0 ? e.sets.length : e.targetSets || 3
                  )
                );

                return (
                  <div className="overflow-x-auto rounded-2xl border border-black/[0.08] bg-white shadow-xs">
                    <table className="w-full text-left text-xs border-collapse min-w-[760px]">
                      <thead>
                        <tr className="bg-[#FAF9F8] border-b border-black/[0.06] text-[#777777] font-bold text-[10px] uppercase tracking-wider select-none">
                          <th className="py-2.5 px-2.5 w-12 text-center">#</th>
                          <th className="py-2.5 px-3 min-w-[210px]">Exercise &amp; Sets</th>
                          <th className="py-2.5 px-3 min-w-[170px]">Warmup &amp; Cues</th>
                          {Array.from({ length: maxSetCols }, (_, colIdx) => (
                            <th
                              key={colIdx}
                              className="py-2.5 px-2 text-center min-w-[95px] bg-[#F7F6F4]/50 border-l border-black/[0.04]"
                            >
                              <div className="flex items-center justify-center gap-1">
                                <span>Set {colIdx + 1}</span>
                                <span className="text-[9px] font-normal text-neutral-400">
                                  ({unit}/reps)
                                </span>
                              </div>
                            </th>
                          ))}
                          <th className="py-2.5 px-2 text-center w-20 bg-[#F7F6F4]/50 border-l border-black/[0.04] text-[#777777] font-bold text-[10px] uppercase tracking-wider">
                            + Set
                          </th>
                          <th className="py-2.5 px-3 text-right w-24">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-black/[0.05]">
                        {activeDayCell.exercises.map((ex, index) => {
                          const currentSets: PlannedSet[] =
                            ex.sets && ex.sets.length > 0
                              ? ex.sets
                              : Array.from({ length: ex.targetSets || 3 }, (_, i) => ({
                                  setNumber: i + 1,
                                  weight: ex.targetWeight,
                                  reps: ex.targetReps
                                }));

                          return (
                            <React.Fragment key={index}>
                              <tr className="hover:bg-neutral-50/70 transition-colors group">
                                {/* Order & # */}
                                <td className="py-3 px-2 text-center align-top">
                                  <div className="flex flex-col items-center gap-0.5 pt-0.5">
                                    <div className="flex items-center gap-0.5">
                                      <button
                                        type="button"
                                        disabled={index === 0}
                                        onClick={() => handleMoveExercise(index, "up")}
                                        className="text-[#777777] hover:text-[#222222] disabled:opacity-10 p-0.5"
                                        title="Move up"
                                      >
                                        <ChevronUp className="w-3 h-3" />
                                      </button>
                                      <button
                                        type="button"
                                        disabled={index === activeDayCell.exercises.length - 1}
                                        onClick={() => handleMoveExercise(index, "down")}
                                        className="text-[#777777] hover:text-[#222222] disabled:opacity-10 p-0.5"
                                        title="Move down"
                                      >
                                        <ChevronDown className="w-3 h-3" />
                                      </button>
                                    </div>
                                    <span className="font-extrabold text-[11px] text-[#777777]">
                                      {index + 1}
                                    </span>
                                  </div>
                                </td>

                                {/* Exercise Name & Muscle & Independent Sets Stepper */}
                                <td className="py-2.5 px-3 align-top space-y-1.5">
                                  <input
                                    type="text"
                                    value={ex.exerciseName}
                                    onChange={(e) => handleUpdateExerciseName(index, e.target.value)}
                                    className="w-full font-bold text-xs text-[#222222] bg-transparent border-b border-transparent hover:border-black/[0.1] focus:border-[#AD314D] py-0.5 outline-none"
                                    placeholder="Exercise name"
                                  />
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <select
                                      value={ex.muscleGroup}
                                      onChange={(e) =>
                                        handleUpdateExerciseMuscle(index, e.target.value as MuscleGroup)
                                      }
                                      className="text-[10px] font-bold text-[#AD314D] bg-rose-50 px-2 py-0.5 rounded-md border border-rose-100 outline-none"
                                    >
                                      {[
                                        "Chest",
                                        "Back",
                                        "Legs",
                                        "Shoulders",
                                        "Arms",
                                        "Core",
                                        "Full Body",
                                        "Cardio"
                                      ].map((m) => (
                                        <option key={m} value={m}>
                                          {m}
                                        </option>
                                      ))}
                                    </select>

                                    {/* Direct Set Stepper for THIS exercise only */}
                                    <div className="flex items-center gap-1 bg-neutral-100 px-1.5 py-0.5 rounded-lg border border-black/[0.06]">
                                      <span className="text-[9px] font-bold uppercase text-[#777777]">Sets:</span>
                                      <button
                                        type="button"
                                        onClick={() => handleRemoveSetColumn(index, currentSets.length - 1)}
                                        disabled={currentSets.length <= 1}
                                        className="w-4 h-4 rounded bg-white hover:bg-neutral-200 disabled:opacity-20 text-[#4A4A4A] font-black text-xs flex items-center justify-center transition-colors shadow-2xs"
                                        title={`Remove last set from ${ex.exerciseName} only`}
                                      >
                                        -
                                      </button>
                                      <span className="text-[11px] font-black text-[#AD314D] px-1 min-w-[14px] text-center">
                                        {currentSets.length}
                                      </span>
                                      <button
                                        type="button"
                                        onClick={() => handleAddSetColumn(index)}
                                        className="w-4 h-4 rounded bg-rose-100 hover:bg-rose-200 text-[#AD314D] font-black text-xs flex items-center justify-center transition-colors shadow-2xs"
                                        title={`Add set to ${ex.exerciseName} only`}
                                      >
                                        +
                                      </button>
                                    </div>

                                    {/* Machine Selection for Distinct Progression Tracking */}
                                    <div className="flex items-center gap-1 bg-indigo-50/70 hover:bg-indigo-50 px-1.5 py-0.5 rounded-lg border border-indigo-100/80 transition-colors">
                                      <span className="text-[9px] font-bold text-indigo-700">⚙️</span>
                                      <select
                                        value={ex.machineId || ""}
                                        onChange={(e) => {
                                          const val = e.target.value;
                                          if (val === "__add_new__") {
                                            setAddingMachineForPlannerExIdx(index);
                                            setIsPlannerMachineModalOpen(true);
                                            return;
                                          }
                                          const allMachines = plannerGyms.flatMap((g) => g.machines || []);
                                          const matched = allMachines.find((m) => m.id === val);
                                          handleUpdateExerciseMachine(index, val, matched?.name);
                                        }}
                                        className="text-[10px] font-bold text-indigo-900 bg-transparent outline-none max-w-[120px] truncate cursor-pointer"
                                        title={ex.machineName ? `Selected Machine: ${ex.machineName}` : "Select specific machine for isolated progression"}
                                      >
                                        <option value="">(Select Machine)</option>
                                        {plannerAvailableMachines.map((m) => (
                                          <option key={m.id} value={m.id}>
                                            {m.name}
                                          </option>
                                        ))}
                                        <option value="__add_new__">+ Add Machine...</option>
                                      </select>
                                      {ex.machineName && (
                                        <button
                                          type="button"
                                          onClick={() => handleUpdateExerciseMachine(index, undefined, undefined)}
                                          className="text-[10px] text-neutral-400 hover:text-red-500 font-bold px-0.5"
                                          title="Clear machine"
                                        >
                                          ×
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                </td>

                                {/* Warmup / Cues */}
                                <td className="py-2.5 px-3 align-top">
                                  <textarea
                                    rows={2}
                                    value={ex.warmupNotes || ""}
                                    onChange={(e) => handleUpdateExerciseNotes(index, e.target.value)}
                                    placeholder="Warmup, tempo, or form cues..."
                                    className="w-full text-[11px] text-[#4A4A4A] bg-[#FBFBFA] border border-black/[0.06] hover:border-black/[0.12] focus:border-[#AD314D] p-1.5 rounded-lg outline-none resize-none leading-tight"
                                  />
                                </td>

                                {/* Horizontal Set Columns */}
                                {Array.from({ length: maxSetCols }, (_, colIdx) => {
                                  const setItem = currentSets[colIdx];

                                  if (setItem) {
                                    return (
                                      <td
                                        key={colIdx}
                                        className="py-2.5 px-1.5 align-top border-l border-black/[0.04] bg-neutral-50/30"
                                      >
                                        <div className="p-1 rounded-xl bg-white border border-black/[0.08] shadow-2xs space-y-1 relative group/cell">
                                          {/* Weight input */}
                                          <div className="flex items-center gap-1 bg-[#FBFBFA] px-1.5 py-0.5 rounded border border-black/[0.04]">
                                            <input
                                              type="number"
                                              step={0.5}
                                              min={0}
                                              value={setItem.weight !== undefined ? setItem.weight : ""}
                                              onChange={(e) =>
                                                handleUpdateExerciseSet(
                                                  index,
                                                  colIdx,
                                                  "weight",
                                                  e.target.value === "" ? "" : parseFloat(e.target.value)
                                                )
                                              }
                                              placeholder={`—`}
                                              className="w-full text-center font-bold text-xs text-[#222222] bg-transparent outline-none"
                                            />
                                            <span className="text-[9px] font-medium text-neutral-400 select-none">
                                              {unit}
                                            </span>
                                          </div>

                                          {/* Reps input */}
                                          <div className="flex items-center gap-1 bg-[#FBFBFA] px-1.5 py-0.5 rounded border border-black/[0.04]">
                                            <input
                                              type="text"
                                              value={setItem.reps !== undefined ? setItem.reps : ""}
                                              onChange={(e) =>
                                                handleUpdateExerciseSet(
                                                  index,
                                                  colIdx,
                                                  "reps",
                                                  e.target.value
                                                )
                                              }
                                              placeholder={`reps`}
                                              className="w-full text-center font-semibold text-[11px] text-[#4A4A4A] bg-transparent outline-none"
                                            />
                                          </div>

                                          {/* Remove set button - visible on hover & easy tap */}
                                          {currentSets.length > 1 && (
                                            <button
                                              type="button"
                                              onClick={() => handleRemoveSetColumn(index, colIdx)}
                                              className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-rose-500 text-white text-[9px] font-bold flex items-center justify-center opacity-70 hover:opacity-100 transition-opacity hover:bg-rose-600 shadow-xs"
                                              title={`Remove Set ${colIdx + 1} from ${ex.exerciseName} only`}
                                            >
                                              ×
                                            </button>
                                          )}
                                        </div>
                                      </td>
                                    );
                                  }

                                  // If this is the immediate next column for this exercise, offer quick add
                                  if (colIdx === currentSets.length) {
                                    return (
                                      <td
                                        key={colIdx}
                                        className="py-2.5 px-1.5 align-middle text-center border-l border-black/[0.04]"
                                      >
                                        <button
                                          type="button"
                                          onClick={() => handleAddSetColumn(index)}
                                          className="w-full py-2.5 px-1.5 rounded-xl border border-dashed border-[#AD314D]/40 bg-rose-50/50 hover:bg-rose-100/70 text-[#AD314D] text-[10px] font-bold flex items-center justify-center gap-1 transition-colors"
                                          title={`Add Set ${colIdx + 1} to ${ex.exerciseName} only`}
                                        >
                                          <Plus className="w-3 h-3" />
                                          <span>Set {colIdx + 1}</span>
                                        </button>
                                      </td>
                                    );
                                  }

                                  // Blank cell placeholder for exercises with fewer sets than maxSetCols
                                  return (
                                    <td
                                      key={colIdx}
                                      className="py-2.5 px-1.5 align-middle text-center border-l border-black/[0.04] text-neutral-300 select-none text-[11px]"
                                    >
                                      —
                                    </td>
                                  );
                                })}

                                {/* Add Set Column for THIS exercise */}
                                <td className="py-2.5 px-1.5 align-middle text-center border-l border-black/[0.04]">
                                  <button
                                    type="button"
                                    onClick={() => handleAddSetColumn(index)}
                                    className="w-full py-2 px-1 rounded-xl bg-white border border-[#AD314D]/30 hover:bg-rose-50 text-[#AD314D] text-[10px] font-bold flex items-center justify-center gap-1 transition-colors shadow-2xs"
                                    title={`Add Set to ${ex.exerciseName} only`}
                                  >
                                    <Plus className="w-3 h-3" />
                                    <span>+ Set</span>
                                  </button>
                                </td>

                                {/* Actions Column */}
                                <td className="py-2.5 px-3 align-top text-right">
                                  <div className="flex items-center justify-end gap-1 pt-1">
                                    <button
                                      type="button"
                                      onClick={() => handleCalculateSmartProgression(index)}
                                      className="p-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 transition-colors"
                                      title="Calculate smart progression for this exercise from last session"
                                    >
                                      <Zap className="w-3.5 h-3.5 fill-amber-500 text-amber-600" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleClearSetsToBlank(index)}
                                      className="p-1.5 rounded-lg bg-neutral-100 hover:bg-neutral-200 text-[#4A4A4A] transition-colors"
                                      title="Blank weights and reps for planning"
                                    >
                                      <RotateCcw className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteExercise(index)}
                                      className="p-1.5 rounded-lg text-neutral-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                                      title="Delete exercise"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </td>
                              </tr>

                              {/* Progression Rationale Note Sub-row if active */}
                              {ex.progressionNote && (
                                <tr className="bg-amber-50/50 border-b border-black/[0.04]">
                                  <td colSpan={maxSetCols + 5} className="py-1 px-3 text-[11px]">
                                    <div className="flex items-center gap-1.5 text-amber-900 font-medium">
                                      <Zap className="w-3 h-3 fill-amber-500 text-amber-600 shrink-0" />
                                      <span className="font-bold">Smart Progression:</span>
                                      <span>{ex.progressionNote}</span>
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Toast alert */}
      {toastMessage && (
        <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium flex items-center justify-between shadow-sm animate-in fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{toastMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setToastMessage(null)}
            className="text-emerald-700 hover:text-emerald-900 font-bold ml-3"
          >
            ×
          </button>
        </div>
      )}

      {/* ========================================================================= */}
      {/* PROGRAM IDENTITY, OBJECTIVES & PRE-PLANNED SWITCHER (User Requested) */}
      {/* ========================================================================= */}
      <div className="p-5 sm:p-6 rounded-3xl bg-white border border-black/[0.08] shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#AD314D] to-[#69182C] text-white flex items-center justify-center shadow-md">
              <Layers className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-bold uppercase tracking-wider text-[#AD314D]">
                  Active Training Program
                </span>
                <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-neutral-100 text-[#4A4A4A] capitalize">
                  Goal: {currentProgram?.goal || "Hypertrophy"}
                </span>
                {currentProgram?.isCustom && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200">
                    Custom User Program
                  </span>
                )}
                <span className="text-[11px] text-[#777777]">
                  • {currentProgram?.daysPerWeek || currentProgram?.splitDaysPerWeek || (activeMatrixDaysCount > 0 ? activeMatrixDaysCount : 5)} Days/Wk • {currentProgram?.totalWeeks || currentProgram?.durationWeeks || 8} Wks
                </span>
                {activeMatrixDaysCount > 0 && currentProgram && (currentProgram.daysPerWeek || currentProgram.splitDaysPerWeek || 5) !== activeMatrixDaysCount && (
                  <button
                    type="button"
                    onClick={handleQuickSyncDaysFromMatrix}
                    className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100 transition-colors flex items-center gap-1 cursor-pointer"
                    title="Click to align program setup to match matrix days"
                  >
                    <Check className="w-3 h-3 text-emerald-600" />
                    <span>{activeMatrixDaysCount} Days Active in Matrix • Click to Sync</span>
                  </button>
                )}
              </div>
              {!isEditingProgramName ? (
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  <h2 className="text-xl font-bold text-[#222222]">
                    {currentProgram?.name || "Hypertrophy Mass Builder (5-Day Specialization)"}
                  </h2>
                  <button
                    type="button"
                    onClick={() => {
                      setProgramNameDraft(currentProgram?.name || "");
                      setIsEditingProgramName(true);
                    }}
                    className="p-1 rounded-lg hover:bg-neutral-100 text-neutral-400 hover:text-[#222222] transition-colors"
                    title="Edit Program Name"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleOpenEditProgram(currentProgram)}
                    className="px-2.5 py-1 rounded-xl bg-neutral-100 hover:bg-neutral-200 text-[#4A4A4A] hover:text-[#222222] transition-colors flex items-center gap-1.5 text-xs font-semibold cursor-pointer"
                    title="Edit Program Setup (Days/Wk, Objectives, Duration)"
                  >
                    <SlidersHorizontal className="w-3 h-3 text-[#AD314D]" />
                    <span>Edit Program Setup</span>
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <input
                    type="text"
                    value={programNameDraft}
                    onChange={(e) => setProgramNameDraft(e.target.value)}
                    className="px-2.5 py-1 text-sm font-bold border border-black/[0.15] rounded-xl outline-none focus:ring-2 focus:ring-[#AD314D] bg-white text-[#222222] min-w-[240px]"
                    placeholder="Program name"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (programNameDraft.trim() && onUpdateProgramName && currentProgram) {
                        onUpdateProgramName(currentProgram.id, programNameDraft.trim());
                        showToast(`Program renamed to "${programNameDraft.trim()}"`);
                      }
                      setIsEditingProgramName(false);
                    }}
                    className="px-3 py-1 rounded-xl bg-[#AD314D] hover:bg-[#92263F] text-white text-xs font-bold transition-colors"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsEditingProgramName(false)}
                    className="px-2.5 py-1 rounded-xl border border-black/[0.1] text-xs font-semibold text-[#777777] hover:bg-neutral-100 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {onDeleteProgram && currentProgram && (
              confirmDeleteProgramId === currentProgram.id ? (
                <div className="flex items-center gap-1.5 animate-in fade-in">
                  <button
                    type="button"
                    onClick={() => {
                      onDeleteProgram(currentProgram.id);
                      setConfirmDeleteProgramId(null);
                    }}
                    className="px-3.5 py-2 rounded-full bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition-colors shadow-xs cursor-pointer"
                  >
                    Confirm Delete?
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteProgramId(null)}
                    className="px-3 py-2 rounded-full border border-black/10 text-xs font-semibold text-[#555555] hover:bg-neutral-100 transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    if (programs.length <= 1) {
                      showToast("Cannot delete the only remaining program.");
                      return;
                    }
                    setConfirmDeleteProgramId(currentProgram.id);
                  }}
                  className="px-3.5 py-2 rounded-full border border-rose-200 bg-rose-50/70 hover:bg-rose-100 text-rose-700 text-xs font-bold transition-colors flex items-center gap-1.5 shadow-2xs cursor-pointer"
                  title="Delete current active program"
                >
                  <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                  <span>Delete Program</span>
                </button>
              )
            )}
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-black/[0.12] bg-[#FAF9F8] shadow-2xs">
              <span className="text-[10px] font-black uppercase tracking-wider text-[#AD314D] whitespace-nowrap">Program:</span>
              <select
                value={activeProgramId || currentProgram?.id}
                onChange={(e) => {
                  if (onSelectProgram) onSelectProgram(e.target.value);
                }}
                className="text-xs font-bold text-[#222222] bg-transparent outline-none cursor-pointer max-w-[200px] truncate"
                title="Switch active program"
              >
                {programs.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.daysPerWeek || p.splitDaysPerWeek || 6}d)
                  </option>
                ))}
              </select>
            </div>
            {currentProgram?.id !== "prog-single-muscle" ? (
              <button
                type="button"
                onClick={() => {
                  if (onSelectProgram) onSelectProgram("prog-single-muscle");
                }}
                className="px-3.5 py-2 rounded-full border border-[#AD314D] bg-rose-50 hover:bg-rose-100 text-[#AD314D] text-xs font-bold transition-colors flex items-center gap-1.5 shadow-2xs cursor-pointer"
                title="Switch directly to Single Muscle Dedicated Split (6-Day)"
              >
                <Sparkles className="w-3.5 h-3.5 text-[#AD314D]" />
                <span>6-Day Single Muscle Split</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  const defaultProg = createPreplannedPrograms().find((p) => p.id === "prog-single-muscle");
                  if (defaultProg && defaultProg.matrixPlans) {
                    if (onUpdatePlans) {
                      onUpdatePlans(defaultProg.matrixPlans);
                    } else if (onUpdateMatrixPlans) {
                      onUpdateMatrixPlans(defaultProg.matrixPlans);
                    }
                    showToast("Restored full 6-Day Single Muscle Split matrix!");
                  }
                }}
                className="px-3 py-1.5 rounded-full border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-bold transition-colors flex items-center gap-1.5 shadow-2xs cursor-pointer"
                title="Reset/Re-sync all 6 days to the Single Muscle Split"
              >
                <Check className="w-3.5 h-3.5 text-emerald-600" />
                <span>Re-sync 6-Day Routine</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setIsExcelModalOpen(true)}
              className="px-3.5 py-2 rounded-full border border-emerald-600/30 bg-emerald-50/60 hover:bg-emerald-100/60 text-emerald-800 text-xs font-bold transition-colors flex items-center gap-1.5 shadow-2xs"
              title="Import or export weekly matrix plans and workout logs in Excel"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
              <span>Excel Import / Export</span>
            </button>
            <button
              type="button"
              onClick={() => handleOpenEditProgram(currentProgram)}
              className="px-3.5 py-2 rounded-full border border-black/[0.1] hover:bg-neutral-50 text-xs font-bold text-[#222222] transition-colors flex items-center gap-1.5 shadow-2xs cursor-pointer"
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-[#AD314D]" />
              <span>Edit Program Setup</span>
            </button>
            <button
              type="button"
              onClick={() => setIsProgramModalOpen(true)}
              className="px-3.5 py-2 rounded-full border border-black/[0.1] hover:bg-neutral-50 text-xs font-bold text-[#222222] transition-colors flex items-center gap-1.5 shadow-2xs"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              <span>All Programs ({programs.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setIsCustomProgramModalOpen(true)}
              className="px-4 py-2 rounded-full bg-[#AD314D] hover:bg-[#92263F] text-white text-xs font-bold shadow-sm transition-all flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create Custom Program</span>
            </button>
          </div>
        </div>

        {/* Objectives & Split Box */}
        <div className="p-4 rounded-2xl bg-[#F8F8F7] border border-black/[0.05] space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-bold text-[#222222]">
              <Target className="w-4 h-4 text-[#AD314D]" />
              <span>Program Setup, Objectives &amp; Split Targets</span>
            </div>
            {!isEditingObjectives ? (
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setIsEditingObjectives(true)}
                  className="hidden text-xs font-semibold text-[#AD314D] hover:underline items-center gap-1 cursor-pointer"
                >
                  <Edit2 className="w-3 h-3" />
                  <span>Edit Split &amp; Objectives</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleOpenEditProgram(currentProgram)}
                  className="text-xs font-semibold text-[#777777] hover:text-[#222222] hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <SlidersHorizontal className="w-3 h-3 text-[#AD314D]" />
                  <span>Full Edit</span>
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsEditingObjectives(false)}
                  className="text-xs font-semibold text-[#777777] hover:underline cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (currentProgram) {
                      const updatedProg: TrainingProgram = {
                        ...currentProgram,
                        primaryObjective: objPrimaryDraft.trim() || currentProgram.primaryObjective,
                        secondaryObjective: objSecondaryDraft.trim() || undefined,
                        daysPerWeek: objDaysDraft,
                        splitDaysPerWeek: objDaysDraft,
                        goal: objGoalDraft,
                        isCustom: true,
                        updatedAt: new Date().toISOString()
                      };
                      if (onUpdateProgram) {
                        onUpdateProgram(updatedProg);
                      } else if (onUpdateProgramObjectives) {
                        onUpdateProgramObjectives(currentProgram.id, updatedProg.primaryObjective, updatedProg.secondaryObjective);
                      }
                      showToast(`Program setup updated (${objDaysDraft} Days/Wk).`);
                    }
                    setIsEditingObjectives(false);
                  }}
                  className="px-3 py-1 rounded-xl bg-[#AD314D] text-white text-xs font-bold shadow-sm cursor-pointer"
                >
                  Save Split &amp; Objectives
                </button>
              </div>
            )}
          </div>

          {!isEditingObjectives ? (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div className="p-3 rounded-xl bg-white border border-black/[0.04]">
                <span className="text-[10px] font-bold uppercase text-[#777777] block">
                  Weekly Split &amp; Goal
                </span>
                <p className="font-semibold text-[#222222] mt-0.5 capitalize">
                  {currentProgram?.daysPerWeek || currentProgram?.splitDaysPerWeek || (activeMatrixDaysCount > 0 ? activeMatrixDaysCount : 5)} Days/Week • {currentProgram?.goal || "Hypertrophy"}
                </p>
              </div>
              <div className="p-3 rounded-xl bg-white border border-black/[0.04]">
                <span className="text-[10px] font-bold uppercase text-[#777777] block">
                  Primary Objective
                </span>
                <p className="font-semibold text-[#222222] mt-0.5">
                  {currentProgram?.primaryObjective || "Maximize hypertrophy with progressive volume overload."}
                </p>
              </div>
              <div className="p-3 rounded-xl bg-white border border-black/[0.04]">
                <span className="text-[10px] font-bold uppercase text-[#777777] block">
                  Secondary Objective
                </span>
                <p className="font-semibold text-[#222222] mt-0.5">
                  {currentProgram?.secondaryObjective || "Maintain shoulder joint integrity and steady recovery."}
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold uppercase text-[#777777] block mb-1">
                    Days Per Week
                  </label>
                  <select
                    value={objDaysDraft}
                    onChange={(e) => setObjDaysDraft(Number(e.target.value))}
                    className="w-full text-xs p-2.5 rounded-xl border border-black/[0.12] bg-white text-[#222222] font-semibold outline-none focus:ring-2 focus:ring-[#AD314D]"
                  >
                    {[1, 2, 3, 4, 5, 6, 7].map((num) => (
                      <option key={num} value={num}>
                        {num} Days / Week {activeMatrixDaysCount === num ? "(Active in Matrix)" : ""}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase text-[#777777] block mb-1">
                    Goal Focus
                  </label>
                  <select
                    value={objGoalDraft}
                    onChange={(e) => setObjGoalDraft(e.target.value as FitnessGoal)}
                    className="w-full text-xs p-2.5 rounded-xl border border-black/[0.12] bg-white text-[#222222] font-semibold outline-none focus:ring-2 focus:ring-[#AD314D]"
                  >
                    <option value="bulk">Hypertrophy Mass Builder (Bulk)</option>
                    <option value="strength">Strength &amp; Heavy Power</option>
                    <option value="shred">Metabolic Shred &amp; Conditioning</option>
                    <option value="recomp">Body Recomposition</option>
                    <option value="longevity">Longevity &amp; Joint Health</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase text-[#777777] block mb-1">
                  Primary Objective
                </label>
                <input
                  type="text"
                  value={objPrimaryDraft}
                  onChange={(e) => setObjPrimaryDraft(e.target.value)}
                  className="w-full text-xs p-2.5 rounded-xl border border-black/[0.12] bg-white text-[#222222] font-semibold outline-none focus:ring-2 focus:ring-[#AD314D]"
                  placeholder="e.g. Add 3kg muscle mass and increase bench press by 7.5kg"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase text-[#777777] block mb-1">
                  Secondary Objective
                </label>
                <input
                  type="text"
                  value={objSecondaryDraft}
                  onChange={(e) => setObjSecondaryDraft(e.target.value)}
                  className="w-full text-xs p-2.5 rounded-xl border border-black/[0.12] bg-white text-[#222222] font-semibold outline-none focus:ring-2 focus:ring-[#AD314D]"
                  placeholder="e.g. Prioritize upper chest clavicular fullness & posture"
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Top Controls & Matrix Header */}
      <div className="p-5 sm:p-6 rounded-3xl bg-white border border-black/[0.08] shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="w-2.5 h-2.5 rounded-full bg-[#AD314D]" />
              <h2 className="text-lg sm:text-xl font-bold text-[#222222] tracking-tight">
                Program Planner
              </h2>
              <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-rose-50 text-[#AD314D] border border-rose-100">
                Fully Editable
              </span>

              {/* Information Icon Button for Matrix explanation */}
              <button
                type="button"
                onClick={() => setShowMatrixInfoModal(true)}
                title="Program Matrix Planner instructions & overload guide"
                className="w-6 h-6 rounded-full bg-neutral-100 hover:bg-neutral-200 border border-black/[0.08] flex items-center justify-center text-[#AD314D] transition-colors"
                aria-label="Information guide"
              >
                <Info className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Cycle Start Date Picker */}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-2xl bg-[#F0F0EE] border border-black/[0.04]">
              <Calendar className="w-3.5 h-3.5 text-[#AD314D]" />
              <span className="text-[#555555] font-bold text-xs">Cycle Start:</span>
              <input
                type="date"
                value={cycleStartDate}
                onChange={(e) => handleCycleStartDateChange(e.target.value)}
                className="bg-white px-2 py-0.5 rounded-lg border border-black/[0.08] text-xs font-black text-[#222222] outline-none cursor-pointer hover:border-[#AD314D]"
                title="Change the start date for Week 1 (Monday). Automatically reschedules all weeks."
              />
              <button
                type="button"
                onClick={() => handleCycleStartDateChange(getTodayOrCurrentMondayDate())}
                className="px-2 py-0.5 rounded-lg bg-rose-100 hover:bg-rose-200 text-[#AD314D] text-[11px] font-bold transition-colors cursor-pointer shadow-2xs"
                title="Snap program start date to Monday of current week"
              >
                Start This Week
              </button>
              {cycleStartDate !== CANONICAL_PROGRAM_START_DATE && (
                <button
                  type="button"
                  onClick={() => handleCycleStartDateChange(CANONICAL_PROGRAM_START_DATE)}
                  className="px-2 py-0.5 rounded-lg bg-emerald-100 hover:bg-emerald-200 text-emerald-800 text-[11px] font-bold transition-colors cursor-pointer shadow-2xs"
                  title="Reset cycle start date to original planned start (14 Sep 2026)"
                >
                  Reset to 14 Sep
                </button>
              )}
              <span className="text-[11px] font-semibold text-[#777777] hidden sm:inline">
                ({formatFriendlyDate(cycleStartDate)})
              </span>
            </div>

            {/* Dynamic Weeks Stepper, Input & Presets */}
            <div className="flex items-center gap-1.5 p-1 rounded-2xl bg-[#F0F0EE] border border-black/[0.04] flex-wrap">
              <span className="text-[#555555] font-bold text-xs pl-2 pr-1">Weeks:</span>
              <button
                type="button"
                onClick={() => handleDeleteWeek(matrixPlans.length)}
                disabled={matrixPlans.length <= 1}
                className="w-7 h-7 rounded-xl bg-white border border-black/[0.08] text-[#222222] font-black text-xs hover:bg-neutral-100 disabled:opacity-40 transition-colors flex items-center justify-center cursor-pointer shadow-2xs"
                title="Delete last week from matrix plan"
              >
                -
              </button>

              <input
                type="number"
                min={1}
                max={52}
                value={totalWeeksView}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  if (!isNaN(val) && val >= 1) {
                    handleSetTotalWeeksCustom(val);
                  }
                }}
                className="w-12 text-center font-black text-xs bg-white py-1 rounded-xl border border-black/[0.08] text-[#222222] outline-none"
                title="Type any custom duration (1 to 52 weeks)"
              />

              <button
                type="button"
                onClick={handleAddWeek}
                className="w-7 h-7 rounded-xl bg-white border border-black/[0.08] text-[#AD314D] font-black text-xs hover:bg-rose-50 transition-colors flex items-center justify-center cursor-pointer shadow-2xs"
                title="Add a new week to matrix plan"
              >
                +
              </button>

              <div className="h-4 w-px bg-black/10 mx-1 hidden sm:block" />

              {/* Quick Presets */}
              {[4, 8, 12, 16].map((count) => (
                <button
                  key={count}
                  type="button"
                  onClick={() => handleSetTotalWeeksCustom(count)}
                  className={`px-2.5 py-1 rounded-xl text-xs font-bold transition-all ${
                    totalWeeksView === count
                      ? "bg-[#AD314D] text-white shadow-xs"
                      : "text-[#4A4A4A] hover:text-[#222222] hover:bg-white/60"
                  }`}
                  title={`Set matrix duration to ${count} weeks`}
                >
                  {count} Wks
                </button>
              ))}
            </div>

            {/* Explicit Add Week Button */}
            <button
              type="button"
              onClick={handleAddWeek}
              className="flex items-center gap-1.5 px-3 py-2 rounded-2xl bg-white border border-rose-200 text-[#AD314D] hover:bg-rose-50 font-bold text-xs shadow-2xs transition-all cursor-pointer"
              title="Add a new training week to the matrix plan"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Week</span>
            </button>

            {/* Explicit Add Deload Week Button */}
            <button
              type="button"
              onClick={handleAddDeloadWeek}
              className="flex items-center gap-1.5 px-3 py-2 rounded-2xl bg-amber-50 border border-amber-300 text-amber-900 hover:bg-amber-100 font-bold text-xs shadow-2xs transition-all cursor-pointer"
              title="Add a Deload recovery week at the end of the program"
            >
              <Plus className="w-3.5 h-3.5 text-amber-700" />
              <span>Deload Week 🧘</span>
            </button>

            {/* Overload progression rate selector */}
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-2xl bg-[#F0F0EE] border border-black/[0.04] text-xs">
              <span className="text-[#777777] font-medium text-[11px]">Progression:</span>
              <select
                value={progressionRate}
                onChange={(e) => setProgressionRate(Number(e.target.value))}
                className="bg-transparent font-bold text-[#222222] outline-none text-xs cursor-pointer"
              >
                <option value={1.5}>+1.5% / wk</option>
                <option value={2.0}>+2.0% / wk</option>
                <option value={2.5}>+2.5% / wk</option>
                <option value={3.0}>+3.0% / wk</option>
                <option value={5.0}>+5.0% / wk</option>
              </select>
            </div>

            {/* Auto-fill Weeks Button */}
            <button
              type="button"
              onClick={handleAutoFill}
              title="Copies Week 1 across all weeks with automatic progressive overload and deloads"
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-2xl bg-[#EFEFED] hover:bg-[#E4E4E1] text-[#222222] text-xs font-semibold border border-black/[0.06] transition-all shadow-sm"
            >
              <Copy className="w-3.5 h-3.5 text-[#AD314D]" />
              <span>Auto-Fill from W1</span>
            </button>

            {/* Save Program Matrix Plan Button */}
            <button
              type="button"
              onClick={handleSavePlan}
              title={`Save ${totalWeeksView}-week program matrix, progression weights & objectives`}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-2xl font-bold text-xs transition-all shadow-sm active:scale-95 ${
                isSavedFeedback
                  ? "bg-emerald-600 text-white"
                  : "bg-[#AD314D] hover:bg-[#8C1E37] text-white"
              }`}
            >
              {isSavedFeedback ? (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>Saved ✓</span>
                </>
              ) : (
                <>
                  <Save className="w-3.5 h-3.5" />
                  <span>Save {totalWeeksView}-Wk Plan</span>
                </>
              )}
            </button>

            {/* Program Quiz & Recommendations Button */}
            {onOpenOnboarding && (
              <button
                type="button"
                onClick={onOpenOnboarding}
                className="flex items-center gap-1.5 px-3 py-2 rounded-2xl bg-white hover:bg-rose-50 text-[#AD314D] border border-rose-200 text-xs font-semibold shadow-2xs transition-all cursor-pointer"
                title="Answer 5 questions to calibrate your fitness goal, split, and get suggested training programs"
              >
                <ListChecks className="w-3.5 h-3.5 text-[#AD314D]" />
                <span>Program Quiz (5 Qs)</span>
              </button>
            )}

            {/* AI Generator Button */}
            <button
              type="button"
              onClick={onOpenAiGenerator}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-2xl bg-gradient-to-r from-[#AD314D] to-[#8C1E37] hover:brightness-105 text-white text-xs font-semibold shadow-sm transition-all cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-300" />
              <span>AI Generator</span>
            </button>
          </div>
        </div>

        {/* Matrix Guide Information Modal */}
        {showMatrixInfoModal && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
            <div className="bg-white border border-black/[0.1] rounded-3xl p-5 sm:p-6 max-w-lg w-full shadow-2xl text-[#222222] space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-black/[0.06]">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-rose-50 border border-rose-200 flex items-center justify-center text-[#AD314D]">
                    <Info className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-[#222222]">Program Matrix Guide</h3>
                    <p className="text-[11px] text-[#777777]">Editable 12-Week Progression Framework</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowMatrixInfoModal(false)}
                  className="p-1 rounded-lg text-[#777777] hover:text-[#222222] hover:bg-black/[0.05] transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3 text-xs text-[#4A4A4A] leading-relaxed">
                <div className="p-3 rounded-2xl bg-[#F7F7F6] border border-black/[0.04] space-y-2">
                  <div>
                    <span className="font-bold text-[#222222] block">1. Direct In-Grid & Modal Editing</span>
                    <span className="text-[11px]">Click any cell or exercise directly on the grid to edit exercises, target weights, sets, and reps. Tap the pencil icon to inspect full volume and set distributions.</span>
                  </div>
                  <div>
                    <span className="font-bold text-[#222222] block">2. Week 1 Blueprint & Auto-Fill</span>
                    <span className="text-[11px]">Configure your routine in Week 1, then hit <strong>Auto-Fill from W1</strong>. The engine will automatically project your chosen progression rate across all chosen weeks (e.g. 12 Weeks).</span>
                  </div>
                  <div>
                    <span className="font-bold text-[#222222] block">3. Deload Waves & Cycle Peaks</span>
                    <span className="text-[11px]">Structured deloads are automatically scheduled on Weeks 4 and 8 to restore CNS and muscle recovery before pushing into peak overload.</span>
                  </div>
                  <div>
                    <span className="font-bold text-[#222222] block">4. Live Session & Matrix Sync</span>
                    <span className="text-[11px]">When you log your workouts in Today&apos;s Session or the Live Diary, actual weights lifted synchronize with the matrix table and show a green completion badge.</span>
                  </div>
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setShowMatrixInfoModal(false)}
                  className="px-4 py-2 rounded-xl bg-[#AD314D] hover:bg-[#8C1E37] text-white font-bold text-xs transition-colors"
                >
                  Got it
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* MATRIX TABLE: Monday–Sunday Down (Rows), Week 1–N Right (Columns) */}
      <div className="bg-white rounded-3xl border border-black/[0.08] shadow-sm overflow-hidden">
        {/* Table Top Controls & Mode Switcher */}
        <div className="p-3.5 sm:p-4 bg-[#F7F7F6] border-b border-black/[0.06] flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs font-bold text-[#222222]">
            <Calendar className="w-4 h-4 text-[#AD314D]" />
            <span>Weekly Matrix Grid</span>

            {/* 3-Way Grid View Switcher */}
            <div className="flex items-center p-1 rounded-xl bg-neutral-200/70 border border-black/[0.06] ml-2">
              <button
                type="button"
                onClick={() => setGridMode("plan")}
                className={`flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                  gridMode === "plan"
                    ? "bg-white text-[#222222] shadow-xs"
                    : "text-[#555555] hover:text-[#111111]"
                }`}
                title="Directly edit exercises, sets, reps and weights in the grid"
              >
                <Edit2 className="w-3 h-3 text-[#AD314D]" />
                <span>Planned Routine (Direct Edit)</span>
              </button>

              <button
                type="button"
                onClick={() => setGridMode("completed")}
                className={`flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                  gridMode === "completed"
                    ? "bg-white text-[#222222] shadow-xs"
                    : "text-[#555555] hover:text-[#111111]"
                }`}
                title="View actual completed workout logs from your training diary"
              >
                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                <span>Completed Sessions</span>
              </button>

              <button
                type="button"
                onClick={() => setGridMode("compare")}
                className={`flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                  gridMode === "compare"
                    ? "bg-white text-[#222222] shadow-xs"
                    : "text-[#555555] hover:text-[#111111]"
                }`}
                title="Compare planned target weights vs actual completed logs"
              >
                <TrendingUp className="w-3 h-3 text-blue-600" />
                <span>Plan vs Actual</span>
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[11px] text-[#777777] hidden sm:inline">
              Selected: <strong className="text-[#AD314D]">Week {selectedCell.weekNumber} • {selectedCell.day}</strong>
            </span>
            <button
              type="button"
              onClick={() => setShowDayInspector((prev) => !prev)}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-bold border transition-all ${
                showDayInspector
                  ? "bg-rose-50 border-rose-200 text-[#AD314D]"
                  : "bg-white border-black/[0.1] text-neutral-600 hover:text-neutral-900"
              }`}
              title="Toggle Day Details Inspector panel below the table"
            >
              <Layers className="w-3 h-3" />
              <span>{showDayInspector ? "Hide Day Details" : "Show Day Details"}</span>
            </button>
            <button
              type="button"
              onClick={() => setIsCellModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-[#AD314D] hover:bg-[#92263F] text-white text-xs font-bold shadow-sm transition-all"
              title="Open full editor modal for selected day"
            >
              <Edit2 className="w-3 h-3" />
              <span>Open Popup Modal</span>
            </button>
          </div>
        </div>

        {/* 3-Week Carousel & Navigation Controls Bar */}
        <div className="px-4 py-3 bg-neutral-50/90 border-b border-black/[0.06] flex flex-wrap items-center justify-between gap-3">
          {/* Left: Navigation Arrows & Quick Jump Pills */}
          <div className="flex items-center gap-2 flex-wrap">
            {startWeekIndex > 0 && viewMode !== "all" ? (
              <button
                type="button"
                onClick={handlePrevWeeks}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-white border-2 border-[#AD314D] text-[#AD314D] hover:bg-rose-50 font-black text-xs shadow-xs transition-all cursor-pointer"
                title={`Navigate to previous week (Week ${startWeekIndex})`}
              >
                <ChevronLeft className="w-4 h-4 stroke-[3]" />
                <span>Prev Week</span>
              </button>
            ) : (
              <div
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-neutral-100 border border-neutral-200 text-neutral-400 font-bold text-xs select-none"
                title="Currently viewing from Week 1"
              >
                <ChevronLeft className="w-4 h-4 stroke-[2]" />
                <span>Prev (At W1)</span>
              </div>
            )}

            {/* Quick jump pills */}
            <div className="flex items-center gap-1 p-1 bg-neutral-200/70 rounded-xl overflow-x-auto max-w-[340px] sm:max-w-none">
              <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 px-1.5 hidden sm:inline">
                Jump:
              </span>
              {matrixPlans.slice(0, totalWeeksView).map((w, idx) => {
                const isDeload = isDeloadWeek(w.weekNumber);
                const isPeak = w.weekNumber === 12;
                const isVisibleInWindow = viewMode === "all" || (idx >= startWeekIndex && idx < startWeekIndex + windowSize);

                return (
                  <button
                    key={w.weekNumber}
                    type="button"
                    onClick={() => handleJumpToWeek(w.weekNumber)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-black transition-all flex items-center gap-0.5 cursor-pointer ${
                      isVisibleInWindow
                        ? "bg-[#AD314D] text-white shadow-xs ring-1 ring-rose-600"
                        : "bg-white/80 text-[#444444] hover:bg-white hover:text-[#111111] border border-black/[0.04]"
                    }`}
                    title={`Jump carousel to Week ${w.weekNumber}${isDeload ? " (Deload)" : isPeak ? " (Peak Overload)" : ""}`}
                  >
                    <span>W{w.weekNumber}</span>
                    {isDeload && <span className="text-[9px]">🧘</span>}
                    {isPeak && <span className="text-[9px]">🔥</span>}
                  </button>
                );
              })}
            </div>

            {startWeekIndex < maxStartWeekIndex && viewMode !== "all" ? (
              <button
                type="button"
                onClick={handleNextWeeks}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-[#AD314D] hover:bg-[#8E263E] text-white font-black text-xs shadow-xs transition-all cursor-pointer"
                title={`Advance to next week`}
              >
                <span>Next Week</span>
                <ChevronRight className="w-4 h-4 stroke-[3]" />
              </button>
            ) : (
              <div
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-neutral-100 border border-neutral-200 text-neutral-400 font-bold text-xs select-none"
                title="Reached the final planned week"
              >
                <span>End (W{totalWeeksView})</span>
                <ChevronRight className="w-4 h-4 stroke-[2]" />
              </div>
            )}
          </div>

          {/* Right: Zoom Toggle, Mobile Layout Switcher & Desktop 3-Week Controls */}
          <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
            {/* Readability Zoom Toggle */}
            <button
              type="button"
              onClick={toggleZoom}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                isZoomed
                  ? "bg-amber-100 text-amber-950 border-amber-300 shadow-xs ring-1 ring-amber-400"
                  : "bg-white text-[#444444] hover:bg-neutral-100 border-black/[0.08]"
              }`}
              title="Toggle enlarged high-contrast text and touch targets for gym workouts"
            >
              {isZoomed ? (
                <ZoomOut className="w-3.5 h-3.5 text-amber-700" />
              ) : (
                <ZoomIn className="w-3.5 h-3.5 text-[#AD314D]" />
              )}
              <span className="font-extrabold">{isZoomed ? "Zoom: 125%" : "Zoom: 100%"}</span>
            </button>

            {/* Mobile View Toggle (Single Week Vertical vs Wide Grid) */}
            <div className="flex md:hidden items-center p-0.5 rounded-xl bg-neutral-200/80 border border-black/[0.06] text-xs font-bold">
              <button
                type="button"
                onClick={() => setMobileViewMode("vertical")}
                className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                  mobileViewMode === "vertical"
                    ? "bg-white text-[#111111] shadow-xs font-black"
                    : "text-[#666666] hover:text-[#111111]"
                }`}
                title="Single-week vertical view optimized for phone screens"
              >
                📱 1-Wk
              </button>
              <button
                type="button"
                onClick={() => setMobileViewMode("grid")}
                className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                  mobileViewMode === "grid"
                    ? "bg-white text-[#111111] shadow-xs font-black"
                    : "text-[#666666] hover:text-[#111111]"
                }`}
                title="Full horizontal table view"
              >
                📊 Grid
              </button>
            </div>

            <span className="text-xs text-[#555555] hidden md:inline font-bold">
              {viewMode === "3weeks"
                ? `Showing Weeks ${startWeekIndex + 1} – ${Math.min(totalWeeksView, startWeekIndex + 3)} of ${totalWeeksView}`
                : `Showing all ${totalWeeksView} weeks`}
            </span>

            <div className="hidden md:flex items-center gap-2">
              {/* Jump to Actual Current Week */}
              <button
                type="button"
                onClick={handleJumpToCurrentWeek}
                className={`px-2.5 py-1 rounded-xl text-xs font-black transition-all flex items-center gap-1 cursor-pointer ${
                  startWeekIndex <= detectedActualWeekNumber - 1 && detectedActualWeekNumber - 1 < startWeekIndex + windowSize
                    ? "bg-rose-100/70 border border-[#AD314D]/30 text-[#AD314D]"
                    : "bg-white border border-[#AD314D] text-[#AD314D] hover:bg-rose-50 shadow-2xs"
                }`}
                title={`Center on current active calendar week (Week ${detectedActualWeekNumber})`}
              >
                <span>🎯 Current (W{detectedActualWeekNumber})</span>
              </button>

              {/* Excel Jump Week Dropdown */}
              <div className="flex items-center gap-1.5 bg-white px-2.5 py-1 rounded-xl border border-black/[0.12] shadow-xs">
                <span className="text-[10px] font-black uppercase tracking-wider text-[#AD314D]">Excel Jump:</span>
                <select
                  value={startWeekIndex + 1}
                  onChange={(e) => handleJumpToWeek(Number(e.target.value))}
                  className="text-xs font-black text-[#222222] bg-transparent outline-none cursor-pointer"
                >
                  {matrixPlans.slice(0, totalWeeksView).map((w) => {
                    const loggedCount = workouts.filter(
                      (wo) => wo.weekNumber === w.weekNumber || wo.dayKey?.startsWith(`w${w.weekNumber}-`)
                    ).length;
                    return (
                      <option key={w.weekNumber} value={w.weekNumber}>
                        Week {w.weekNumber} {isDeloadWeek(w.weekNumber) ? "(Deload)" : ""} {loggedCount > 0 ? `(${loggedCount} logged)` : ""}
                      </option>
                    );
                  })}
                </select>
              </div>

              {/* View Mode Segmented Control */}
              <div className="flex items-center p-0.5 rounded-xl bg-neutral-200/70 border border-black/[0.06] text-xs font-bold">
                <button
                  type="button"
                  onClick={() => {
                    setViewMode("2weeks");
                    if (tableContainerRef.current) {
                      tableContainerRef.current.scrollTo({ left: 0, behavior: "smooth" });
                    }
                  }}
                  className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                    viewMode === "2weeks"
                      ? "bg-white text-[#222222] shadow-xs font-black"
                      : "text-[#666666] hover:text-[#222222]"
                  }`}
                  title="Show 2 weeks side-by-side with maximum spreadsheet breathing room"
                >
                  🔍 2-Wk Focus
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setViewMode("3weeks");
                    if (tableContainerRef.current) {
                      tableContainerRef.current.scrollTo({ left: 0, behavior: "smooth" });
                    }
                  }}
                  className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                    viewMode === "3weeks"
                      ? "bg-white text-[#222222] shadow-xs font-black"
                      : "text-[#666666] hover:text-[#222222]"
                  }`}
                  title="Show 3 weeks side-by-side"
                >
                  🔍 3-Wk
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("all")}
                  className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                    viewMode === "all"
                      ? "bg-white text-[#222222] shadow-xs font-black"
                      : "text-[#666666] hover:text-[#222222]"
                  }`}
                  title="View all weeks side-by-side"
                >
                  ↔ All
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* MOBILE SINGLE-WEEK VERTICAL SCROLL LAYOUT (Default on Mobile devices) */}
        {/* ========================================================================= */}
        {mobileViewMode === "vertical" && (() => {
          const activeMobileWeek = matrixPlans.find((w) => w.weekNumber === mobileSelectedWeek) || matrixPlans[0];
          const isDeload = isDeloadWeek(mobileSelectedWeek, activeMobileWeek);
          const isPeakOverload = mobileSelectedWeek === 12;
          const mondayDate = computeDateForDay(cycleStartDate, mobileSelectedWeek, "Monday");
          const sundayDate = computeDateForDay(cycleStartDate, mobileSelectedWeek, "Sunday");

          return (
            <div className="block md:hidden p-3 sm:p-4 space-y-4 bg-[#F7F7F6]/60 border-b border-black/[0.06]">
              {/* Mobile Week Navigation Card */}
              <div className="p-3.5 rounded-2xl bg-white border border-black/[0.08] shadow-xs space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const newWk = Math.max(1, mobileSelectedWeek - 1);
                      setMobileSelectedWeek(newWk);
                      handleJumpToWeek(newWk);
                    }}
                    disabled={mobileSelectedWeek <= 1}
                    className={`flex items-center gap-1 px-3 py-1.5 rounded-xl font-bold text-xs transition-all ${
                      mobileSelectedWeek <= 1
                        ? "bg-neutral-100 text-neutral-400 border border-neutral-200 cursor-not-allowed"
                        : "bg-white text-[#AD314D] border border-rose-200 hover:bg-rose-50 cursor-pointer shadow-2xs"
                    }`}
                  >
                    <ChevronLeft className="w-4 h-4" />
                    <span>Prev</span>
                  </button>

                  <div className="text-center min-w-0">
                    <div className="flex items-center justify-center gap-1.5">
                      <span className={`font-black text-[#111111] ${isZoomed ? "text-lg" : "text-base"}`}>
                        Week {mobileSelectedWeek}
                      </span>
                      {matrixPlans.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleDeleteWeek(mobileSelectedWeek)}
                          className="p-1 rounded-lg text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                          title={`Delete Week ${mobileSelectedWeek}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleToggleDeloadWeek(mobileSelectedWeek)}
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full border cursor-pointer transition-colors ${
                          isDeload
                            ? "bg-amber-100 text-amber-900 border-amber-300 hover:bg-amber-200 shadow-2xs"
                            : "bg-neutral-100 text-neutral-600 border-black/[0.08] hover:bg-amber-50 hover:text-amber-800"
                        }`}
                        title={isDeload ? "Click to convert to standard Training week" : "Click to set as Deload week"}
                      >
                        {isDeload ? "Deload 🧘" : "+ Deload"}
                      </button>
                      {isPeakOverload && (
                        <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-rose-100 text-rose-900 border border-rose-300">
                          Peak 🔥
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-neutral-500 font-medium truncate mt-0.5">
                      {activeMobileWeek?.weekTheme || (isDeload ? "Deload & Recovery Week" : `Training Phase ${mobileSelectedWeek}`)}
                    </div>
                    <div className="text-[11px] text-neutral-600 font-semibold flex items-center justify-center gap-1 mt-0.5">
                      <Calendar className="w-3 h-3 text-[#AD314D]" />
                      <span>{formatFriendlyDate(mondayDate)} – {formatFriendlyDate(sundayDate)}</span>
                    </div>
                    {mobileSelectedWeek !== detectedActualWeekNumber && (
                      <div className="mt-1 flex justify-center">
                        <button
                          type="button"
                          onClick={handleJumpToCurrentWeek}
                          className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-rose-50 border border-[#AD314D]/40 text-[#AD314D] text-[11px] font-black hover:bg-rose-100 transition-all cursor-pointer shadow-2xs"
                        >
                          <span>🎯 Jump to Current (Week {detectedActualWeekNumber})</span>
                        </button>
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      const newWk = Math.min(totalWeeksView, mobileSelectedWeek + 1);
                      setMobileSelectedWeek(newWk);
                      handleJumpToWeek(newWk);
                    }}
                    disabled={mobileSelectedWeek >= totalWeeksView}
                    className={`flex items-center gap-1 px-3 py-1.5 rounded-xl font-bold text-xs transition-all ${
                      mobileSelectedWeek >= totalWeeksView
                        ? "bg-neutral-100 text-neutral-400 border border-neutral-200 cursor-not-allowed"
                        : "bg-[#AD314D] text-white hover:bg-[#92263F] cursor-pointer shadow-2xs"
                    }`}
                  >
                    <span>Next</span>
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>

                {/* Horizontal Scrollable Quick Jump Pills */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 pt-0.5">
                  {matrixPlans.slice(0, totalWeeksView).map((w) => {
                    const isWkDeload = isDeloadWeek(w.weekNumber);
                    const isWkPeak = w.weekNumber === 12;
                    const isCurrent = w.weekNumber === mobileSelectedWeek;
                    const isActual = w.weekNumber === detectedActualWeekNumber;
                    const loggedCount = workouts.filter(
                      (wo) => wo.weekNumber === w.weekNumber || wo.dayKey?.startsWith(`w${w.weekNumber}-`)
                    ).length;

                    return (
                      <button
                        key={w.weekNumber}
                        type="button"
                        onClick={() => {
                          setMobileSelectedWeek(w.weekNumber);
                          handleJumpToWeek(w.weekNumber);
                        }}
                        className={`px-3 py-1 rounded-xl text-xs font-black transition-all flex items-center gap-1 shrink-0 cursor-pointer ${
                          isCurrent
                            ? "bg-[#AD314D] text-white shadow-xs ring-2 ring-rose-500"
                            : isActual
                            ? "bg-rose-50 text-[#AD314D] border-2 border-[#AD314D]/40 font-black"
                            : "bg-neutral-100 text-[#444444] hover:bg-neutral-200 border border-black/[0.05]"
                        }`}
                      >
                        <span>W{w.weekNumber}</span>
                        {loggedCount > 0 && (
                          <span className={`text-[10px] font-bold ${isCurrent ? "text-white/90" : "text-emerald-700"}`}>
                            ({loggedCount}✓)
                          </span>
                        )}
                        {isActual && !isCurrent && <span className="text-[9px] text-[#AD314D]">★</span>}
                        {isWkDeload && <span className="text-[9px]">🧘</span>}
                        {isWkPeak && <span className="text-[9px]">🔥</span>}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 7 Days of the Week Stacked Vertically */}
              <div className="space-y-3.5">
                {DAYS_OF_WEEK.map((day) => {
                  const dayCell = activeMobileWeek?.days?.[day];
                  const cellDate = getCellDate(mobileSelectedWeek, day, dayCell);
                  const completedWorkout = getCompletedSessionForCell(mobileSelectedWeek, day);
                  const isQuickAddingHere =
                    activeQuickAddCell?.weekNumber === mobileSelectedWeek &&
                    activeQuickAddCell?.day === day;
                  const isEditingDateThisCell = editingCellDateKey === `mobile-w${mobileSelectedWeek}-${day}`;
                  const isDaySelected = selectedCell.weekNumber === mobileSelectedWeek && selectedCell.day === day;

                  return (
                    <div
                      key={day}
                      className={`rounded-2xl bg-white border transition-all shadow-xs ${
                        isZoomed ? "p-4 sm:p-5 space-y-3.5" : "p-3.5 sm:p-4 space-y-2.5"
                      } ${
                        isDaySelected
                          ? "border-[#AD314D] ring-2 ring-[#AD314D]/20"
                          : "border-black/[0.08]"
                      } ${dayCell?.isRestDay ? "bg-neutral-50/70" : "bg-white"}`}
                    >
                      {/* Day Header Row */}
                      <div className="flex items-center justify-between gap-2 pb-2 border-b border-black/[0.06] flex-wrap">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <Calendar className="w-4 h-4 text-[#AD314D] shrink-0" />
                            <span className={`font-black text-[#111111] ${isZoomed ? "text-base sm:text-lg" : "text-sm sm:text-base"}`}>
                              {day}
                            </span>
                          </div>

                          {/* Editable Date Badge */}
                          <div className="relative">
                            {!isEditingDateThisCell ? (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditingCellDateKey(`mobile-w${mobileSelectedWeek}-${day}`);
                                }}
                                className={`font-bold text-neutral-600 bg-neutral-100 hover:bg-rose-50 px-2 py-0.5 rounded-lg border border-black/[0.06] flex items-center gap-1 transition-colors ${
                                  isZoomed ? "text-xs" : "text-[11px]"
                                }`}
                              >
                                <Calendar className="w-3 h-3 text-[#AD314D]" />
                                <span>{formatFriendlyDate(cellDate)}</span>
                              </button>
                            ) : (
                              <div
                                onClick={(e) => e.stopPropagation()}
                                className="absolute left-0 top-0 flex items-center gap-1 bg-white p-1.5 rounded-xl shadow-xl border border-neutral-300 z-30"
                              >
                                <input
                                  type="date"
                                  defaultValue={cellDate}
                                  onChange={(e) => {
                                    handleCellDateChange(mobileSelectedWeek, day, e.target.value);
                                    setEditingCellDateKey(null);
                                  }}
                                  className="text-xs font-black text-[#222222] outline-none cursor-pointer"
                                  autoFocus
                                />
                                <button
                                  type="button"
                                  onClick={() => setEditingCellDateKey(null)}
                                  className="text-neutral-400 hover:text-neutral-700 text-xs px-1 font-bold"
                                >
                                  ✕
                                </button>
                              </div>
                            )}
                          </div>

                          {dayCell?.gymName && (
                            <span
                              className={`font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-lg border border-indigo-200/80 flex items-center gap-1 shrink-0 ${
                                isZoomed ? "text-xs" : "text-[11px]"
                              }`}
                              title={`Training Gym: ${dayCell.gymName}`}
                            >
                              <Building2 className="w-3 h-3 text-indigo-600" />
                              <span className="max-w-[120px] truncate">{dayCell.gymName}</span>
                            </span>
                          )}

                          {(completedWorkout || isCellCompleted(mobileSelectedWeek, day)) && (
                            <span className="text-[10px] font-black text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full flex items-center gap-1 shrink-0">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                              <span>{completedWorkout ? "Logged" : "Completed"}</span>
                            </span>
                          )}
                        </div>

                        {/* Top Action Pills */}
                        <div className="flex items-center gap-1.5 shrink-0">
                          {/* Rest / Train Toggle */}
                          <button
                            type="button"
                            onClick={() => handleCellToggleRestDay(mobileSelectedWeek, day)}
                            className={`font-black px-2.5 py-1 rounded-xl border transition-all ${
                              isZoomed ? "text-xs min-h-[36px]" : "text-[11px]"
                            } ${
                              dayCell?.isRestDay
                                ? "bg-amber-100 text-amber-900 border-amber-300"
                                : "bg-neutral-100 text-neutral-700 border-black/[0.08] hover:bg-neutral-200"
                            }`}
                          >
                            {dayCell?.isRestDay ? "Rest 🧘" : "Train 💪"}
                          </button>

                          {/* Quick Add Ex Button */}
                          {!dayCell?.isRestDay && (
                            <button
                              type="button"
                              onClick={() => {
                                setActiveQuickAddCell(
                                  isQuickAddingHere ? null : { weekNumber: mobileSelectedWeek, day }
                                );
                              }}
                              className={`font-black text-[#AD314D] bg-rose-50 hover:bg-rose-100 px-2.5 py-1 rounded-xl border border-rose-200 shadow-2xs flex items-center gap-1 ${
                                isZoomed ? "text-xs min-h-[36px]" : "text-[11px]"
                              }`}
                            >
                              <Plus className="w-3.5 h-3.5" />
                              <span>Ex</span>
                            </button>
                          )}

                          {/* Full Inspector Modal */}
                          <button
                            type="button"
                            onClick={() => handleSelectCell(mobileSelectedWeek, day, true)}
                            className="p-1.5 rounded-xl text-neutral-500 hover:text-[#AD314D] hover:bg-neutral-100 transition-colors cursor-pointer"
                            title="Open full inspector modal"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      {/* MODE 1: PLANNED ROUTINE */}
                      {gridMode === "plan" && (
                        <>
                          {dayCell?.isRestDay ? (
                            <div className="py-4 px-4 rounded-2xl bg-neutral-100/70 border border-black/[0.04] text-center space-y-2">
                              <span className={`font-black text-[#444444] block ${isZoomed ? "text-base" : "text-sm"}`}>
                                Rest & Active Recovery Day 🧘
                              </span>
                              <p className={`text-neutral-500 ${isZoomed ? "text-xs" : "text-[11px]"}`}>
                                Optimize sleep, hydrate, and do light mobility work to recover for your next session.
                              </p>
                              <button
                                type="button"
                                onClick={() => handleCellToggleRestDay(mobileSelectedWeek, day)}
                                className="mt-1 text-xs font-black text-[#AD314D] hover:underline cursor-pointer"
                              >
                                + Convert to Training Day
                              </button>
                            </div>
                          ) : (
                            <div className="space-y-3">
                              {/* Workout Title & Muscle Focus */}
                              <div className="flex items-center justify-between gap-2">
                                <div className="min-w-0">
                                  <h4 className={`font-black text-[#111111] truncate ${isZoomed ? "text-base" : "text-sm"}`}>
                                    {dayCell?.workoutTitle || `${day} Session`}
                                  </h4>
                                  {dayCell?.targetMuscleGroup && (
                                    <span className="text-[10px] font-bold text-neutral-500">
                                      Focus: {dayCell.targetMuscleGroup}
                                    </span>
                                  )}
                                </div>
                                <span className={`font-black text-neutral-400 ${isZoomed ? "text-xs" : "text-[11px]"}`}>
                                  {dayCell?.exercises?.length || 0} exercises
                                </span>
                              </div>

                              {/* Exercises List */}
                              {(!dayCell?.exercises || dayCell.exercises.length === 0) ? (
                                <div className="py-3 px-3 rounded-xl bg-neutral-50 border border-dashed border-neutral-300 text-center">
                                  <p className="text-xs text-neutral-500 font-semibold mb-2">No exercises added yet.</p>
                                  <button
                                    type="button"
                                    onClick={() => setActiveQuickAddCell({ weekNumber: mobileSelectedWeek, day })}
                                    className="px-3 py-1 rounded-xl bg-rose-50 text-[#AD314D] font-bold text-xs border border-rose-200"
                                  >
                                    + Add Exercise
                                  </button>
                                </div>
                              ) : (
                                <div className="space-y-2">
                                  {completedWorkout && (
                                    <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs flex items-center justify-between">
                                      <span className="font-extrabold text-emerald-950 flex items-center gap-1.5">
                                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                                        <span>Completed Facts Logged ({completedWorkout.date})</span>
                                      </span>
                                      <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100/80 px-2 py-0.5 rounded-md">
                                        {completedWorkout.exercises?.length || 0} exercises
                                      </span>
                                    </div>
                                  )}

                                  {dayCell.exercises.map((ex, exIdx) => {
                                    const weightStep = (ex.targetWeight || 0) >= 50 ? 2.5 : 1.25;
                                    const actualEx = completedWorkout?.exercises?.find((e) => isSameExercise(e.exerciseName, ex.exerciseName));

                                    return (
                                      <div
                                        key={exIdx}
                                        className={`rounded-2xl border shadow-2xs transition-all ${
                                          actualEx && actualEx.sets && actualEx.sets.length > 0
                                            ? "bg-emerald-50/40 border-emerald-300 hover:border-emerald-500"
                                            : "bg-neutral-50/90 border-black/[0.08] hover:border-[#AD314D]/40"
                                        } ${isZoomed ? "p-3.5 space-y-2.5" : "p-3 space-y-1.5"}`}
                                      >
                                        {/* Exercise Header */}
                                        <div className="flex items-center justify-between gap-1">
                                          <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                                            <span className={`font-black text-[#111111] truncate ${isZoomed ? "text-base" : "text-xs sm:text-sm"}`}>
                                              {ex.exerciseName}
                                            </span>
                                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-white text-[#666666] border border-black/[0.05] shrink-0">
                                              {ex.muscleGroup}
                                            </span>
                                            {ex.machineName && (
                                              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200/80 shrink-0" title={`Selected Machine: ${ex.machineName}`}>
                                                ⚙️ {ex.machineName}
                                              </span>
                                            )}
                                            {actualEx && actualEx.sets && actualEx.sets.length > 0 && (
                                              <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-300 shrink-0 flex items-center gap-0.5">
                                                <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600" /> Completed Fact
                                              </span>
                                            )}
                                          </div>
                                          <button
                                            type="button"
                                            onClick={() => handleCellDeleteExercise(mobileSelectedWeek, day, exIdx)}
                                            className="text-neutral-400 hover:text-rose-600 p-1.5 rounded transition-colors"
                                            title="Remove exercise"
                                          >
                                            <Trash2 className="w-3.5 h-3.5" />
                                          </button>
                                        </div>

                                        {/* Cues / warmup note if present */}
                                        {ex.notes && (
                                          <p className="text-[10px] text-neutral-500 italic bg-white/80 p-1 rounded-lg border border-black/[0.03]">
                                            💡 {ex.notes}
                                          </p>
                                        )}

                                        {/* Actual Completed Sets Pills if available */}
                                        {actualEx && actualEx.sets && actualEx.sets.length > 0 ? (
                                          <div className="space-y-1.5 pt-1 border-t border-emerald-200/80">
                                            <div className="flex items-center justify-between text-[11px]">
                                              <span className="font-extrabold text-emerald-950">
                                                Actual Done: {actualEx.sets[0]?.weight ?? ex.targetWeight} {unit}
                                                {ex.targetWeight && ex.targetWeight !== actualEx.sets[0]?.weight && (
                                                  <span className="text-neutral-500 font-normal ml-1">(Plan: {ex.targetWeight}{unit})</span>
                                                )}
                                              </span>
                                              <span className="text-[10px] font-bold text-emerald-700">
                                                {actualEx.sets.length} sets logged
                                              </span>
                                            </div>
                                            <div className="flex flex-wrap gap-1">
                                              {actualEx.sets.map((s, si) => (
                                                <div
                                                  key={si}
                                                  className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-emerald-100/90 text-emerald-950 font-black border border-emerald-300 text-xs shadow-2xs"
                                                >
                                                  <span className="text-emerald-700 text-[10px]">S{s.setNumber}:</span>
                                                  <span className="font-black text-emerald-950">{s.weight}kg</span>
                                                  <span className="text-emerald-600 font-semibold">×</span>
                                                  <span className="font-black text-emerald-950">{s.reps}</span>
                                                  <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600 ml-0.5" />
                                                </div>
                                              ))}
                                            </div>
                                          </div>
                                        ) : (
                                          /* Sets, Reps & Weight Stepper Row for planned exercise */
                                          <div className="flex items-center justify-between gap-2 pt-1 border-t border-black/[0.04] flex-wrap">
                                            <div className={`font-bold text-neutral-700 ${isZoomed ? "text-xs" : "text-[11px]"}`}>
                                              <span className="font-extrabold text-[#111111]">{ex.targetSets}</span> sets ×{" "}
                                              <span className="font-extrabold text-[#111111]">{ex.targetReps}</span> reps
                                            </div>

                                            {/* Weight stepper with quick +/- */}
                                            <div className="flex items-center gap-1 bg-white px-2 py-1 rounded-xl border border-black/[0.08] shadow-2xs">
                                              <button
                                                type="button"
                                                onClick={() => handleCellStepWeight(mobileSelectedWeek, day, exIdx, -weightStep)}
                                                className="w-6 h-6 rounded-lg bg-neutral-100 hover:bg-neutral-200 text-[#222222] font-black text-xs flex items-center justify-center transition-colors cursor-pointer"
                                                title={`Decrease by ${weightStep}${unit}`}
                                              >
                                                -
                                              </button>
                                              <div className="flex items-baseline gap-0.5 px-1">
                                                <input
                                                  type="number"
                                                  value={ex.targetWeight ?? ""}
                                                  onChange={(e) => {
                                                    const val = e.target.value === "" ? 0 : Number(e.target.value);
                                                    handleCellUpdateExercise(mobileSelectedWeek, day, exIdx, { targetWeight: val });
                                                  }}
                                                  className={`w-14 text-center font-black text-[#111111] bg-transparent outline-none ${
                                                    isZoomed ? "text-sm" : "text-xs"
                                                  }`}
                                                  step={weightStep}
                                                />
                                                <span className="text-[10px] font-bold text-neutral-500">{unit}</span>
                                              </div>
                                              <button
                                                type="button"
                                                onClick={() => handleCellStepWeight(mobileSelectedWeek, day, exIdx, weightStep)}
                                                className="w-6 h-6 rounded-lg bg-rose-50 hover:bg-rose-100 text-[#AD314D] font-black text-xs flex items-center justify-center transition-colors cursor-pointer"
                                                title={`Increase by ${weightStep}${unit}`}
                                              >
                                                +
                                              </button>
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}

                                  {/* Extra logged exercises if present */}
                                  {completedWorkout && completedWorkout.exercises && (
                                    completedWorkout.exercises
                                      .filter((cEx) => !dayCell.exercises?.some((pEx) => isSameExercise(pEx.exerciseName, cEx.exerciseName)))
                                      .map((extraEx, extraIdx) => (
                                        <div key={`extra-${extraIdx}`} className="p-3 rounded-2xl bg-emerald-50/70 border border-emerald-200 shadow-2xs space-y-1.5">
                                          <div className="flex items-center justify-between">
                                            <span className="text-xs font-black text-emerald-950 truncate flex items-center gap-1">
                                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> + {extraEx.exerciseName}
                                            </span>
                                            <span className="text-[9px] font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded">Extra Logged</span>
                                          </div>
                                          <div className="flex flex-wrap gap-1">
                                            {extraEx.sets.map((s, si) => (
                                              <span key={si} className="text-xs bg-white text-emerald-950 font-bold px-2 py-0.5 rounded-md border border-emerald-200">
                                                S{s.setNumber}: {s.weight}kg × {s.reps}
                                              </span>
                                            ))}
                                          </div>
                                        </div>
                                      ))
                                  )}
                                </div>
                              )}

                              {/* Quick Add Form in Card (if active) */}
                              {isQuickAddingHere && (
                                <div className="p-3 bg-white rounded-2xl border-2 border-[#AD314D]/40 shadow-md space-y-2.5 animate-in fade-in-50">
                                  <div className="flex items-center justify-between">
                                    <span className="text-xs font-black text-[#AD314D] flex items-center gap-1">
                                      <Plus className="w-3.5 h-3.5" /> Add Exercise to {day}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => setActiveQuickAddCell(null)}
                                      className="text-neutral-400 hover:text-neutral-700 text-xs font-bold"
                                    >
                                      ✕
                                    </button>
                                  </div>

                                  <div>
                                    <input
                                      type="text"
                                      value={cellQuickAddName}
                                      onChange={(e) => setCellQuickAddName(e.target.value)}
                                      placeholder="Exercise name (e.g., Incline Dumbbell Press)"
                                      className="w-full px-2.5 py-1.5 rounded-xl border border-neutral-300 text-xs font-bold text-[#111111] outline-none focus:border-[#AD314D]"
                                      list={`mobile-catalog-options-${mobileSelectedWeek}-${day}`}
                                    />
                                    <datalist id={`mobile-catalog-options-${mobileSelectedWeek}-${day}`}>
                                      {catalogExercises.slice(0, 30).map((c) => (
                                        <option key={c.id} value={c.name} />
                                      ))}
                                    </datalist>
                                  </div>

                                  <div className="grid grid-cols-3 gap-2">
                                    <div>
                                      <label className="text-[10px] font-bold text-neutral-500 block mb-0.5">Weight ({unit})</label>
                                      <input
                                        type="number"
                                        value={cellQuickAddWeight}
                                        onChange={(e) => setCellQuickAddWeight(e.target.value === "" ? "" : Number(e.target.value))}
                                        className="w-full px-2 py-1 rounded-xl border border-neutral-300 text-xs font-bold text-center"
                                        placeholder="0"
                                      />
                                    </div>
                                    <div>
                                      <label className="text-[10px] font-bold text-neutral-500 block mb-0.5">Sets</label>
                                      <input
                                        type="number"
                                        value={cellQuickAddSets}
                                        onChange={(e) => setCellQuickAddSets(Math.max(1, Number(e.target.value)))}
                                        className="w-full px-2 py-1 rounded-xl border border-neutral-300 text-xs font-bold text-center"
                                        min={1}
                                        max={10}
                                      />
                                    </div>
                                    <div>
                                      <label className="text-[10px] font-bold text-neutral-500 block mb-0.5">Reps</label>
                                      <input
                                        type="text"
                                        value={cellQuickAddReps}
                                        onChange={(e) => setCellQuickAddReps(e.target.value)}
                                        className="w-full px-2 py-1 rounded-xl border border-neutral-300 text-xs font-bold text-center"
                                        placeholder="8-12"
                                      />
                                    </div>
                                  </div>

                                  <div className="flex items-center gap-2 pt-1">
                                    <button
                                      type="button"
                                      onClick={() => handleCellQuickAdd(mobileSelectedWeek, day)}
                                      className="flex-1 py-1.5 px-3 rounded-xl bg-[#AD314D] text-white font-black text-xs shadow-xs hover:bg-[#92263F]"
                                    >
                                      Add to {day}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setActiveQuickAddCell(null)}
                                      className="py-1.5 px-3 rounded-xl bg-neutral-100 text-neutral-600 font-bold text-xs hover:bg-neutral-200"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                </div>
                              )}

                              {/* Start Workout Button */}
                              {dayCell?.exercises && dayCell.exercises.length > 0 && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    handleSelectCell(mobileSelectedWeek, day, false);
                                    if (onStartSession && dayCell) {
                                      onStartSession(dayCell);
                                    } else if (onStartWorkout && dayCell) {
                                      const plan: WorkoutPlan = {
                                        id: `matrix-${mobileSelectedWeek}-${day}-${Date.now()}`,
                                        name: `Week ${mobileSelectedWeek} - ${day} (${dayCell.workoutTitle})`,
                                        targetMuscleGroup: dayCell.targetMuscleGroup,
                                        notes: dayCell.notes,
                                        gymId: dayCell.gymId,
                                        gymName: dayCell.gymName,
                                        exercises: dayCell.exercises
                                      };
                                      onStartWorkout(plan);
                                    }
                                  }}
                                  className={`w-full py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold flex items-center justify-center gap-2 shadow-xs transition-colors cursor-pointer ${
                                    isZoomed ? "text-sm min-h-[46px]" : "text-xs min-h-[40px]"
                                  }`}
                                >
                                  <Play className="w-3.5 h-3.5 fill-current" />
                                  <span>Start {day}&apos;s Session Live</span>
                                </button>
                              )}
                            </div>
                          )}
                        </>
                      )}

                      {/* MODE 2: COMPLETED SESSIONS */}
                      {gridMode === "completed" && (
                        <div>
                          {completedWorkout ? (
                            <div className="p-3 rounded-xl bg-emerald-50/70 border border-emerald-200 space-y-2">
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-black text-emerald-900 flex items-center gap-1">
                                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                  {completedWorkout.title || "Completed Session"}
                                </span>
                                <span className="text-[10px] font-bold text-emerald-700">
                                  {completedWorkout.durationMinutes ? `${completedWorkout.durationMinutes} min` : "Done"}
                                </span>
                              </div>
                              <div className="text-[11px] text-emerald-800">
                                <strong>{completedWorkout.exercises?.length || 0}</strong> exercises logged • Total Volume:{" "}
                                <strong>
                                  {Math.round(
                                    completedWorkout.exercises?.reduce((sum, ex) => {
                                      return sum + ex.sets.reduce((sSum, s) => sSum + (s.weight || 0) * (Number(s.reps) || 0), 0);
                                    }, 0) || 0
                                  )}{unit}
                                </strong>
                              </div>
                            </div>
                          ) : (
                            <div className="p-3 rounded-xl bg-neutral-50 border border-neutral-200 text-center space-y-2">
                              <span className="text-xs font-bold text-neutral-500 block">⏳ Not yet logged</span>
                              {!dayCell?.isRestDay && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    handleSelectCell(mobileSelectedWeek, day, false);
                                    if (onStartSession && dayCell) {
                                      onStartSession(dayCell);
                                    }
                                  }}
                                  className="w-full py-2 px-3 rounded-xl bg-emerald-600 text-white font-bold text-xs"
                                >
                                  Log This Session Live
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      )}

                      {/* MODE 3: PLAN VS ACTUAL */}
                      {gridMode === "compare" && (
                        <div className="space-y-2">
                          <span className="text-xs font-bold text-neutral-600 block">Planned vs Actual Comparison</span>
                          {dayCell?.exercises?.map((ex, exIdx) => {
                            const actualEx = completedWorkout?.exercises?.find(
                              (ae) => isSameExercise(ae.exerciseName, ex.exerciseName)
                            );

                            return (
                              <div key={exIdx} className="p-2 rounded-xl bg-neutral-50 border border-neutral-200 text-xs">
                                <div className="flex items-center justify-between font-bold">
                                  <span>{ex.exerciseName}</span>
                                  <span className="text-[#AD314D]">Plan: {ex.targetWeight ?? "--"}{unit}</span>
                                </div>
                                <div className="flex items-center justify-between text-[11px] text-neutral-500 mt-1">
                                  <span>Target: {ex.targetSets}×{ex.targetReps}</span>
                                  {actualEx ? (
                                    <span className="font-bold text-emerald-700">
                                      Actual: {actualEx.sets[0]?.weight ?? "--"}{unit} ({actualEx.sets.length} sets)
                                    </span>
                                  ) : (
                                    <span className="italic text-neutral-400">Not logged</span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {/* Matrix Grid Table Container (desktop default or mobile grid toggle) */}
        <div className={mobileViewMode === "vertical" ? "hidden md:block" : "block"}>
          {/* Matrix Grid Table */}
        <div ref={tableContainerRef} className="overflow-x-auto">
          <table className={`w-full border-collapse ${viewMode !== "all" ? "table-fixed min-w-[720px] lg:min-w-0" : "min-w-[1200px]"}`}>
            <colgroup>
              <col className="w-24 sm:w-28 md:w-32" />
              {(viewMode !== "all"
                ? matrixPlans.slice(startWeekIndex, Math.min(totalWeeksView, startWeekIndex + windowSize))
                : matrixPlans.slice(0, totalWeeksView)
              ).map((week) => (
                <col
                  key={week.weekNumber}
                  style={viewMode !== "all" ? { width: `${100 / Math.max(1, Math.min(totalWeeksView - startWeekIndex, windowSize))}%` } : undefined}
                  className={viewMode === "all" ? "w-[280px]" : undefined}
                />
              ))}
            </colgroup>
            <thead>
              <tr className="border-b border-black/[0.08] bg-[#F7F7F6]">
                <th className="py-3 px-2 sm:px-3 text-left text-xs font-black text-[#222222] w-24 sm:w-28 md:w-32 uppercase tracking-wider border-r border-black/[0.08] sticky left-0 bg-[#F7F7F6] z-20 shadow-xs">
                  Day ↓
                </th>
                {(viewMode !== "all"
                  ? matrixPlans.slice(startWeekIndex, Math.min(totalWeeksView, startWeekIndex + windowSize))
                  : matrixPlans.slice(0, totalWeeksView)
                ).map((week) => {
                  const isDeload = isDeloadWeek(week.weekNumber, week);
                  const isPeakOverload = week.weekNumber === 12;

                  return (
                    <th
                      key={week.weekNumber}
                      className={`py-3 px-3 text-left font-bold text-[#222222] border-r border-black/[0.08] last:border-r-0 ${
                        viewMode === "all" ? "min-w-[280px]" : ""
                      } ${
                        isDeload
                          ? "bg-amber-50/80"
                          : isPeakOverload
                          ? "bg-rose-50/80"
                          : ""
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="text-sm sm:text-base font-black text-[#222222] whitespace-nowrap">
                            Week {week.weekNumber}
                          </span>
                          {matrixPlans.length > 1 && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteWeek(week.weekNumber);
                              }}
                              className="p-1 rounded-lg text-neutral-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                              title={`Delete Week ${week.weekNumber}`}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleToggleDeloadWeek(week.weekNumber);
                            }}
                            className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border shadow-2xs whitespace-nowrap cursor-pointer transition-colors ${
                              isDeload
                                ? "bg-amber-100 text-amber-900 border-amber-300 hover:bg-amber-200"
                                : "bg-black/[0.04] text-neutral-500 border-black/[0.08] hover:bg-amber-50 hover:text-amber-800"
                            }`}
                            title={isDeload ? "Click to convert to standard Training week" : "Click to set as Deload week"}
                          >
                            {isDeload ? "Deload 🧘" : "+ Deload"}
                          </button>
                          {isPeakOverload && (
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-900 border border-rose-300 shadow-2xs whitespace-nowrap">
                              Peak 🔥
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-black/[0.05] text-[#4A4A4A] truncate max-w-[120px]" title={week.weekTheme}>
                          {week.weekTheme || (isDeload ? "Deload Week" : `Phase ${week.weekNumber}`)}
                        </span>
                      </div>

                      {/* Week Date Span Display */}
                      <div className="flex items-center justify-between mt-1 text-xs text-neutral-600 font-medium">
                        <span className="flex items-center gap-1 font-semibold text-[11px] truncate">
                          <Calendar className="w-3 h-3 text-[#AD314D] shrink-0" />
                          <span className="truncate">
                            {formatFriendlyDate(computeDateForDay(cycleStartDate, week.weekNumber, "Monday"))} –{" "}
                            {formatFriendlyDate(computeDateForDay(cycleStartDate, week.weekNumber, "Sunday"))}
                          </span>
                        </span>
                        {isDeload && (
                          <span className="text-[10px] text-amber-900 font-bold shrink-0 hidden sm:inline">50% Vol</span>
                        )}
                        {isPeakOverload && (
                          <span className="text-[10px] text-rose-900 font-bold shrink-0 hidden sm:inline">Peak</span>
                        )}
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-black/[0.06]">
              {DAYS_OF_WEEK.map((day) => (
                <tr key={day} className="hover:bg-neutral-50/40 transition-colors">
                  {/* Day Label Sticky Left Cell */}
                  <td className="py-3 px-2 sm:px-3 align-top font-bold text-xs text-[#222222] bg-[#FAFAF9] border-r border-black/[0.08] sticky left-0 z-20 shadow-xs w-24 sm:w-28 md:w-32">
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-[#AD314D] shrink-0" />
                        <span className="font-extrabold text-xs sm:text-sm">{day}</span>
                      </div>
                      <span className="text-[10px] text-neutral-500 font-bold block">
                        {formatFriendlyDate(computeDateForDay(cycleStartDate, (viewMode !== "all" ? matrixPlans.slice(startWeekIndex, Math.min(totalWeeksView, startWeekIndex + windowSize)) : matrixPlans)[0]?.weekNumber || 1, day))}
                      </span>
                    </div>
                  </td>

                  {/* Week Cells */}
                  {(viewMode !== "all"
                    ? matrixPlans.slice(startWeekIndex, Math.min(totalWeeksView, startWeekIndex + windowSize))
                    : matrixPlans.slice(0, totalWeeksView)
                  ).map((week) => {
                    const dayCell = week.days[day];
                    const isSelected =
                      selectedCell.weekNumber === week.weekNumber &&
                      selectedCell.day === day;
                    const completedWorkout = getCompletedSessionForCell(week.weekNumber, day);
                    const isQuickAddingHere =
                      activeQuickAddCell?.weekNumber === week.weekNumber &&
                      activeQuickAddCell?.day === day;
                    const cellDate = getCellDate(week.weekNumber, day, dayCell);
                    const isEditingDateThisCell = editingCellDateKey === `w${week.weekNumber}-${day}`;

                    return (
                      <td
                        key={week.weekNumber}
                        className={`group relative py-2.5 px-2.5 align-top border-r border-black/[0.06] last:border-r-0 transition-all ${
                          viewMode === "all" ? "min-w-[280px]" : ""
                        } ${
                          isSelected
                            ? "bg-rose-50/50 ring-2 ring-inset ring-[#AD314D]"
                            : dayCell?.isRestDay
                            ? "bg-neutral-50/70 opacity-90 hover:opacity-100"
                            : "hover:bg-neutral-50/50"
                        }`}
                      >
                        {/* ========================================================= */}
                        {/* MODE 1: PLANNED ROUTINE (WITH DIRECT IN-GRID EDITING) */}
                        {/* ========================================================= */}
                        {gridMode === "plan" && (
                          <div className="space-y-2.5">
                            {/* Cell Header: Title, Date Badge, Rest Toggle & Actions */}
                            <div className="flex items-center justify-between gap-1 pb-1.5 border-b border-black/[0.06]">
                              <div className="flex items-center gap-1 min-w-0">
                                <span
                                  onClick={() => handleSelectCell(week.weekNumber, day, false)}
                                  className="text-xs sm:text-sm font-bold text-[#222222] truncate cursor-pointer hover:text-[#AD314D] max-w-[100px] sm:max-w-[130px]"
                                  title={dayCell?.workoutTitle || "Click to select"}
                                >
                                  {dayCell?.isRestDay ? "Rest & Recovery" : dayCell?.workoutTitle || "Workout"}
                                </span>
                                {(completedWorkout || isCellCompleted(week.weekNumber, day)) && (
                                  <span
                                    className="text-[9px] font-black text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded flex items-center gap-0.5 shrink-0"
                                    title={completedWorkout ? `Completed session recorded on ${completedWorkout.date}` : "Marked completed"}
                                  >
                                    <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600" /> {completedWorkout ? "Logged" : "Done"}
                                  </span>
                                )}
                                {dayCell?.gymName && (
                                  <span
                                    className="text-[9px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200/80 px-1.5 py-0.5 rounded truncate max-w-[85px] shrink-0"
                                    title={`Training Gym: ${dayCell.gymName}`}
                                  >
                                    📍 {dayCell.gymName}
                                  </span>
                                )}
                              </div>

                              <div className="flex items-center gap-1 shrink-0">
                                {/* Direct Editable Date Badge */}
                                <div className="relative">
                                  {!isEditingDateThisCell ? (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setEditingCellDateKey(`w${week.weekNumber}-${day}`);
                                      }}
                                      className="text-[10px] sm:text-[11px] font-bold text-neutral-600 hover:text-[#AD314D] bg-neutral-100 hover:bg-rose-50 px-2 py-0.5 rounded-lg border border-black/[0.06] flex items-center gap-1 transition-colors"
                                      title="Click to edit date for this session"
                                    >
                                      <Calendar className="w-3 h-3 text-[#AD314D]" />
                                      <span>{formatFriendlyDate(cellDate)}</span>
                                    </button>
                                  ) : (
                                    <div
                                      onClick={(e) => e.stopPropagation()}
                                      className="absolute right-0 top-0 flex items-center gap-1 bg-white p-1.5 rounded-xl shadow-xl border border-neutral-300 z-30"
                                    >
                                      <input
                                        type="date"
                                        defaultValue={cellDate}
                                        onChange={(e) =>
                                          handleCellDateChange(week.weekNumber, day, e.target.value)
                                        }
                                        className="text-xs font-black text-[#222222] outline-none cursor-pointer"
                                        autoFocus
                                      />
                                      <button
                                        type="button"
                                        onClick={() => setEditingCellDateKey(null)}
                                        className="text-neutral-400 hover:text-neutral-700 text-xs px-1 font-bold"
                                      >
                                        ✕
                                      </button>
                                    </div>
                                  )}
                                </div>

                                {/* Rest Day Toggle Pill */}
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleCellToggleRestDay(week.weekNumber, day);
                                  }}
                                  className={`text-[10px] font-bold px-2 py-0.5 rounded-lg border transition-all ${
                                    dayCell?.isRestDay
                                      ? "bg-amber-100 text-amber-900 border-amber-300"
                                      : "bg-neutral-100 text-neutral-600 border-black/[0.06] hover:bg-neutral-200"
                                  }`}
                                  title={dayCell?.isRestDay ? "Click to set as training day" : "Click to set as rest day"}
                                >
                                  {dayCell?.isRestDay ? "Rest" : "Train"}
                                </button>

                                {/* Direct In-Cell Quick Add Button */}
                                {!dayCell?.isRestDay && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setActiveQuickAddCell(
                                        isQuickAddingHere ? null : { weekNumber: week.weekNumber, day }
                                      );
                                    }}
                                    className="text-[10px] font-bold text-[#AD314D] bg-rose-50 hover:bg-rose-100 px-2 py-0.5 rounded-lg border border-rose-200 shadow-2xs flex items-center gap-0.5"
                                    title="Add exercise directly into this cell"
                                  >
                                    <Plus className="w-3 h-3" />
                                    <span>Ex</span>
                                  </button>
                                )}

                                {/* Open Modal Inspector */}
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleSelectCell(week.weekNumber, day, true);
                                  }}
                                  className="text-[10px] p-1.5 rounded-lg text-neutral-500 hover:text-[#AD314D] hover:bg-neutral-100"
                                  title="Open in full popup modal"
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>

                            {/* Rest Day State */}
                            {dayCell?.isRestDay ? (
                              <div className="py-3 px-3 rounded-2xl bg-neutral-100/80 border border-black/[0.04] text-center">
                                <span className="text-xs font-bold text-[#666666] block">
                                  Rest & Active Recovery 🧘
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleCellToggleRestDay(week.weekNumber, day)}
                                  className="mt-1.5 text-xs font-extrabold text-[#AD314D] hover:underline"
                                >
                                  + Convert to Workout
                                </button>
                              </div>
                            ) : (
                              /* Training Exercises List - Editable and displaying actual completed facts! */
                              <div className="space-y-2">
                                {dayCell?.exercises?.map((ex, exIdx) => {
                                  const weightStep = (ex.targetWeight || 0) >= 50 ? 2.5 : 1.25;
                                  const actualEx = completedWorkout?.exercises?.find((e) => isSameExercise(e.exerciseName, ex.exerciseName));

                                  return (
                                    <div
                                      key={exIdx}
                                      className={`p-2 rounded-2xl border shadow-2xs space-y-1.5 transition-all ${
                                        actualEx && actualEx.sets && actualEx.sets.length > 0
                                          ? "bg-emerald-50/40 border-emerald-300 hover:border-emerald-500"
                                          : "bg-white border-black/[0.08] hover:border-[#AD314D]/40"
                                      }`}
                                    >
                                      {/* Line 1: Name, Muscle, Completed Fact Tag, Delete */}
                                      <div className="flex items-center justify-between gap-1">
                                        <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                                          <span className="text-xs sm:text-sm font-extrabold text-[#111111] truncate" title={ex.exerciseName}>
                                            {ex.exerciseName}
                                          </span>
                                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-neutral-100 text-[#666666] shrink-0">
                                            {ex.muscleGroup}
                                          </span>
                                          {ex.machineName && (
                                            <span
                                              className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200/80 shrink-0"
                                              title={`Selected Machine: ${ex.machineName}`}
                                            >
                                              ⚙️ {ex.machineName}
                                            </span>
                                          )}
                                          {actualEx && actualEx.sets && actualEx.sets.length > 0 && (
                                            <span className="text-[9px] font-extrabold px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800 border border-emerald-300 shrink-0 flex items-center gap-0.5">
                                              <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600" /> Done
                                            </span>
                                          )}
                                        </div>
                                        <button
                                          type="button"
                                          onClick={() => handleCellDeleteExercise(week.weekNumber, day, exIdx)}
                                          className="text-neutral-400 hover:text-rose-600 p-1 rounded"
                                          title="Remove exercise"
                                        >
                                          <Trash2 className="w-3 h-3" />
                                        </button>
                                      </div>

                                      {/* Actual Completed Fact Display */}
                                      {actualEx && actualEx.sets && actualEx.sets.length > 0 ? (
                                        <div className="space-y-1 pt-1 border-t border-emerald-200/80">
                                          <div className="flex items-center justify-between text-[10px]">
                                            <span className="font-extrabold text-emerald-950">
                                              Fact: {actualEx.sets[0]?.weight ?? ex.targetWeight} {unit}
                                              {ex.targetWeight && ex.targetWeight !== actualEx.sets[0]?.weight && (
                                                <span className="text-neutral-500 font-normal ml-1">(Plan: {ex.targetWeight}{unit})</span>
                                              )}
                                            </span>
                                            <span className="text-[9px] font-bold text-emerald-700">
                                              {actualEx.sets.length} sets completed
                                            </span>
                                          </div>
                                          <div className="flex flex-wrap items-center gap-1">
                                            {actualEx.sets.map((s, sIdx) => (
                                              <div
                                                key={sIdx}
                                                className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-emerald-100/90 text-emerald-950 font-black border border-emerald-300 text-[11px] shadow-2xs"
                                                title={`Set ${s.setNumber}: ${s.weight}kg × ${s.reps} reps`}
                                              >
                                                <span className="text-emerald-700 text-[9px] font-bold">S{s.setNumber}:</span>
                                                <span className="font-extrabold text-emerald-950">{s.weight}kg</span>
                                                <span className="text-emerald-600 font-semibold">×</span>
                                                <span className="font-extrabold text-emerald-950">{s.reps}</span>
                                                <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600 ml-0.5 inline" />
                                              </div>
                                            ))}
                                          </div>
                                        </div>
                                      ) : (
                                        /* Line 2: Direct Interactive Inputs (Weight with Steppers + Sets & Reps) */
                                        <>
                                          <div className="flex items-center justify-between gap-2 text-xs">
                                            {/* Target Weight with Steppers */}
                                            <div className="flex items-center gap-0.5">
                                              <button
                                                type="button"
                                                onClick={() => handleCellStepWeight(week.weekNumber, day, exIdx, -weightStep)}
                                                className="px-1.5 py-0.5 rounded-md bg-neutral-100 hover:bg-neutral-200 text-[#333333] font-black text-[10px] transition-colors"
                                                title={`-${weightStep} kg`}
                                              >
                                                -{weightStep}
                                              </button>
                                              <div className="flex items-center bg-neutral-50 rounded-md border border-black/[0.08] px-1 py-0.5">
                                                <input
                                                  type="number"
                                                  step={0.5}
                                                  value={ex.targetWeight ?? ""}
                                                  onChange={(e) =>
                                                    handleCellUpdateExercise(week.weekNumber, day, exIdx, {
                                                      targetWeight: e.target.value === "" ? undefined : Number(e.target.value)
                                                    })
                                                  }
                                                  className="w-10 text-center font-black text-[#AD314D] bg-transparent outline-none text-xs"
                                                  placeholder="—"
                                                />
                                                <span className="text-[9px] font-bold text-neutral-500">kg</span>
                                              </div>
                                              <button
                                                type="button"
                                                onClick={() => handleCellStepWeight(week.weekNumber, day, exIdx, weightStep)}
                                                className="px-1.5 py-0.5 rounded-md bg-neutral-100 hover:bg-neutral-200 text-[#333333] font-black text-[10px] transition-colors"
                                                title={`+${weightStep} kg`}
                                              >
                                                +{weightStep}
                                              </button>
                                            </div>

                                            {/* Sets & Reps Direct Inputs */}
                                            <div className="flex items-center gap-0.5 shrink-0">
                                              <input
                                                type="number"
                                                min={1}
                                                max={12}
                                                value={ex.targetSets}
                                                onChange={(e) =>
                                                  handleCellUpdateExercise(week.weekNumber, day, exIdx, {
                                                    targetSets: Number(e.target.value)
                                                  })
                                                }
                                                className="w-7 text-center font-black text-[#222222] bg-neutral-100 rounded-md border border-black/[0.06] py-0.5 text-xs"
                                                title="Sets"
                                              />
                                              <span className="text-[10px] text-neutral-400 font-black">×</span>
                                              <input
                                                type="text"
                                                value={ex.targetReps}
                                                onChange={(e) =>
                                                  handleCellUpdateExercise(week.weekNumber, day, exIdx, {
                                                    targetReps: e.target.value
                                                  })
                                                }
                                                className="w-11 text-center font-black text-[#222222] bg-neutral-100 rounded-md border border-black/[0.06] py-0.5 text-xs"
                                                title="Reps target"
                                              />
                                            </div>
                                          </div>

                                          {/* Line 3: Set-by-Set Pills & Add Set Column Button */}
                                          <div className="flex flex-wrap items-center gap-1 pt-0.5">
                                            {(ex.sets && ex.sets.length > 0
                                              ? ex.sets
                                              : Array.from({ length: ex.targetSets || 3 }, (_, i) => ({
                                                  setNumber: i + 1,
                                                  weight: ex.targetWeight,
                                                  reps: ex.targetReps
                                                }))
                                            ).map((s, sIdx) => (
                                              <div
                                                key={sIdx}
                                                className="flex items-center gap-1 px-1.5 py-1 rounded-md bg-neutral-100 text-xs text-neutral-800 font-medium border border-black/[0.06] shadow-2xs"
                                                title={`Set ${s.setNumber}: ${s.weight ?? ex.targetWeight ?? "--"}kg × ${s.reps ?? ex.targetReps ?? "--"}`}
                                              >
                                                <span className="font-bold text-neutral-400">S{s.setNumber}:</span>
                                                <input
                                                  type="number"
                                                  value={s.weight ?? ""}
                                                  onChange={(e) =>
                                                    handleCellUpdateSet(
                                                      week.weekNumber,
                                                      day,
                                                      exIdx,
                                                      sIdx,
                                                      e.target.value === "" ? undefined : Number(e.target.value),
                                                      s.reps
                                                    )
                                                  }
                                                  className="w-14 text-center font-bold text-[#AD314D] bg-transparent outline-none text-xs"
                                                  placeholder="—"
                                                />
                                                <span>×</span>
                                                <input
                                                  type="text"
                                                  value={s.reps ?? ""}
                                                  onChange={(e) =>
                                                    handleCellUpdateSet(
                                                      week.weekNumber,
                                                      day,
                                                      exIdx,
                                                      sIdx,
                                                      s.weight,
                                                      e.target.value
                                                    )
                                                  }
                                                  className="w-7 text-center font-semibold text-neutral-800 bg-transparent outline-none text-xs"
                                                  placeholder="—"
                                                />
                                              </div>
                                            ))}

                                            {/* Add Set Column Button */}
                                            <button
                                              type="button"
                                              onClick={() => handleCellAddSet(week.weekNumber, day, exIdx)}
                                              className="text-[10px] font-bold text-[#AD314D] hover:bg-rose-50 px-1.5 py-0.5 rounded-md border border-dashed border-rose-300"
                                              title="Add set to this exercise only"
                                            >
                                              +Set
                                            </button>

                                            {/* Remove last set button */}
                                            {((ex.sets && ex.sets.length > 1) || (ex.targetSets && ex.targetSets > 1)) && (
                                              <button
                                                type="button"
                                                onClick={() => handleCellRemoveSet(week.weekNumber, day, exIdx)}
                                                className="text-[10px] font-bold text-neutral-400 hover:text-rose-600 hover:bg-rose-50 px-1.5 py-0.5 rounded-md border border-dashed border-neutral-200"
                                                title="Remove last set from this exercise only"
                                              >
                                                -Set
                                              </button>
                                            )}
                                          </div>
                                        </>
                                      )}
                                    </div>
                                  );
                                })}

                                {/* Extra Logged Exercises (if user performed additional exercises) */}
                                {completedWorkout && completedWorkout.exercises && (
                                  completedWorkout.exercises
                                    .filter((cEx) => !dayCell?.exercises?.some((pEx) => isSameExercise(pEx.exerciseName, cEx.exerciseName)))
                                    .map((extraEx, extraIdx) => (
                                      <div key={`extra-desk-${extraIdx}`} className="p-2 rounded-2xl bg-emerald-50/70 border border-emerald-200 shadow-2xs space-y-1">
                                        <div className="flex items-center justify-between">
                                          <span className="text-xs font-bold text-emerald-950 truncate flex items-center gap-1">
                                            <CheckCircle2 className="w-3 h-3 text-emerald-600" /> + {extraEx.exerciseName}
                                          </span>
                                          <span className="text-[9px] font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.2 rounded">Extra Logged</span>
                                        </div>
                                        <div className="flex flex-wrap gap-1">
                                          {extraEx.sets.map((s, si) => (
                                            <span key={si} className="text-[10px] bg-white text-emerald-950 font-bold px-1.5 py-0.5 rounded border border-emerald-200">
                                              S{s.setNumber}: {s.weight}kg × {s.reps}
                                            </span>
                                          ))}
                                        </div>
                                      </div>
                                    ))
                                )}

                                {(!dayCell?.exercises || dayCell.exercises.length === 0) && (!completedWorkout || !completedWorkout.exercises || completedWorkout.exercises.length === 0) && (
                                  <div className="p-2 rounded-xl bg-neutral-50 text-center text-[10px] text-neutral-400">
                                    No exercises planned yet. Click "+ Ex" to add one!
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Inline Quick-Add Drawer Inside the Cell */}
                            {isQuickAddingHere && (
                              <div className="p-2 rounded-xl bg-rose-50/90 border border-rose-200 space-y-2 text-xs">
                                <div className="flex items-center justify-between">
                                  <span className="text-[10px] font-bold text-[#AD314D]">
                                    + Add Exercise to Cell
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => setActiveQuickAddCell(null)}
                                    className="text-neutral-400 hover:text-neutral-700"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                </div>

                                <select
                                  value={cellQuickAddName}
                                  onChange={(e) => setCellQuickAddName(e.target.value)}
                                  className="w-full text-[10px] font-semibold p-1.5 rounded-lg border border-black/[0.1] bg-white"
                                >
                                  {catalogExercises.map((c) => (
                                    <option key={c.name} value={c.name}>
                                      {c.name} ({c.muscleGroup})
                                    </option>
                                  ))}
                                </select>

                                <div className="grid grid-cols-3 gap-1 text-[10px]">
                                  <div>
                                    <label className="text-[8px] text-neutral-500 font-bold block">KG</label>
                                    <input
                                      type="number"
                                      value={cellQuickAddWeight}
                                      onChange={(e) => setCellQuickAddWeight(e.target.value === "" ? "" : Number(e.target.value))}
                                      className="w-full p-1 text-center font-bold bg-white rounded border border-black/[0.08]"
                                      placeholder="—"
                                    />
                                  </div>
                                  <div>
                                    <label className="text-[8px] text-neutral-500 font-bold block">Sets</label>
                                    <input
                                      type="number"
                                      value={cellQuickAddSets}
                                      onChange={(e) => setCellQuickAddSets(Number(e.target.value))}
                                      className="w-full p-1 text-center font-bold bg-white rounded border border-black/[0.08]"
                                    />
                                  </div>
                                  <div>
                                    <label className="text-[8px] text-neutral-500 font-bold block">Reps</label>
                                    <input
                                      type="text"
                                      value={cellQuickAddReps}
                                      onChange={(e) => setCellQuickAddReps(e.target.value)}
                                      className="w-full p-1 text-center font-bold bg-white rounded border border-black/[0.08]"
                                    />
                                  </div>
                                </div>

                                <button
                                  type="button"
                                  onClick={() => handleCellQuickAdd(week.weekNumber, day)}
                                  className="w-full py-1 rounded-lg bg-[#AD314D] hover:bg-[#8C1E37] text-white font-bold text-[10px] shadow-2xs"
                                >
                                  Insert Exercise
                                </button>
                              </div>
                            )}
                          </div>
                        )}

                        {/* ========================================================= */}
                        {/* MODE 2: COMPLETED SESSIONS (FROM TRAINING DIARY) */}
                        {/* ========================================================= */}
                        {gridMode === "completed" && (
                          <div className="space-y-2">
                            {completedWorkout ? (
                              <div className="p-2 rounded-xl bg-emerald-50/80 border border-emerald-200 space-y-1.5">
                                <div className="flex items-center justify-between">
                                  <span className="text-[10px] font-extrabold text-emerald-800 flex items-center gap-1">
                                    <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                    <span>Logged {completedWorkout.date}</span>
                                  </span>
                                  <span className="text-[9px] font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.2 rounded">
                                    {completedWorkout.durationMinutes}m
                                  </span>
                                </div>

                                <p className="text-xs font-bold text-[#222222] truncate">
                                  {completedWorkout.title}
                                </p>

                                {/* Actual Exercises & Actual Sets Logged */}
                                <div className="space-y-1">
                                  {completedWorkout.exercises.map((ex, i) => (
                                    <div key={i} className="text-[10px] bg-white p-1 rounded-lg border border-emerald-100">
                                      <span className="font-bold text-[#222222] block truncate">
                                        {ex.exerciseName}
                                      </span>
                                      <div className="flex flex-wrap gap-1 text-[9px] text-emerald-800 font-semibold mt-0.5">
                                        {ex.sets.map((s, si) => (
                                          <span key={si} className="bg-emerald-50 px-1 rounded">
                                            S{s.setNumber}: {s.weight}kg×{s.reps}
                                          </span>
                                        ))}
                                      </div>
                                    </div>
                                  ))}
                                </div>

                                <div className="flex items-center justify-between pt-1 border-t border-emerald-200/60 text-[9px]">
                                  <span className="text-emerald-800 font-bold">
                                    Vol: {completedWorkout.exercises.reduce((tot, ex) => tot + ex.sets.reduce((st, s) => st + (s.weight * s.reps), 0), 0).toLocaleString()} kg
                                  </span>
                                  {onNavigateToDiary && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        onNavigateToDiary({
                                          week: week.weekNumber,
                                          day,
                                          date: cellDate
                                        })
                                      }
                                      className="text-[#AD314D] font-bold hover:underline cursor-pointer"
                                    >
                                      View Diary →
                                    </button>
                                  )}
                                </div>
                              </div>
                            ) : (
                              <div className="p-2.5 rounded-xl bg-neutral-50 border border-black/[0.05] text-center space-y-1.5">
                                <span className="text-[10px] font-bold text-neutral-500 block">
                                  ⏳ Not yet logged
                                </span>
                                <span className="text-xs font-semibold text-[#333333] block line-clamp-1">
                                  {dayCell?.isRestDay ? "Rest Day" : dayCell?.workoutTitle || "Training"}
                                </span>
                                {!dayCell?.isRestDay && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      handleSelectCell(week.weekNumber, day, false);
                                      if (onStartSession && dayCell) {
                                        onStartSession(dayCell);
                                      }
                                    }}
                                    className="w-full py-1 px-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[10px] shadow-2xs"
                                  >
                                    ▶ Log This Session Live
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        )}

                        {/* ========================================================= */}
                        {/* MODE 3: PLAN VS ACTUAL (COMPARISON) */}
                        {/* ========================================================= */}
                        {gridMode === "compare" && (
                          <div className="space-y-1.5 text-[10px]">
                            <div className="flex items-center justify-between pb-1 border-b border-black/[0.06]">
                              <span className="font-bold text-[#222222] truncate">
                                {dayCell?.workoutTitle}
                              </span>
                              {completedWorkout ? (
                                <span className="text-[8px] font-bold px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800">
                                  Done
                                </span>
                              ) : (
                                <span className="text-[8px] font-semibold px-1.5 py-0.2 rounded bg-neutral-100 text-neutral-500">
                                  Pending
                                </span>
                              )}
                            </div>

                            <div className="space-y-1">
                              {dayCell?.exercises?.map((ex, i) => {
                                const actualEx = completedWorkout?.exercises.find(
                                  (e) => isSameExercise(e.exerciseName, ex.exerciseName)
                                );

                                return (
                                  <div key={i} className="p-1 rounded-lg bg-white border border-black/[0.06] space-y-0.5">
                                    <div className="flex items-center justify-between">
                                      <span className="font-bold text-[#222222] truncate">{ex.exerciseName}</span>
                                      <span className="text-[9px] text-[#AD314D] font-bold">
                                        Plan: {ex.targetWeight ? `${ex.targetWeight}kg` : "--"}
                                      </span>
                                    </div>
                                    <div className="flex items-center justify-between text-[9px]">
                                      <span className="text-neutral-500">Target: {ex.targetSets}×{ex.targetReps}</span>
                                      {actualEx ? (
                                        <span className="font-extrabold text-emerald-700">
                                          Act: {actualEx.sets[0]?.weight}kg ({actualEx.sets.length} sets)
                                        </span>
                                      ) : (
                                        <span className="text-neutral-400 italic">No log</span>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Bottom Carousel Navigation Bar */}
        {viewMode !== "all" && (
          <div className="px-4 py-3 bg-[#F9F9F8] border-t border-black/[0.08] flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              {startWeekIndex > 0 ? (
                <button
                  type="button"
                  onClick={handlePrevWeeks}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-white border-2 border-[#AD314D] text-[#AD314D] hover:bg-rose-50 font-black text-xs shadow-xs transition-all cursor-pointer"
                  title={`Navigate to previous week (Week ${startWeekIndex})`}
                >
                  <ChevronLeft className="w-4 h-4 stroke-[3]" />
                  <span>Prev Week</span>
                </button>
              ) : (
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-neutral-100 border border-neutral-200 text-neutral-400 font-bold text-xs select-none">
                  <ChevronLeft className="w-4 h-4 stroke-[2]" />
                  <span>Prev (At W1)</span>
                </div>
              )}

              <span className="text-xs font-bold text-[#555555]">
                Weeks {startWeekIndex + 1} – {Math.min(totalWeeksView, startWeekIndex + 3)} of {totalWeeksView}
              </span>

              <button
                type="button"
                onClick={handleJumpToCurrentWeek}
                className="px-2.5 py-1 rounded-xl bg-white border border-[#AD314D] text-[#AD314D] hover:bg-rose-50 font-black text-xs shadow-2xs transition-all cursor-pointer flex items-center gap-1"
                title={`Center on current week (Week ${detectedActualWeekNumber})`}
              >
                <span>🎯 W{detectedActualWeekNumber} (Today)</span>
              </button>
            </div>

            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 p-1 bg-neutral-200/70 rounded-xl overflow-x-auto max-w-[280px] sm:max-w-none">
                {matrixPlans.slice(0, totalWeeksView).map((w, idx) => {
                  const isVisibleInWindow = idx >= startWeekIndex && idx < startWeekIndex + 3;

                  return (
                    <button
                      key={w.weekNumber}
                      type="button"
                      onClick={() => handleJumpToWeek(w.weekNumber)}
                      className={`px-2 py-1 rounded-lg text-xs font-black transition-all cursor-pointer ${
                        isVisibleInWindow
                          ? "bg-[#AD314D] text-white shadow-xs ring-1 ring-rose-600"
                          : "bg-white/80 text-[#444444] hover:bg-white hover:text-[#111111]"
                      }`}
                      title={`Jump to Week ${w.weekNumber}`}
                    >
                      W{w.weekNumber}
                    </button>
                  );
                })}
              </div>

              {startWeekIndex < maxStartWeekIndex ? (
                <button
                  type="button"
                  onClick={handleNextWeeks}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-[#AD314D] hover:bg-[#8E263E] text-white font-black text-xs shadow-xs transition-all cursor-pointer"
                  title={`Advance to next week (Week ${startWeekIndex + 2})`}
                >
                  <span>Next Week</span>
                  <ChevronRight className="w-4 h-4 stroke-[3]" />
                </button>
              ) : (
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-neutral-100 border border-neutral-200 text-neutral-400 font-bold text-xs select-none">
                  <span>End (W{totalWeeksView})</span>
                  <ChevronRight className="w-4 h-4 stroke-[2]" />
                </div>
              )}
            </div>
          </div>
        )}
        </div>
      </div>

      {/* QUICK CELL EDIT MODAL */}
      {isCellModalOpen && activeDayCell && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-3xl max-h-[92vh] bg-white rounded-3xl shadow-2xl border border-black/[0.1] overflow-hidden flex flex-col animate-in zoom-in-95">
            {/* Modal Header */}
            <div className="p-4 sm:p-5 bg-[#F7F7F6] border-b border-black/[0.08] flex items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-9 h-9 rounded-2xl bg-rose-50 border border-rose-200 text-[#AD314D] flex items-center justify-center shrink-0">
                  <Edit2 className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[11px] font-black uppercase tracking-wider text-[#AD314D] bg-rose-100/70 px-2 py-0.5 rounded-md border border-rose-200">
                      Week {selectedCell.weekNumber} • {selectedCell.day}
                    </span>
                    {/* Modal Date Picker */}
                    <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-xl bg-white border border-black/[0.1] shadow-2xs">
                      <Calendar className="w-3.5 h-3.5 text-[#AD314D]" />
                      <span className="text-xs font-bold text-neutral-600">Date:</span>
                      <input
                        type="date"
                        value={activeDayCell.date || getCellDate(selectedCell.weekNumber, selectedCell.day, activeDayCell)}
                        onChange={(e) => updateActiveDayCell((prev) => ({ ...prev, date: e.target.value }))}
                        className="text-xs font-black text-[#222222] bg-transparent outline-none cursor-pointer"
                        title="Set date for this session"
                      />
                    </div>
                    <h3 className="text-base font-bold text-[#222222] truncate">
                      {activeDayCell.workoutTitle}
                    </h3>
                  </div>
                  <p className="text-[11px] text-[#777777] truncate">
                    Directly edit date, exercises, sets, reps, target weights, and routine details
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setIsCellModalOpen(false);
                    showToast(`Saved changes for Week ${selectedCell.weekNumber} • ${selectedCell.day}`);
                  }}
                  className="flex items-center gap-1 px-4 py-2 rounded-2xl bg-[#AD314D] hover:bg-[#92263F] text-white text-xs font-bold shadow-sm transition-all"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Done Editing</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsCellModalOpen(false)}
                  className="p-2 rounded-xl text-[#777777] hover:text-[#222222] hover:bg-black/[0.05] transition-colors"
                  title="Close"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="p-5 sm:p-6 overflow-y-auto">
              {renderEditorContent(true)}
            </div>
          </div>
        </div>
      )}

      {/* INLINE CELL INSPECTOR & EDITOR (Below Table) */}
      {showDayInspector && activeDayCell && (
        <div
          ref={editorRef}
          id="matrix-day-inspector"
          className="p-5 sm:p-6 rounded-3xl bg-white border border-black/[0.08] shadow-sm space-y-5 animate-in fade-in"
        >
          {/* Header Banner explaining this is the detail inspector for the selected day */}
          <div className="flex items-center justify-between pb-3 border-b border-black/[0.06] flex-wrap gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-black uppercase tracking-wider text-[#AD314D] bg-rose-50 px-2.5 py-1 rounded-xl border border-rose-200">
                Selected Day Detail Inspector
              </span>
              <span className="text-xs text-[#666666]">
                Viewing exercises for <strong className="text-[#111111]">Week {selectedCell.weekNumber} • {selectedCell.day}</strong>
              </span>
            </div>
            <button
              type="button"
              onClick={() => setShowDayInspector(false)}
              className="flex items-center gap-1 px-3 py-1 rounded-xl bg-neutral-100 hover:bg-neutral-200 text-xs font-bold text-neutral-700 transition-colors"
              title="Close this inspector panel and return to clean matrix grid view"
            >
              <X className="w-3.5 h-3.5" />
              <span>Close Day Inspector</span>
            </button>
          </div>
          {renderEditorContent(false)}
        </div>
      )}

      {/* ========================================================================= */}
      {/* PROGRAM SWITCHER MODAL (Hypertrophy, Strength, Shred, Longevity & Custom) */}
      {/* ========================================================================= */}
      {isProgramModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-3xl bg-white rounded-3xl border border-black/[0.1] shadow-2xl overflow-hidden flex flex-col max-h-[88vh]">
            <div className="p-5 sm:p-6 border-b border-black/[0.06] flex items-center justify-between bg-[#FAF9F8]">
              <div>
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#AD314D]" />
                  <h3 className="text-lg font-bold text-[#222222]">
                    Training Program Library
                  </h3>
                </div>
                <p className="text-xs text-[#4A4A4A] mt-0.5">
                  Select a scientifically pre-planned periodized routine or launch your custom program.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsProgramModalOpen(false)}
                className="p-2 rounded-xl text-[#777777] hover:text-[#222222] hover:bg-black/[0.05]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 sm:p-6 overflow-y-auto space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {programs.map((prog) => {
                  const isActive = prog.id === currentProgram?.id;
                  return (
                    <div
                      key={prog.id}
                      className={`p-5 rounded-2xl border transition-all flex flex-col justify-between ${
                        isActive
                          ? "border-[#AD314D] bg-rose-50/20 shadow-sm ring-1 ring-[#AD314D]/30"
                          : "border-black/[0.08] bg-white hover:border-black/[0.15]"
                      }`}
                    >
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-neutral-100 text-[#4A4A4A] capitalize">
                            {prog.goal} • {prog.daysPerWeek} Days/Wk
                          </span>
                          {isActive && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#AD314D] text-white">
                              Active
                            </span>
                          )}
                        </div>
                        <h4 className="font-bold text-base text-[#222222]">
                          {prog.name}
                        </h4>
                        <p className="text-xs text-[#4A4A4A] line-clamp-2">
                          {prog.description}
                        </p>
                        <div className="pt-2 text-[11px] text-[#777777] space-y-0.5">
                          <div><strong>Target:</strong> {prog.primaryObjective}</div>
                          {prog.secondaryObjective && (
                            <div><strong>Focus:</strong> {prog.secondaryObjective}</div>
                          )}
                        </div>
                      </div>

                      <div className="mt-4 pt-3 border-t border-black/[0.04] flex items-center justify-between">
                        <span className="text-[11px] text-[#777777]">
                          {prog.totalWeeks} Weeks Periodized
                        </span>
                        <div className="flex items-center gap-2">
                          {onDeleteProgram && programs.length > 1 && (
                            confirmDeleteProgramId === prog.id ? (
                              <div className="flex items-center gap-1 animate-in fade-in">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onDeleteProgram(prog.id);
                                    setConfirmDeleteProgramId(null);
                                  }}
                                  className="px-2.5 py-1 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-bold shadow-2xs cursor-pointer"
                                >
                                  Confirm?
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setConfirmDeleteProgramId(null);
                                  }}
                                  className="px-2 py-1 rounded-xl text-[11px] font-semibold text-neutral-500 hover:text-neutral-800 cursor-pointer"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setConfirmDeleteProgramId(prog.id);
                                }}
                                className="p-1.5 rounded-xl border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 transition-colors cursor-pointer"
                                title="Delete program"
                              >
                                <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                              </button>
                            )
                          )}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenEditProgram(prog);
                            }}
                            className="px-2.5 py-1.5 rounded-xl border border-black/[0.08] hover:bg-neutral-100 text-xs font-semibold text-[#4A4A4A] flex items-center gap-1 cursor-pointer"
                            title="Edit program setup"
                          >
                            <SlidersHorizontal className="w-3 h-3 text-[#AD314D]" />
                            <span>Edit</span>
                          </button>
                          <button
                            type="button"
                            disabled={isActive}
                            onClick={() => {
                              if (onSelectProgram) onSelectProgram(prog.id);
                              setIsProgramModalOpen(false);
                              showToast(`Activated "${prog.name}"!`);
                            }}
                            className={`px-4 py-1.5 rounded-xl text-xs font-bold transition-all ${
                              isActive
                                ? "bg-neutral-200 text-neutral-500 cursor-default"
                                : "bg-[#AD314D] hover:bg-[#92263F] text-white shadow-sm"
                            }`}
                          >
                            {isActive ? "Currently Active" : "Activate Program"}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="p-4 border-t border-black/[0.06] bg-[#FAF9F8] flex items-center justify-between">
              <span className="text-xs text-[#777777]">
                Want to build your own routine from scratch?
              </span>
              <button
                type="button"
                onClick={() => {
                  setIsProgramModalOpen(false);
                  setIsCustomProgramModalOpen(true);
                }}
                className="px-4 py-2 rounded-xl bg-[#222222] text-white text-xs font-bold hover:bg-black transition-colors"
              >
                + Create Custom Program
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* CREATE CUSTOM PROGRAM MODAL (User Requested) */}
      {/* ========================================================================= */}
      {isCustomProgramModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-xl bg-white rounded-3xl border border-black/[0.1] shadow-2xl overflow-hidden flex flex-col">
            <div className="p-5 sm:p-6 border-b border-black/[0.06] flex items-center justify-between bg-[#FAF9F8]">
              <div>
                <h3 className="text-lg font-bold text-[#222222]">
                  Create Custom Training Program
                </h3>
                <p className="text-xs text-[#4A4A4A] mt-0.5">
                  Name your program, define its primary objectives, and customize your matrix schedule.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsCustomProgramModalOpen(false)}
                className="p-2 rounded-xl text-[#777777] hover:text-[#222222]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!customProgName.trim()) return;
                const startStr = customProgStartDate || new Date().toISOString().split("T")[0];
                const blankPlans = createBlankMatrixPlan(8, startStr);
                const newProg: TrainingProgram = {
                  id: `custom-prog-${Date.now()}`,
                  name: customProgName.trim(),
                  goal: customProgGoal,
                  daysPerWeek: customProgDays,
                  splitDaysPerWeek: customProgDays,
                  durationWeeks: 8,
                  totalWeeks: 8,
                  description: `Custom ${customProgGoal} routine designed by user.`,
                  primaryObjective: customProgPrimary.trim() || "Progressive overload across compound lifts",
                  secondaryObjective: customProgSecondary.trim() || undefined,
                  isCustom: true,
                  matrixPlans: blankPlans
                };

                if (onCreateCustomProgram) {
                  onCreateCustomProgram(newProg);
                }
                setIsCustomProgramModalOpen(false);
                setCustomProgName("");
                setCustomProgPrimary("");
                setCustomProgSecondary("");
                showToast(`Custom program "${newProg.name}" created starting ${formatFriendlyDate(startStr)}!`);
              }}
              className="p-5 sm:p-6 space-y-4"
            >
              <div>
                <label className="block text-xs font-bold text-[#222222] mb-1">
                  Program Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. David's 4-Day Powerbuilding Protocol"
                  value={customProgName}
                  onChange={(e) => setCustomProgName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-black/[0.12] bg-[#FBFBFA] text-xs font-bold text-[#222222] outline-none focus:ring-2 focus:ring-[#AD314D]"
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-[#222222] mb-1">
                    Program Start Date
                  </label>
                  <input
                    type="date"
                    value={customProgStartDate}
                    onChange={(e) => setCustomProgStartDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-black/[0.12] bg-[#FBFBFA] text-xs font-bold text-[#222222] outline-none focus:ring-2 focus:ring-[#AD314D]"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#222222] mb-1">
                    Goal Focus
                  </label>
                  <select
                    value={customProgGoal}
                    onChange={(e) => setCustomProgGoal(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-xl border border-black/[0.12] bg-[#FBFBFA] text-xs font-semibold text-[#222222]"
                  >
                    <option value="strength">Strength &amp; Heavy Power</option>
                    <option value="bulk">Hypertrophy Mass Builder</option>
                    <option value="cut">Metabolic Shred &amp; Conditioning</option>
                    <option value="recomp">Body Recomposition &amp; Longevity</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#222222] mb-1">
                    Days Per Week
                  </label>
                  <select
                    value={customProgDays}
                    onChange={(e) => setCustomProgDays(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl border border-black/[0.12] bg-[#FBFBFA] text-xs font-semibold text-[#222222]"
                  >
                    <option value={1}>1 Day</option>
                    <option value={2}>2 Days</option>
                    <option value={3}>3 Days</option>
                    <option value={4}>4 Days</option>
                    <option value={5}>5 Days</option>
                    <option value={6}>6 Days</option>
                    <option value={7}>7 Days</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#222222] mb-1">
                  Primary Objective
                </label>
                <input
                  type="text"
                  placeholder="e.g. Increase 1RM Squat to 140kg and Bench to 100kg"
                  value={customProgPrimary}
                  onChange={(e) => setCustomProgPrimary(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-black/[0.12] bg-[#FBFBFA] text-xs text-[#222222] outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#222222] mb-1">
                  Secondary Objective (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Strict form on pullups, improve thoracic mobility"
                  value={customProgSecondary}
                  onChange={(e) => setCustomProgSecondary(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-black/[0.12] bg-[#FBFBFA] text-xs text-[#222222] outline-none"
                />
              </div>

              <div className="p-4 -mx-5 -mb-5 sm:-mx-6 sm:-mb-6 border-t border-black/[0.06] bg-[#FAF9F8] flex items-center justify-end gap-2 rounded-b-3xl">
                <button
                  type="button"
                  onClick={() => setIsCustomProgramModalOpen(false)}
                  className="px-4 py-2 rounded-full border border-black/[0.08] text-xs font-semibold text-[#4A4A4A]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-full bg-[#AD314D] hover:bg-[#92263F] text-white text-xs font-bold shadow-sm transition-colors cursor-pointer"
                >
                  Save &amp; Activate Program
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* EDIT CUSTOM PROGRAM MODAL (User Requested) */}
      {/* ========================================================================= */}
      {isEditProgramModalOpen && programToEdit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-lg bg-white rounded-3xl border border-black/[0.1] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150">
            <div className="p-5 sm:p-6 border-b border-black/[0.06] flex items-center justify-between bg-[#FAF9F8]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#AD314D] to-[#8C1E37] text-white flex items-center justify-center shadow-sm">
                  <SlidersHorizontal className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-[#222222]">
                    Edit Program Setup
                  </h3>
                  <p className="text-xs text-[#777777]">
                    Update schedule days, fitness goal, objectives &amp; duration.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsEditProgramModalOpen(false)}
                className="p-1 rounded-full text-[#777777] hover:bg-black/[0.05] cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveEditProgram} className="p-5 sm:p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-[#222222] mb-1">
                  Program Name
                </label>
                <input
                  type="text"
                  value={editProgName}
                  onChange={(e) => setEditProgName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-black/[0.12] bg-[#FBFBFA] text-xs font-bold text-[#222222] outline-none focus:ring-2 focus:ring-[#AD314D]"
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-[#222222] mb-1">
                    Days Per Week
                  </label>
                  <select
                    value={editProgDays}
                    onChange={(e) => setEditProgDays(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl border border-black/[0.12] bg-[#FBFBFA] text-xs font-semibold text-[#222222]"
                  >
                    {[1, 2, 3, 4, 5, 6, 7].map((num) => (
                      <option key={num} value={num}>
                        {num} Days {activeMatrixDaysCount === num ? "(Active)" : ""}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#222222] mb-1">
                    Goal Focus
                  </label>
                  <select
                    value={editProgGoal}
                    onChange={(e) => setEditProgGoal(e.target.value as FitnessGoal)}
                    className="w-full px-3 py-2 rounded-xl border border-black/[0.12] bg-[#FBFBFA] text-xs font-semibold text-[#222222]"
                  >
                    <option value="bulk">Hypertrophy (Bulk)</option>
                    <option value="strength">Strength &amp; Power</option>
                    <option value="shred">Metabolic Shred</option>
                    <option value="recomp">Body Recomposition</option>
                    <option value="longevity">Longevity</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#222222] mb-1">
                    Program Duration
                  </label>
                  <select
                    value={editProgWeeks}
                    onChange={(e) => setEditProgWeeks(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl border border-black/[0.12] bg-[#FBFBFA] text-xs font-semibold text-[#222222]"
                  >
                    <option value={4}>4 Weeks</option>
                    <option value={6}>6 Weeks</option>
                    <option value={8}>8 Weeks</option>
                    <option value={10}>10 Weeks</option>
                    <option value={12}>12 Weeks</option>
                    <option value={16}>16 Weeks</option>
                  </select>
                </div>
              </div>

              {activeMatrixDaysCount > 0 && editProgDays !== activeMatrixDaysCount && (
                <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-between text-xs">
                  <span className="text-amber-800">
                    Your matrix currently has workouts on <strong>{activeMatrixDaysCount} days</strong>.
                  </span>
                  <button
                    type="button"
                    onClick={() => setEditProgDays(activeMatrixDaysCount)}
                    className="px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold text-[11px] cursor-pointer"
                  >
                    Set to {activeMatrixDaysCount} Days
                  </button>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-[#222222] mb-1">
                  Primary Objective
                </label>
                <input
                  type="text"
                  placeholder="e.g. Maximize single muscle hypertrophy with dedicated days"
                  value={editProgPrimary}
                  onChange={(e) => setEditProgPrimary(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-black/[0.12] bg-[#FBFBFA] text-xs text-[#222222] outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#222222] mb-1">
                  Secondary Objective (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Strict progressive overload and joint longevity"
                  value={editProgSecondary}
                  onChange={(e) => setEditProgSecondary(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-black/[0.12] bg-[#FBFBFA] text-xs text-[#222222] outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#222222] mb-1">
                  Description / Notes (Optional)
                </label>
                <textarea
                  rows={2}
                  placeholder="Notes about this split, rotation, or progression structure"
                  value={editProgDescription}
                  onChange={(e) => setEditProgDescription(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-black/[0.12] bg-[#FBFBFA] text-xs text-[#222222] outline-none resize-none"
                />
              </div>

              <div className="p-4 -mx-5 -mb-5 sm:-mx-6 sm:-mb-6 border-t border-black/[0.06] bg-[#FAF9F8] flex items-center justify-end gap-2 rounded-b-3xl">
                <button
                  type="button"
                  onClick={() => setIsEditProgramModalOpen(false)}
                  className="px-4 py-2 rounded-full border border-black/[0.08] text-xs font-semibold text-[#4A4A4A] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-full bg-[#AD314D] hover:bg-[#92263F] text-white text-xs font-bold shadow-sm transition-colors cursor-pointer"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* EXCEL IMPORT / EXPORT & DATA STORAGE MODAL */}
      {/* ========================================================================= */}
      {isExcelModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-2xl bg-white rounded-3xl border border-black/[0.1] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="p-5 sm:p-6 border-b border-black/[0.06] flex items-center justify-between bg-[#FAF9F8]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center border border-emerald-200">
                  <FileSpreadsheet className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-[#222222]">
                    Excel Integration &amp; Data Storage
                  </h3>
                  <p className="text-xs text-[#777777] mt-0.5">
                    Export your matrix plan or training diary to Excel, and import workout schedules.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsExcelModalOpen(false);
                  setExcelImportError(null);
                }}
                className="p-2 rounded-xl text-[#777777] hover:text-[#222222] transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 sm:p-6 space-y-5 overflow-y-auto">
              {/* Storage Architecture Explanation */}
              <div className="p-4 rounded-2xl bg-[#F6F6F4] border border-black/[0.06] space-y-1.5">
                <div className="flex items-center gap-2 text-xs font-bold text-[#222222]">
                  <Database className="w-4 h-4 text-[#AD314D]" />
                  <span>Where is your data stored?</span>
                </div>
                <p className="text-xs text-[#4A4A4A] leading-relaxed">
                  Your workout routines, weekly matrix plans, set-by-set target loads, and training diary logs are stored in your browser's persistent <strong className="text-[#222222]">LocalStorage</strong>.
                  Data persists across reloads and visits. Exporting to an Excel spreadsheet (<code className="px-1.5 py-0.5 bg-black/[0.05] rounded text-[11px]">.xlsx</code>) allows you to back up your routine, edit in Microsoft Excel or Google Sheets, or share with coaches.
                </p>
              </div>

              {/* Export Section */}
              <div className="space-y-2.5">
                <h4 className="text-xs font-bold uppercase tracking-wider text-[#777777]">
                  Export Worksheets (.xlsx)
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Export Matrix Plan */}
                  <div className="p-4 rounded-2xl border border-black/[0.08] bg-[#FBFBFA] space-y-3 flex flex-col justify-between hover:border-black/[0.15] transition-all">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 font-bold text-xs text-[#222222]">
                        <Calendar className="w-4 h-4 text-emerald-600" />
                        <span>Matrix Routine Schedule</span>
                      </div>
                      <p className="text-[11px] text-[#777777] leading-normal">
                        Exports all programmed weeks, training days, exercises, target sets, reps, and set-by-set load weights.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleExportMatrixExcel}
                      className="w-full flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs transition-colors"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Download Matrix Plan (.xlsx)</span>
                    </button>
                  </div>

                  {/* Export Workout Session Diary */}
                  <div className="p-4 rounded-2xl border border-black/[0.08] bg-[#FBFBFA] space-y-3 flex flex-col justify-between hover:border-black/[0.15] transition-all">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 font-bold text-xs text-[#222222]">
                        <Dumbbell className="w-4 h-4 text-[#AD314D]" />
                        <span>Workout Session Logs ({workouts.length})</span>
                      </div>
                      <p className="text-[11px] text-[#777777] leading-normal">
                        Exports complete session history, actual completed sets, kg/lbs lifted, reps, RPE, volume, and notes.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleExportLogsExcel}
                      className="w-full flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl bg-[#222222] hover:bg-black text-white font-bold text-xs shadow-xs transition-colors"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Download Workout Logs (.xlsx)</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Import Section */}
              <div className="space-y-2.5 pt-2 border-t border-black/[0.06]">
                <h4 className="text-xs font-bold uppercase tracking-wider text-[#777777]">
                  Import Routine From Excel (.xlsx / .csv)
                </h4>
                <div className="p-4 rounded-2xl border border-dashed border-black/[0.15] bg-[#FAF9F8] space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-white border border-black/[0.08] flex items-center justify-center text-[#777777]">
                      <Upload className="w-5 h-5 text-neutral-600" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-[#222222]">
                        Upload Excel or CSV Matrix Spreadsheet
                      </p>
                      <p className="text-[11px] text-[#777777]">
                        Accepts spreadsheets with columns: Week, Day, Exercise, Muscle, Target Sets, Reps, and Set 1..5.
                      </p>
                    </div>
                  </div>

                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xlsx, .xls, .csv"
                    onChange={handleImportExcelFile}
                    className="hidden"
                  />

                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="px-4 py-2 rounded-xl bg-white hover:bg-neutral-50 text-[#222222] border border-black/[0.12] text-xs font-bold shadow-2xs transition-colors flex items-center gap-1.5"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      <span>Choose Excel Spreadsheet</span>
                    </button>
                    <span className="text-[11px] text-[#777777]">Supports .xlsx, .xls, and .csv</span>
                  </div>

                  {excelImportError && (
                    <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-medium">
                      {excelImportError}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-black/[0.06] bg-[#FAF9F8] flex items-center justify-end">
              <button
                type="button"
                onClick={() => {
                  setIsExcelModalOpen(false);
                  setExcelImportError(null);
                }}
                className="px-5 py-2 rounded-full bg-[#222222] text-white text-xs font-bold hover:bg-black transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* PLANNER ADD GYM MODAL */}
      {/* ========================================================= */}
      {isPlannerGymModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl max-w-md w-full border border-black/[0.08] shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-700">
                  <Building2 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-neutral-900">Add New Gym</h3>
                  <p className="text-[11px] text-neutral-500">Record a training facility for your routines</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsPlannerGymModalOpen(false)}
                className="text-neutral-400 hover:text-neutral-700 p-1.5 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreatePlannerGym} className="space-y-3">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-neutral-600 block mb-1">
                  Gym Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Gold's Gym Venice, Equinox Downtown"
                  value={newPlannerGymName}
                  onChange={(e) => setNewPlannerGymName(e.target.value)}
                  className="w-full text-xs font-bold px-3 py-2 rounded-xl border border-neutral-300 bg-neutral-50/50 outline-none focus:border-indigo-600 focus:bg-white"
                  autoFocus
                />
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-neutral-600 block mb-1">
                  Location / Notes (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Main facility, Powerlifting room"
                  value={newPlannerGymLocation}
                  onChange={(e) => setNewPlannerGymLocation(e.target.value)}
                  className="w-full text-xs px-3 py-2 rounded-xl border border-neutral-300 bg-neutral-50/50 outline-none focus:border-indigo-600 focus:bg-white"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-neutral-100">
                <button
                  type="button"
                  onClick={() => setIsPlannerGymModalOpen(false)}
                  className="px-4 py-2 text-xs font-bold text-neutral-600 hover:text-neutral-900 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs"
                >
                  Save &amp; Select Gym
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* PLANNER ADD MACHINE MODAL */}
      {/* ========================================================= */}
      {isPlannerMachineModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl max-w-md w-full border border-black/[0.08] shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-700 font-bold">
                  ⚙️
                </div>
                <div>
                  <h3 className="text-base font-bold text-neutral-900">Add Distinct Machine</h3>
                  <p className="text-[11px] text-neutral-500">Track progression separately for this specific piece of equipment</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsPlannerMachineModalOpen(false);
                  setAddingMachineForPlannerExIdx(null);
                }}
                className="text-neutral-400 hover:text-neutral-700 p-1.5 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreatePlannerMachine} className="space-y-3">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-neutral-600 block mb-1">
                  Machine Model / Type *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Plate-Loaded Incline Press, Iso-Lateral Chest Press"
                  value={newPlannerMachineName}
                  onChange={(e) => setNewPlannerMachineName(e.target.value)}
                  className="w-full text-xs font-bold px-3 py-2 rounded-xl border border-neutral-300 bg-neutral-50/50 outline-none focus:border-indigo-600 focus:bg-white"
                  autoFocus
                />
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-neutral-600 block mb-1">
                  Brand / Manufacturer (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Hammer Strength, Prime Fitness, Arsenal"
                  value={newPlannerMachineBrand}
                  onChange={(e) => setNewPlannerMachineBrand(e.target.value)}
                  className="w-full text-xs px-3 py-2 rounded-xl border border-neutral-300 bg-neutral-50/50 outline-none focus:border-indigo-600 focus:bg-white"
                />
              </div>

              <div className="p-3 rounded-2xl bg-amber-50/70 border border-amber-200 text-amber-900 text-[11px] leading-relaxed">
                💡 <strong>Why separate machines?</strong> Progressions and personal records will be isolated for this specific machine, so plate-loaded, selectorized pin-loaded, and different leverage curves never get mixed up in your charts!
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-neutral-100">
                <button
                  type="button"
                  onClick={() => {
                    setIsPlannerMachineModalOpen(false);
                    setAddingMachineForPlannerExIdx(null);
                  }}
                  className="px-4 py-2 text-xs font-bold text-neutral-600 hover:text-neutral-900 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs"
                >
                  Save &amp; Select Machine
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default WeeklyMatrixPlanner;
