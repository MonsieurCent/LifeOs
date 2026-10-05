import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  Plus,
  Trash2,
  Check,
  CheckCircle2,
  Timer,
  RotateCcw,
  Sparkles,
  Dumbbell,
  Clock,
  Table as TableIcon,
  LayoutGrid,
  Bookmark,
  X,
  Calendar,
  AlertCircle
} from "lucide-react";
import {
  WorkoutSession,
  ExerciseLog,
  ExerciseSet,
  WeightUnit,
  MuscleGroup,
  WorkoutPlan,
  ExerciseReference,
  WeeklyMatrixPlan,
  MatrixDayCell,
  PlannedExercise,
  DayOfWeek,
  EquipmentType,
  EQUIPMENT_LABELS
} from "../types";
import { EXERCISE_CATALOG, aiMatchBodypart } from "../utils/calculations";
import { cleanNumber, resolveSession } from "../utils/sessionResolver";
import {
  getTodayDateStr,
  DAYS_OF_WEEK,
  findPlannedSessionForDate,
  convertPlannedExercisesToLogs
} from "../utils/fitnessData";
import {
  getWorkoutDraft,
  saveWorkoutDraft,
  removeWorkoutDraft,
  listWorkoutDrafts,
  WorkoutDraft,
  getUserStorageKey,
  safeGetItem,
  safeSetItem
} from "../utils/userStorage";

interface WorkoutLoggerProps {
  unit: WeightUnit;
  onSaveWorkout: (workout: WorkoutSession) => void;
  onCancel?: () => void;
  initialPlan?: WorkoutPlan | null;
  matrixPlans?: WeeklyMatrixPlan[];
  currentProgramName?: string;
  activeProgramId?: string;
  userId?: string;
  workouts?: WorkoutSession[];
  completedDaysRecord?: Record<string, boolean>;
}

export const WorkoutLogger: React.FC<WorkoutLoggerProps> = ({
  unit,
  onSaveWorkout,
  onCancel,
  initialPlan,
  matrixPlans = [],
  currentProgramName = "Current Program",
  activeProgramId,
  userId,
  workouts = [],
  completedDaysRecord = {}
}) => {
  const timeNow = new Date().toTimeString().slice(0, 5);

  const targetDraftKey = useMemo(() => {
    if (initialPlan?.id) {
      return `plan_${initialPlan.id}`;
    }
    return "free_workout";
  }, [initialPlan?.id]);

  // Saved planner sessions from matrixPlans
  const savedPlannerSessions = useMemo(() => {
    if (!matrixPlans || matrixPlans.length === 0) return [];
    const list: {
      id: string;
      label: string;
      title: string;
      exercises: PlannedExercise[];
      notes?: string;
      week: number;
      day: DayOfWeek;
      date?: string;
    }[] = [];

    matrixPlans.forEach((wp) => {
      DAYS_OF_WEEK.forEach((dayName) => {
        const dayCell = wp.days?.[dayName] as MatrixDayCell | undefined;
        if (
          dayCell &&
          !dayCell.isRestDay &&
          dayCell.workoutTitle &&
          dayCell.exercises &&
          dayCell.exercises.length > 0
        ) {
          const dateLabel = dayCell.date ? ` • ${dayCell.date}` : "";
          list.push({
            id: `w${wp.weekNumber}-${dayName}`,
            label: `${dayCell.workoutTitle} (Week ${wp.weekNumber} • ${dayName}${dateLabel})`,
            title: dayCell.workoutTitle,
            exercises: dayCell.exercises,
            notes: dayCell.notes,
            week: wp.weekNumber,
            day: dayName,
            date: dayCell.date
          });
        }
      });
    });
    return list;
  }, [matrixPlans]);

  // Today's scheduled planned session if available
  const todayPlannedSession = useMemo(() => {
    const todayStr = getTodayDateStr();
    return savedPlannerSessions.find((s) => s.date === todayStr) || null;
  }, [savedPlannerSessions]);

  // Canonical Session Resolution (Completed > Active > Planned)
  const targetQuery = useMemo(() => {
    if (initialPlan) {
      return {
        date: initialPlan.scheduledDate || getTodayDateStr(),
        planId: initialPlan.id,
        weekNumber: initialPlan.weekNumber,
        dayOfWeek: initialPlan.dayOfWeek as DayOfWeek | undefined
      };
    }
    return {
      date: getTodayDateStr()
    };
  }, [initialPlan]);

  const targetResolvedSession = useMemo(() => {
    return resolveSession(targetQuery, {
      workouts,
      matrixPlans,
      completedDaysRecord,
      userId
    });
  }, [targetQuery, workouts, matrixPlans, completedDaysRecord, userId]);

  // State to track if user explicitly clicked "Add Another Session Today"
  const [isAddingAdditionalSession, setIsAddingAdditionalSession] = useState(false);

  // If editing an already completed session, preserve its ID for in-place updates unless user chose to add another session
  const [editingCompletedWorkoutId, setEditingCompletedWorkoutId] = useState<string | null>(() => {
    if (targetResolvedSession.isCompleted && targetResolvedSession.completedWorkout) {
      return targetResolvedSession.completedWorkout.id;
    }
    return null;
  });

  const [editingCompletedWorkoutTime, setEditingCompletedWorkoutTime] = useState<string | null>(() => {
    if (targetResolvedSession.isCompleted && targetResolvedSession.completedWorkout) {
      return targetResolvedSession.completedWorkout.time || null;
    }
    return null;
  });

  // Active plan metadata to link saved workout back to planner
  const [activePlanMeta, setActivePlanMeta] = useState<{
    weekNumber?: number;
    dayOfWeek?: DayOfWeek;
    planId?: string;
  } | null>(() => {
    const draft = getWorkoutDraft(userId, targetDraftKey);
    if (draft?.activePlanMeta) {
      return draft.activePlanMeta;
    }
    if (targetResolvedSession.isCompleted && targetResolvedSession.completedWorkout) {
      const cw = targetResolvedSession.completedWorkout;
      return {
        planId: cw.planId,
        weekNumber: cw.weekNumber,
        dayOfWeek: cw.dayOfWeek as DayOfWeek | undefined
      };
    }
    if (initialPlan) {
      return {
        planId: initialPlan.id,
        weekNumber: initialPlan.weekNumber,
        dayOfWeek: initialPlan.dayOfWeek as DayOfWeek | undefined
      };
    }
    return null;
  });

  // Title state - resumes from draft first, then completed workout, then initial plan
  const [title, setTitle] = useState(() => {
    const draft = getWorkoutDraft(userId, targetDraftKey);
    if (draft?.title) return draft.title;
    if (targetResolvedSession.isCompleted && targetResolvedSession.completedWorkout?.title) {
      return targetResolvedSession.completedWorkout.title;
    }
    if (initialPlan) return initialPlan.name;
    return "Day 1 (Back)";
  });

  // Date state - resumes from draft first, then completed workout, then plan or today
  const [date, setDate] = useState(() => {
    const draft = getWorkoutDraft(userId, targetDraftKey);
    if (draft?.date) return draft.date;
    if (targetResolvedSession.isCompleted && targetResolvedSession.completedWorkout?.date) {
      return targetResolvedSession.completedWorkout.date;
    }
    if (initialPlan?.scheduledDate) return initialPlan.scheduledDate;
    return getTodayDateStr();
  });

  const [duration, setDuration] = useState(() => {
    const draft = getWorkoutDraft(userId, targetDraftKey);
    if (typeof draft?.durationMinutes === "number") return draft.durationMinutes;
    if (targetResolvedSession.isCompleted && typeof targetResolvedSession.completedWorkout?.durationMinutes === "number") {
      return targetResolvedSession.completedWorkout.durationMinutes;
    }
    return 60;
  });

  // Notes state
  const [notes, setNotes] = useState(() => {
    const draft = getWorkoutDraft(userId, targetDraftKey);
    if (draft?.notes !== undefined) return draft.notes;
    if (targetResolvedSession.isCompleted && targetResolvedSession.completedWorkout?.notes !== undefined) {
      return targetResolvedSession.completedWorkout.notes;
    }
    if (initialPlan?.notes) return initialPlan.notes;
    return "";
  });

  // View mode
  const [viewMode, setViewMode] = useState<"cards" | "table">("table");

  // Selected routine from dropdown
  const [selectedRoutineId, setSelectedRoutineId] = useState<string>("");

  // Custom exercises saved in localStorage (scoped by user)
  const [customExercises, setCustomExercises] = useState<ExerciseReference[]>(() => {
    try {
      const scopedKey = getUserStorageKey(userId, "custom_exercises");
      const saved = safeGetItem(scopedKey) || safeGetItem("pulse_custom_exercises");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {}
    return [];
  });

  const fullExerciseCatalog = useMemo(
    () => [...customExercises, ...EXERCISE_CATALOG],
    [customExercises]
  );

  // Exercises state - resumes from draft first; if none, checks resolved completed session, then initialPlan
  const [exercises, setExercises] = useState<ExerciseLog[]>(() => {
    const draft = getWorkoutDraft(userId, targetDraftKey);
    if (draft?.exercises && Array.isArray(draft.exercises) && draft.exercises.length > 0) {
      return draft.exercises.map((ex) => ({
        ...ex,
        sets: ex.sets.map((s) => ({
          ...s,
          weight: cleanNumber(Number(s.weight) || 0),
          reps: Math.round(Number(s.reps) || 0)
        }))
      }));
    }

    if (targetResolvedSession.isCompleted && targetResolvedSession.completedWorkout?.exercises?.length) {
      return targetResolvedSession.completedWorkout.exercises.map((ex) => ({
        ...ex,
        sets: ex.sets.map((s) => ({
          ...s,
          weight: cleanNumber(Number(s.weight) || 0),
          reps: Math.round(Number(s.reps) || 0)
        }))
      }));
    }

    if (initialPlan?.exercises && initialPlan.exercises.length > 0) {
      return convertPlannedExercisesToLogs(initialPlan.exercises).map((ex) => ({
        ...ex,
        sets: ex.sets.map((s) => ({
          ...s,
          weight: cleanNumber(Number(s.weight) || 0),
          reps: Math.round(Number(s.reps) || 0)
        }))
      }));
    }

    // Default starter session
    return [
      {
        id: "ex-1",
        exerciseName: "Lat Pulldown (Plate-Loaded)",
        muscleGroup: "Back",
        sets: [
          { id: "s-1", setNumber: 1, weight: 80, reps: 10, rpe: 8 },
          { id: "s-2", setNumber: 2, weight: 80, reps: 10, rpe: 8 },
          { id: "s-3", setNumber: 3, weight: 80, reps: 10, rpe: 8.5 }
        ]
      },
      {
        id: "ex-2",
        exerciseName: "Chest-Supported Row",
        muscleGroup: "Back",
        sets: [
          { id: "s-4", setNumber: 1, weight: 28, reps: 10, rpe: 8 },
          { id: "s-5", setNumber: 2, weight: 28, reps: 10, rpe: 8 },
          { id: "s-6", setNumber: 3, weight: 28, reps: 10, rpe: 8.5 }
        ]
      }
    ];
  });

  // Re-sync on initialPlan or user switch: CRITICAL - check if draft already exists before resetting!
  useEffect(() => {
    if (!initialPlan) return;
    const draftKey = `plan_${initialPlan.id}`;
    const draft = getWorkoutDraft(userId, draftKey);
    if (draft && draft.exercises && draft.exercises.length > 0) {
      // RESUME the edited draft! Never overwrite edited user values with original plan!
      setTitle(draft.title);
      setDate(draft.date);
      setDuration(draft.durationMinutes || 60);
      setNotes(draft.notes || "");
      setActivePlanMeta(draft.activePlanMeta || { planId: initialPlan.id });
      setExercises(draft.exercises);
    } else if (targetResolvedSession.isCompleted && targetResolvedSession.completedWorkout) {
      // Completed session is authoritative! Never revert to planned exercises upon refresh!
      const cw = targetResolvedSession.completedWorkout;
      setTitle(cw.title);
      setDate(cw.date);
      setDuration(cw.durationMinutes || 60);
      setNotes(cw.notes || "");
      setActivePlanMeta({
        planId: cw.planId || initialPlan.id,
        weekNumber: cw.weekNumber,
        dayOfWeek: cw.dayOfWeek as DayOfWeek | undefined
      });
      setExercises(cw.exercises);
      setEditingCompletedWorkoutId(cw.id);
      setEditingCompletedWorkoutTime(cw.time || null);
    } else if (initialPlan.exercises && initialPlan.exercises.length > 0) {
      // First time opening this plan: initialize from plan
      setTitle(initialPlan.name);
      setDate(initialPlan.scheduledDate || getTodayDateStr());
      setDuration(60);
      setNotes(initialPlan.notes || "");
      setActivePlanMeta({
        planId: initialPlan.id
      });
      setExercises(convertPlannedExercisesToLogs(initialPlan.exercises));
      setEditingCompletedWorkoutId(null);
    }
  }, [initialPlan?.id, userId, targetResolvedSession]);

  // Auto-save draft on any changes with stable identity scoped to Firebase UID and planned session
  useEffect(() => {
    // If viewing completed workout without pending user changes, don't resurrect in-flight draft
    if (targetResolvedSession.isCompleted && !isAddingAdditionalSession && !editingCompletedWorkoutId) {
      return;
    }

    try {
      saveWorkoutDraft(userId, {
        id: targetDraftKey,
        uid: userId || "guest",
        planId: initialPlan?.id,
        programId: activeProgramId,
        title,
        date,
        durationMinutes: duration,
        notes,
        exercises,
        activePlanMeta: activePlanMeta || (initialPlan ? { planId: initialPlan.id } : undefined),
        updatedAt: new Date().toISOString()
      });
    } catch (e) {
      console.warn("Failed to auto-save workout draft:", e);
    }
  }, [userId, targetDraftKey, title, date, duration, notes, exercises, activePlanMeta, activeProgramId, initialPlan?.id, targetResolvedSession.isCompleted, isAddingAdditionalSession, editingCompletedWorkoutId]);

  // Exercise addition states
  const [selectedCatalogExercise, setSelectedCatalogExercise] = useState<string>(
    fullExerciseCatalog[0]?.name || "Lat Pulldown"
  );
  const [quickAddExerciseName, setQuickAddExerciseName] = useState<string>("");
  const [isAddingCustomExercise, setIsAddingCustomExercise] = useState(false);
  const [newCustomName, setNewCustomName] = useState("");
  const [newCustomMuscle, setNewCustomMuscle] = useState<MuscleGroup>("Arms");
  const [newCustomIncrement, setNewCustomIncrement] = useState("2.5");

  // Rest timer (shared single source of truth for inline & floating timer)
  const [restSeconds, setRestSeconds] = useState(0);
  const [isTimerActive, setIsTimerActive] = useState(false);
  const [isFloatingTimerDismissed, setIsFloatingTimerDismissed] = useState(false);
  const restTimerEndRef = useRef<number>(0);
  const wakeLockRef = useRef<any>(null);

  // Play audio chime and vibration when timer finishes
  const playTimerChime = useCallback(() => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(587.33, audioCtx.currentTime); // D5
      osc.frequency.setValueAtTime(880, audioCtx.currentTime + 0.15); // A5
      gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
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

  const stopRestTimer = useCallback(() => {
    restTimerEndRef.current = 0;
    setRestSeconds(0);
    setIsTimerActive(false);
    try {
      localStorage.removeItem("pulse_workout_timer_end");
    } catch (e) {}
    if (wakeLockRef.current) {
      wakeLockRef.current.release().catch(() => {});
      wakeLockRef.current = null;
    }
  }, []);

  const startRestTimer = (seconds: number) => {
    const end = Date.now() + seconds * 1000;
    restTimerEndRef.current = end;
    setRestSeconds(seconds);
    setIsTimerActive(true);
    setIsFloatingTimerDismissed(false);
    try {
      localStorage.setItem("pulse_workout_timer_end", String(end));
    } catch (e) {}

    // Request screen wake lock so screen does not turn off during rest period
    if ("wakeLock" in navigator) {
      navigator.wakeLock.request("screen").then((wl) => {
        wakeLockRef.current = wl;
      }).catch(() => {});
    }
  };

  // Restore timer on mount if previously running
  useEffect(() => {
    try {
      const savedEnd = Number(localStorage.getItem("pulse_workout_timer_end"));
      if (savedEnd && savedEnd > Date.now()) {
        restTimerEndRef.current = savedEnd;
        setRestSeconds(Math.ceil((savedEnd - Date.now()) / 1000));
        setIsTimerActive(true);
      }
    } catch (e) {}
  }, []);

  // Timer interval and visibility/focus listener
  useEffect(() => {
    if (!isTimerActive || restTimerEndRef.current <= 0) return;

    const checkTimer = () => {
      if (restTimerEndRef.current <= 0) return;
      const remainingMs = restTimerEndRef.current - Date.now();
      const remainingSec = Math.max(0, Math.ceil(remainingMs / 1000));
      setRestSeconds(remainingSec);

      if (remainingSec <= 0) {
        stopRestTimer();
        playTimerChime();
      }
    };

    const interval = setInterval(checkTimer, 300);

    const handleVisibilityChange = () => {
      checkTimer();
      if (document.visibilityState === "visible" && restTimerEndRef.current > Date.now()) {
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
  }, [isTimerActive, playTimerChime, stopRestTimer]);

  const setQuickDate = (daysAgo: number) => {
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    setDate(d.toISOString().split("T")[0]);
  };

  // Routine loader: replaces session with routine and preserves all planned sets
  const handleLoadRoutine = (sessionId: string) => {
    const found = savedPlannerSessions.find((s) => s.id === sessionId);
    if (!found) return;

    setTitle(found.title);
    setNotes(found.notes || `Scheduled routine for Week ${found.week} ${found.day}`);
    if (found.date) {
      setDate(found.date);
    }

    setActivePlanMeta({
      weekNumber: found.week,
      dayOfWeek: found.day,
      planId: found.id
    });

    const loadedExercises = convertPlannedExercisesToLogs(found.exercises);
    setExercises(loadedExercises);
  };

  // Quick text add custom exercise
  const handleQuickAddCustomExercise = () => {
    const name = quickAddExerciseName.trim();
    if (!name) return;

    const matchedMuscle = aiMatchBodypart(name);
    const newEx: ExerciseLog = {
      id: `ex-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      exerciseName: name,
      muscleGroup: matchedMuscle,
      sets: [
        { id: `set-${Date.now()}-1`, setNumber: 1, weight: 50, reps: 10, rpe: 8 },
        { id: `set-${Date.now()}-2`, setNumber: 2, weight: 50, reps: 10, rpe: 8 },
        { id: `set-${Date.now()}-3`, setNumber: 3, weight: 50, reps: 10, rpe: 8 }
      ]
    };

    setExercises((prev) => [...prev, newEx]);
    setQuickAddExerciseName("");

    // Also remember in catalog if not already present
    if (!fullExerciseCatalog.some((e) => e.name.toLowerCase() === name.toLowerCase())) {
      const ref: ExerciseReference = {
        name,
        muscleGroup: matchedMuscle,
        defaultIncrement: unit === "lbs" ? 5 : 2.5,
        isCustom: true
      };
      const updated = [ref, ...customExercises];
      setCustomExercises(updated);
      try {
        const scopedKey = getUserStorageKey(userId, "custom_exercises");
        safeSetItem(scopedKey, JSON.stringify(updated));
      } catch (e) {}
    }
  };

  // Add catalog exercise
  const handleAddCatalogExercise = () => {
    const catalogItem = fullExerciseCatalog.find((e) => e.name === selectedCatalogExercise);
    const newEx: ExerciseLog = {
      id: `ex-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      exerciseName: selectedCatalogExercise,
      muscleGroup: catalogItem ? catalogItem.muscleGroup : "Chest",
      sets: [
        { id: `set-${Date.now()}-1`, setNumber: 1, weight: 60, reps: 10, rpe: 8 },
        { id: `set-${Date.now()}-2`, setNumber: 2, weight: 60, reps: 10, rpe: 8 },
        { id: `set-${Date.now()}-3`, setNumber: 3, weight: 60, reps: 10, rpe: 8 }
      ]
    };
    setExercises((prev) => [...prev, newEx]);
  };

  // Save modal custom exercise
  const handleSaveCustomExercise = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCustomName.trim()) return;

    const newExRef: ExerciseReference = {
      name: newCustomName.trim(),
      muscleGroup: newCustomMuscle,
      defaultIncrement: Number(newCustomIncrement) || 2.5,
      isCustom: true
    };

    const updated = [newExRef, ...customExercises];
    setCustomExercises(updated);
    try {
      const scopedKey = getUserStorageKey(userId, "custom_exercises");
      safeSetItem(scopedKey, JSON.stringify(updated));
    } catch (e) {}

    setSelectedCatalogExercise(newExRef.name);
    const newExLog: ExerciseLog = {
      id: `ex-${Date.now()}`,
      exerciseName: newExRef.name,
      muscleGroup: newExRef.muscleGroup,
      sets: [
        { id: `set-${Date.now()}-1`, setNumber: 1, weight: 50, reps: 10, rpe: 8 },
        { id: `set-${Date.now()}-2`, setNumber: 2, weight: 50, reps: 10, rpe: 8 },
        { id: `set-${Date.now()}-3`, setNumber: 3, weight: 50, reps: 10, rpe: 8 }
      ]
    };
    setExercises((prev) => [...prev, newExLog]);
    setIsAddingCustomExercise(false);
    setNewCustomName("");
  };

  const handleRemoveExercise = (exId: string) => {
    setExercises((prev) => prev.filter((e) => e.id !== exId));
  };

  const handleAddSet = (exId: string) => {
    setExercises((prev) =>
      prev.map((ex) => {
        if (ex.id !== exId) return ex;
        const lastSet = ex.sets[ex.sets.length - 1];
        const newSetNum = ex.sets.length + 1;
        const newSet: ExerciseSet = {
          id: `set-${Date.now()}-${newSetNum}`,
          setNumber: newSetNum,
          weight: lastSet ? lastSet.weight : 50,
          reps: lastSet ? lastSet.reps : 10,
          rpe: lastSet ? lastSet.rpe : 8
        };
        return {
          ...ex,
          sets: [...ex.sets, newSet]
        };
      })
    );
  };

  const handleRemoveSet = (exId: string, setId: string) => {
    setExercises((prev) =>
      prev.map((ex) => {
        if (ex.id !== exId) return ex;
        if (ex.sets.length <= 1) return ex;
        const filtered = ex.sets.filter((s) => s.id !== setId);
        return {
          ...ex,
          sets: filtered.map((s, idx) => ({ ...s, setNumber: idx + 1 }))
        };
      })
    );
  };

  const handleUpdateSet = (
    exId: string,
    setId: string,
    field: keyof ExerciseSet,
    value: number | boolean
  ) => {
    const cleanedValue =
      field === "weight" && typeof value === "number"
        ? cleanNumber(value)
        : field === "reps" && typeof value === "number"
        ? Math.round(value)
        : value;

    setExercises((prev) =>
      prev.map((ex) => {
        if (ex.id !== exId) return ex;
        return {
          ...ex,
          sets: ex.sets.map((s) => (s.id === setId ? { ...s, [field]: cleanedValue } : s))
        };
      })
    );
  };

  const handleDelta = (
    exId: string,
    setId: string,
    field: "weight" | "reps",
    delta: number
  ) => {
    setExercises((prev) =>
      prev.map((ex) => {
        if (ex.id !== exId) return ex;
        return {
          ...ex,
          sets: ex.sets.map((s) => {
            if (s.id === setId) {
              const currentVal = Number(s[field]) || 0;
              const nextVal =
                field === "weight"
                  ? cleanNumber(Math.max(0, currentVal + delta))
                  : Math.max(0, Math.round(currentVal + delta));
              return { ...s, [field]: nextVal };
            }
            return s;
          })
        };
      })
    );
  };

  const handleUpdateEquipmentType = (exId: string, equipmentType: EquipmentType) => {
    setExercises((prev) =>
      prev.map((ex) => (ex.id === exId ? { ...ex, equipmentType, machineId: undefined } : ex))
    );
  };

  const handleResetDraft = () => {
    try {
      removeWorkoutDraft(userId, targetDraftKey);
    } catch (e) {}
    setTitle("Gym Session");
    setDate(getTodayDateStr());
    setNotes("");
    setActivePlanMeta(null);
    setExercises([]);
  };

  // Live session statistics
  const liveVolume = exercises.reduce((acc, ex) => {
    return (
      acc +
      ex.sets.reduce((sAcc, s) => {
        return sAcc + cleanNumber(Number(s.weight) || 0) * (Number(s.reps) || 0);
      }, 0)
    );
  }, 0);

  const totalSetsCount = exercises.reduce((acc, ex) => acc + ex.sets.length, 0);

  // Maximum sets across exercises for dynamic table columns (at least 6)
  const maxSetsInSession = Math.max(
    6,
    ...exercises.map((ex) => ex.sets.length)
  );

  const handleStartAdditionalSession = () => {
    setIsAddingAdditionalSession(true);
    setEditingCompletedWorkoutId(null);
    setEditingCompletedWorkoutTime(null);
    setTitle("Gym Session (Session 2)");
    setDate(getTodayDateStr());
    setDuration(60);
    setNotes("");
    setActivePlanMeta(null);
    setExercises([]);
  };

  const handleViewCompletedSession = () => {
    setIsAddingAdditionalSession(false);
    if (targetResolvedSession.completedWorkout) {
      const cw = targetResolvedSession.completedWorkout;
      setEditingCompletedWorkoutId(cw.id);
      setEditingCompletedWorkoutTime(cw.time || null);
      setTitle(cw.title);
      setDate(cw.date);
      setDuration(cw.durationMinutes || 60);
      setNotes(cw.notes || "");
      setExercises(cw.exercises);
      setActivePlanMeta({
        planId: cw.planId,
        weekNumber: cw.weekNumber,
        dayOfWeek: cw.dayOfWeek as DayOfWeek | undefined
      });
    }
  };

  // Save workout handler
  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (exercises.length === 0) {
      alert("Please add at least one exercise to your session.");
      return;
    }

    // Determine week/day link accurately based on workout date
    let detectedWeek: number | undefined = undefined;
    let detectedDayKey: string | undefined = undefined;
    let detectedDayOfWeek: DayOfWeek | undefined = undefined;

    if (matrixPlans && matrixPlans.length > 0 && date) {
      const match = findPlannedSessionForDate(matrixPlans, date, currentProgramName);
      if (match) {
        detectedWeek = match.weekNumber;
        detectedDayKey = `w${match.weekNumber}-${match.dayOfWeek}`;
        detectedDayOfWeek = match.dayOfWeek;
      }
    }

    if (!detectedWeek && activePlanMeta) {
      detectedWeek = activePlanMeta.weekNumber;
      detectedDayKey = `w${activePlanMeta.weekNumber}-${activePlanMeta.dayOfWeek}`;
      detectedDayOfWeek = activePlanMeta.dayOfWeek;
    }

    // Clean all exercises & sets to prevent floating-point anomalies
    const cleanExercises: ExerciseLog[] = exercises.map((ex) => ({
      ...ex,
      sets: ex.sets.map((s) => ({
        ...s,
        weight: cleanNumber(Number(s.weight) || 0),
        reps: Math.round(Number(s.reps) || 0)
      }))
    }));

    const workoutId = (!isAddingAdditionalSession && editingCompletedWorkoutId)
      ? editingCompletedWorkoutId
      : `w-${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    const workoutTime = (!isAddingAdditionalSession && editingCompletedWorkoutTime)
      ? editingCompletedWorkoutTime
      : timeNow;

    const newWorkout: WorkoutSession = {
      id: workoutId,
      date: date || getTodayDateStr(),
      time: workoutTime,
      title: title.trim() || "Gym Session",
      durationMinutes: Number(duration) || 60,
      exercises: cleanExercises,
      notes: notes.trim() || "",
      syncedToSheet: false,
      weekNumber: detectedWeek,
      dayKey: detectedDayKey,
      dayOfWeek: detectedDayOfWeek,
      programId: activeProgramId,
      planId: activePlanMeta?.planId || (initialPlan?.id ? initialPlan.id : undefined),
      updatedAt: new Date().toISOString()
    };

    onSaveWorkout(newWorkout);
  };

  return (
    <form
      onSubmit={handleSave}
      className="w-full bg-white rounded-[18px] border border-black/[0.06] p-5 sm:p-7 shadow-[0_8px_30px_rgba(0,0,0,0.03)] transition-all"
    >
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 mb-6 border-b border-black/[0.06]">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-[#222222] tracking-tight">
              Log Workout Session
            </h2>
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
              Live Tracker
            </span>
          </div>
          <p className="text-xs text-[#4A4A4A] mt-0.5">
            Log today’s session or load any planned routine with all sets preserved
          </p>
        </div>

        {/* Live Volume Pill */}
        <div className="flex items-center gap-3 bg-[#F4F4F2] px-3.5 py-1.5 rounded-xl border border-black/[0.04]">
          <div className="text-right">
            <div className="text-[10px] text-[#4A4A4A] uppercase font-semibold">
              Live Volume
            </div>
            <div className="text-sm font-bold text-[#AD314D]">
              {liveVolume.toLocaleString()} {unit}
            </div>
          </div>
          <div className="h-6 w-px bg-black/[0.08]" />
          <div className="text-right">
            <div className="text-[10px] text-[#4A4A4A] uppercase font-semibold">
              Sets
            </div>
            <div className="text-sm font-bold text-[#222222]">
              {totalSetsCount} sets
            </div>
          </div>
        </div>
      </div>

      {/* Completed Session Authoritative Banner */}
      {targetResolvedSession.isCompleted && targetResolvedSession.completedWorkout && !isAddingAdditionalSession && (
        <div className="mb-6 p-4 rounded-2xl bg-emerald-50 border border-emerald-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-100 flex items-center justify-center text-emerald-800 shrink-0">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-emerald-900 uppercase tracking-wide">
                  Workout Completed
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-200/60 font-semibold text-emerald-800">
                  Authoritative Record
                </span>
              </div>
              <p className="text-xs text-emerald-700 mt-0.5">
                Showing actual logged session ({targetResolvedSession.completedWorkout.exercises?.length || 0} exercises, {totalSetsCount} sets). Any edits will update this record in-place.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleStartAdditionalSession}
              className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-white text-emerald-900 border border-emerald-300 hover:bg-emerald-100 transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
            >
              <Plus className="w-3.5 h-3.5 text-emerald-700" />
              <span>Add Another Session Today</span>
            </button>
          </div>
        </div>
      )}

      {/* Additional Session Banner */}
      {isAddingAdditionalSession && (
        <div className="mb-6 p-4 rounded-2xl bg-indigo-50 border border-indigo-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-100 flex items-center justify-center text-indigo-800 shrink-0">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-indigo-900 uppercase tracking-wide">
                  Logging Additional Workout
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-200/60 font-semibold text-indigo-800">
                  Session 2
                </span>
              </div>
              <p className="text-xs text-indigo-700 mt-0.5">
                Your earlier completed workout is safely preserved. This will be logged as an additional session for today.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleViewCompletedSession}
              className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-white text-indigo-900 border border-indigo-300 hover:bg-indigo-100 transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
            >
              <span>Back to Completed Workout</span>
            </button>
          </div>
        </div>
      )}

      {/* Routine Quick-Load Bar */}
      <div className="mb-6 p-4 rounded-2xl bg-[#FBF8F8] border border-[#AD314D]/25 flex flex-col lg:flex-row lg:items-center justify-between gap-3 shadow-xs">
        <div className="flex items-center gap-2">
          <Bookmark className="w-4 h-4 text-[#AD314D] shrink-0" />
          <div>
            <span className="text-xs font-bold text-[#222222]">
              Load Planned Routine:
            </span>
            <span className="text-[11px] text-[#4A4A4A] ml-2 hidden sm:inline">
              Loads full exercise list and all working sets exactly as planned
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {todayPlannedSession && (
            <button
              type="button"
              onClick={() => handleLoadRoutine(todayPlannedSession.id)}
              className="px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-700 hover:bg-emerald-800 text-white flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Today’s Planned Routine</span>
            </button>
          )}

          {savedPlannerSessions.length > 0 ? (
            <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
              <select
                value={selectedRoutineId}
                onChange={(e) => setSelectedRoutineId(e.target.value)}
                className="h-9 px-3 rounded-xl bg-white border border-black/[0.12] text-xs font-semibold text-[#222222] outline-none max-w-[280px]"
              >
                <option value="">-- Choose Routine to Load --</option>
                {savedPlannerSessions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label} ({s.exercises.length} exercises)
                  </option>
                ))}
              </select>

              <button
                type="button"
                disabled={!selectedRoutineId}
                onClick={() => {
                  if (selectedRoutineId) handleLoadRoutine(selectedRoutineId);
                }}
                className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-[#AD314D] hover:bg-[#8C1E37] disabled:opacity-40 text-white transition-all shadow-xs cursor-pointer"
              >
                Load Routine
              </button>
            </div>
          ) : (
            <span className="text-xs text-[#4A4A4A] italic">
              No planned routines found in matrix.
            </span>
          )}

          <button
            type="button"
            onClick={handleResetDraft}
            className="px-2.5 py-1.5 rounded-xl text-xs text-[#4A4A4A] hover:text-rose-600 hover:bg-rose-50 border border-black/[0.08] transition-colors ml-auto sm:ml-0"
            title="Discard current draft & start blank"
          >
            Clear Draft
          </button>
        </div>
      </div>

      {/* Meta Fields: Title, Date, Duration */}
      <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 mb-6">
        {/* Title */}
        <div className="sm:col-span-5">
          <label className="block text-xs font-semibold uppercase tracking-wider text-[#4A4A4A] mb-1.5">
            Session Title
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            className="w-full h-11 px-3.5 rounded-xl bg-[#F8F8F7] border border-black/[0.08] focus:border-[#AD314D] focus:bg-white text-sm font-medium text-[#222222] transition-colors outline-none"
            placeholder="e.g. Day 1 (Back)"
          />
        </div>

        {/* Date */}
        <div className="sm:col-span-4">
          <div className="flex items-center justify-between mb-1.5">
            <label className="block text-xs font-semibold uppercase tracking-wider text-[#4A4A4A]">
              Date
            </label>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setQuickDate(0)}
                className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-black/[0.05] hover:bg-black/[0.1] text-[#4A4A4A]"
              >
                Today
              </button>
              <button
                type="button"
                onClick={() => setQuickDate(1)}
                className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-black/[0.05] hover:bg-black/[0.1] text-[#4A4A4A]"
              >
                Yesterday
              </button>
              <button
                type="button"
                onClick={() => setQuickDate(2)}
                className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-black/[0.05] hover:bg-black/[0.1] text-[#4A4A4A]"
              >
                -2d
              </button>
            </div>
          </div>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
            className="w-full h-11 px-3.5 rounded-xl bg-[#F8F8F7] border border-black/[0.08] focus:border-[#AD314D] focus:bg-white text-sm font-medium text-[#222222] transition-colors outline-none"
          />
        </div>

        {/* Duration */}
        <div className="sm:col-span-3">
          <label className="block text-xs font-semibold uppercase tracking-wider text-[#4A4A4A] mb-1.5">
            Duration (mins)
          </label>
          <div className="relative">
            <input
              type="number"
              min={1}
              max={360}
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
              required
              className="w-full h-11 pl-3.5 pr-9 rounded-xl bg-[#F8F8F7] border border-black/[0.08] focus:border-[#AD314D] focus:bg-white text-sm font-medium text-[#222222] transition-colors outline-none"
            />
            <Clock className="w-4 h-4 text-[#4A4A4A] absolute right-3 top-3.5 pointer-events-none" />
          </div>
        </div>
      </div>

      {/* Gym Rest Timer Widget */}
      <div className="mb-6 p-4 rounded-xl bg-[#F4F4F2] border border-black/[0.05] flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-[#E3E3E0] flex items-center justify-center text-[#AD314D]">
            <Timer className="w-4 h-4" />
          </div>
          <div>
            <div className="text-xs font-semibold text-[#222222] flex items-center gap-1.5">
              <span>Rest Timer:</span>
              <span
                className={`text-sm font-bold ${
                  isTimerActive ? "text-[#AD314D]" : "text-[#4A4A4A]"
                }`}
              >
                {Math.floor(restSeconds / 60)}:
                {(restSeconds % 60).toString().padStart(2, "0")}
              </span>
            </div>
            <p className="text-[11px] text-[#4A4A4A]">
              Tap interval to countdown between heavy sets
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          {[60, 90, 120, 180].map((sec) => (
            <button
              key={sec}
              type="button"
              onClick={() => startRestTimer(sec)}
              className="px-2.5 py-1 text-xs font-medium rounded-lg bg-white hover:bg-[#ECECEB] text-[#222222] border border-black/[0.06] transition-colors"
            >
              {sec}s
            </button>
          ))}
          {isTimerActive && (
            <button
              type="button"
              onClick={() => {
                setIsTimerActive(false);
                setRestSeconds(0);
              }}
              className="p-1 text-xs rounded-lg bg-red-100 text-red-700 hover:bg-red-200 transition-colors"
              title="Reset Timer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Exercises Section Header & Format Toggle */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 mb-4 border-b border-black/[0.06]">
        <div className="flex items-center gap-2">
          <h3 className="text-xs font-bold uppercase tracking-wider text-[#4A4A4A]">
            Exercises &amp; Work Sets ({exercises.length})
          </h3>
        </div>

        {/* View mode toggle */}
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-[#4A4A4A] font-medium">Input Format:</span>
          <div className="flex items-center p-1 rounded-xl bg-[#ECECEB] border border-black/[0.04]">
            <button
              type="button"
              onClick={() => setViewMode("table")}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                viewMode === "table"
                  ? "bg-white text-[#222222] shadow-sm"
                  : "text-[#4A4A4A] hover:text-[#222222]"
              }`}
            >
              <TableIcon className="w-3.5 h-3.5 text-[#AD314D]" />
              <span>Table (Excel Grid)</span>
            </button>

            <button
              type="button"
              onClick={() => setViewMode("cards")}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                viewMode === "cards"
                  ? "bg-white text-[#222222] shadow-sm"
                  : "text-[#4A4A4A] hover:text-[#222222]"
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5 text-[#AD314D]" />
              <span>Cards (One-by-One)</span>
            </button>
          </div>
        </div>
      </div>

      {/* ================= TABLE VIEW (Dynamic column count supporting all sets) ================= */}
      {viewMode === "table" && (
        <div className="mb-6 overflow-x-auto rounded-xl border border-black/[0.08] shadow-sm">
          <table className="w-full text-left text-xs border-collapse bg-white min-w-[760px]">
            <thead>
              <tr className="bg-[#F8F8F7] border-b border-black/[0.06] text-[#4A4A4A] font-bold text-[11px]">
                <th className="py-2.5 px-3 w-10">#</th>
                <th className="py-2.5 px-3 min-w-[180px]">Exercise Movement</th>
                {Array.from({ length: maxSetsInSession }, (_, i) => (
                  <th key={i} className="py-2.5 px-2 text-center min-w-[102px]">
                    Set {i + 1} ({unit})
                  </th>
                ))}
                <th className="py-2.5 px-2 text-center w-24">Actions</th>
                <th className="py-2.5 px-3 text-right min-w-[90px]">Vol ({unit})</th>
                <th className="py-2.5 px-2 w-10 text-center"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/[0.05]">
              {exercises.map((ex, exIdx) => {
                const exVol = ex.sets.reduce(
                  (acc, s) => acc + (Number(s.weight) || 0) * (Number(s.reps) || 0),
                  0
                );

                return (
                  <tr key={ex.id} className="hover:bg-[#FCFCFB] transition-colors">
                    <td className="py-2.5 px-3 font-bold text-[#4A4A4A]">{exIdx + 1}</td>

                    {/* Exercise Name & Muscle */}
                    <td className="py-2.5 px-3">
                      <div className="font-bold text-xs text-[#222222]">{ex.exerciseName}</div>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <span className="text-[10px] text-[#AD314D] font-medium">
                          {ex.muscleGroup}
                        </span>
                        <select
                          value={ex.equipmentType || "barbell"}
                          onChange={(e) => handleUpdateEquipmentType(ex.id, e.target.value as EquipmentType)}
                          className="bg-[#F4F4F2] border border-black/[0.08] text-[10px] font-bold text-[#333333] rounded px-1.5 py-0.5 outline-none cursor-pointer"
                          title="Equipment Type"
                        >
                          {Object.entries(EQUIPMENT_LABELS).map(([k, label]) => (
                            <option key={k} value={k}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </td>

                    {/* Dynamic Sets up to maxSetsInSession */}
                    {Array.from({ length: maxSetsInSession }, (_, setIdx) => {
                      const setNum = setIdx + 1;
                      const setObj = ex.sets.find((s) => s.setNumber === setNum);

                      if (setObj) {
                        return (
                          <td key={setNum} className="py-2 px-1 text-center">
                            <div className="flex items-center justify-center gap-1 bg-[#F8F8F7] p-1 rounded-lg border border-black/[0.05]">
                              <input
                                type="number"
                                step={0.5}
                                value={setObj.weight}
                                onChange={(e) =>
                                  handleUpdateSet(
                                    ex.id,
                                    setObj.id,
                                    "weight",
                                    parseFloat(e.target.value) || 0
                                  )
                                }
                                title={`Set ${setNum} Weight (${unit})`}
                                placeholder="Wt"
                                className="w-12 h-7 text-center font-bold text-xs rounded bg-white border border-black/[0.08] outline-none focus:border-[#AD314D]"
                              />
                              <span className="text-[10px] text-[#4A4A4A]">/</span>
                              <input
                                type="number"
                                value={setObj.reps}
                                onChange={(e) =>
                                  handleUpdateSet(
                                    ex.id,
                                    setObj.id,
                                    "reps",
                                    parseInt(e.target.value, 10) || 0
                                  )
                                }
                                title={`Set ${setNum} Reps`}
                                placeholder="Reps"
                                className="w-9 h-7 text-center font-bold text-xs rounded bg-white border border-black/[0.08] outline-none focus:border-[#AD314D]"
                              />
                              <button
                                type="button"
                                onClick={() => handleRemoveSet(ex.id, setObj.id)}
                                className="text-[#999999] hover:text-rose-600 p-0.5 transition-colors"
                                title={`Delete Set ${setNum}`}
                              >
                                <X className="w-2.5 h-2.5" />
                              </button>
                            </div>
                          </td>
                        );
                      } else if (setNum === ex.sets.length + 1) {
                        return (
                          <td key={setNum} className="py-2 px-1 text-center">
                            <button
                              type="button"
                              onClick={() => handleAddSet(ex.id)}
                              className="w-full h-8 rounded-lg border border-dashed border-black/[0.12] hover:border-[#AD314D] hover:bg-[#FBF8F8] text-[10px] font-semibold text-[#4A4A4A] hover:text-[#AD314D] transition-colors flex items-center justify-center gap-0.5"
                              title={`Add Set ${setNum}`}
                            >
                              <Plus className="w-2.5 h-2.5" />
                              <span>Set {setNum}</span>
                            </button>
                          </td>
                        );
                      } else {
                        return (
                          <td key={setNum} className="py-2 px-1 text-center text-[#CCCCCC]">
                            —
                          </td>
                        );
                      }
                    })}

                    {/* Add Set Action Column */}
                    <td className="py-2.5 px-2 text-center">
                      <button
                        type="button"
                        onClick={() => handleAddSet(ex.id)}
                        className="px-2.5 py-1 rounded-md text-[11px] font-semibold bg-[#F0F0EE] hover:bg-[#E4E4E0] text-[#222222] transition-colors"
                      >
                        + Set
                      </button>
                    </td>

                    {/* Movement Volume */}
                    <td className="py-2.5 px-3 text-right font-bold text-xs text-[#222222]">
                      {exVol.toLocaleString()}
                    </td>

                    {/* Delete movement */}
                    <td className="py-2.5 px-2 text-center">
                      <button
                        type="button"
                        onClick={() => handleRemoveExercise(ex.id)}
                        className="p-1 rounded text-[#4A4A4A] hover:text-red-600 hover:bg-red-50 transition-colors"
                        title="Delete movement"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ================= CARDS VIEW ================= */}
      {viewMode === "cards" && (
        <div className="space-y-5 mb-6">
          {exercises.map((ex, exIdx) => (
            <div
              key={ex.id}
              className="p-4 sm:p-5 rounded-[16px] bg-[#F9F9F8] border border-black/[0.06] shadow-sm transition-all"
            >
              {/* Exercise Header */}
              <div className="flex items-center justify-between pb-3 mb-3 border-b border-black/[0.05]">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-black/[0.06] text-[11px] font-bold text-[#222222] flex items-center justify-center">
                    {exIdx + 1}
                  </span>
                  <div>
                    <h4 className="font-semibold text-sm text-[#222222]">{ex.exerciseName}</h4>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <span className="text-[10px] uppercase tracking-wider font-semibold text-[#AD314D] bg-[#AD314D]/10 px-2 py-0.5 rounded-full">
                        {ex.muscleGroup}
                      </span>
                      <select
                        value={ex.equipmentType || "barbell"}
                        onChange={(e) => handleUpdateEquipmentType(ex.id, e.target.value as EquipmentType)}
                        className="bg-white border border-black/[0.1] text-[10px] font-bold text-[#333333] rounded-lg px-2 py-0.5 outline-none cursor-pointer shadow-2xs"
                        title="Equipment Type"
                      >
                        {Object.entries(EQUIPMENT_LABELS).map(([k, label]) => (
                          <option key={k} value={k}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleRemoveExercise(ex.id)}
                  className="p-1.5 text-[#4A4A4A] hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                  title="Remove exercise"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              {/* Set Rows Header */}
              <div className="grid grid-cols-12 gap-2 text-[10px] font-bold uppercase text-[#4A4A4A] mb-2 px-1">
                <div className="col-span-1 text-center">Set</div>
                <div className="col-span-5 sm:col-span-5">Weight ({unit})</div>
                <div className="col-span-5 sm:col-span-4">Reps</div>
                <div className="hidden sm:block sm:col-span-2">RPE</div>
                <div className="col-span-1 sm:col-span-1 text-right"></div>
              </div>

              {/* Sets List */}
              <div className="space-y-2">
                {ex.sets.map((s) => {
                  return (
                    <div
                      key={s.id}
                      className="grid grid-cols-12 gap-2 items-center bg-white p-2 sm:p-2.5 rounded-xl border border-black/[0.04] shadow-[0_1px_3px_rgba(0,0,0,0.02)]"
                    >
                      <div className="col-span-1 text-center font-bold text-xs text-[#4A4A4A]">
                        {s.setNumber}
                      </div>

                      {/* Weight input + quick adjust buttons */}
                      <div className="col-span-5 sm:col-span-5 flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleDelta(ex.id, s.id, "weight", -2.5)}
                          className="w-7 h-9 rounded-lg bg-[#ECECEB] hover:bg-[#E0E0DE] text-[#222222] font-bold text-xs flex items-center justify-center transition-colors"
                        >
                          -
                        </button>
                        <input
                          type="number"
                          step={0.5}
                          value={s.weight}
                          onChange={(e) =>
                            handleUpdateSet(
                              ex.id,
                              s.id,
                              "weight",
                              parseFloat(e.target.value) || 0
                            )
                          }
                          className="w-full min-w-0 h-9 px-2 text-center font-semibold text-sm rounded-lg bg-[#F8F8F7] border border-black/[0.08] focus:border-[#AD314D] outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => handleDelta(ex.id, s.id, "weight", 2.5)}
                          className="w-7 h-9 rounded-lg bg-[#ECECEB] hover:bg-[#E0E0DE] text-[#222222] font-bold text-xs flex items-center justify-center transition-colors"
                        >
                          +
                        </button>
                      </div>

                      {/* Reps input + quick adjust buttons */}
                      <div className="col-span-5 sm:col-span-4 flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleDelta(ex.id, s.id, "reps", -1)}
                          className="w-7 h-9 rounded-lg bg-[#ECECEB] hover:bg-[#E0E0DE] text-[#222222] font-bold text-xs flex items-center justify-center transition-colors"
                        >
                          -
                        </button>
                        <input
                          type="number"
                          value={s.reps}
                          onChange={(e) =>
                            handleUpdateSet(
                              ex.id,
                              s.id,
                              "reps",
                              parseInt(e.target.value, 10) || 0
                            )
                          }
                          className="w-full min-w-0 h-9 px-2 text-center font-semibold text-sm rounded-lg bg-[#F8F8F7] border border-black/[0.08] focus:border-[#AD314D] outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => handleDelta(ex.id, s.id, "reps", 1)}
                          className="w-7 h-9 rounded-lg bg-[#ECECEB] hover:bg-[#E0E0DE] text-[#222222] font-bold text-xs flex items-center justify-center transition-colors"
                        >
                          +
                        </button>
                      </div>

                      {/* RPE Selector */}
                      <div className="hidden sm:block sm:col-span-2">
                        <select
                          value={s.rpe || 8}
                          onChange={(e) =>
                            handleUpdateSet(ex.id, s.id, "rpe", parseFloat(e.target.value))
                          }
                          className="w-full h-9 px-2 rounded-lg bg-[#F8F8F7] border border-black/[0.08] text-xs font-medium text-[#222222] outline-none"
                        >
                          {[6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10].map((val) => (
                            <option key={val} value={val}>
                              @{val}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Delete set action */}
                      <div className="col-span-1 sm:col-span-1 flex items-center justify-end">
                        <button
                          type="button"
                          onClick={() => handleRemoveSet(ex.id, s.id)}
                          className="p-1.5 text-[#4A4A4A] hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors"
                          title="Remove set"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Add Set button */}
              <div className="mt-3 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => handleAddSet(ex.id)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[#EAEAE8] hover:bg-[#DFDFDC] text-[#222222] transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Set</span>
                </button>

                <div className="text-[11px] text-[#4A4A4A]">
                  Movement Volume:{" "}
                  <span className="font-semibold text-[#222222]">
                    {ex.sets
                      .reduce((sum, s) => sum + s.weight * s.reps, 0)
                      .toLocaleString()}{" "}
                    {unit}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* QUICK ADD EXERCISES CONTROLS */}
      <div className="p-4 rounded-2xl bg-[#F4F4F2] border border-dashed border-black/[0.12] space-y-3 mb-6">
        <div className="text-xs font-bold text-[#222222] flex items-center gap-1.5">
          <Dumbbell className="w-4 h-4 text-[#AD314D]" />
          <span>Add Exercises to Session</span>
        </div>

        {/* Free text input to quickly add any movement */}
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={quickAddExerciseName}
            onChange={(e) => setQuickAddExerciseName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleQuickAddCustomExercise();
              }
            }}
            placeholder="Type any exercise name (e.g. Incline Bench Press, Leg Curl)..."
            className="flex-1 h-10 px-3.5 rounded-xl bg-white border border-black/[0.1] text-xs font-semibold text-[#222222] outline-none focus:border-[#AD314D]"
          />
          <button
            type="button"
            onClick={handleQuickAddCustomExercise}
            className="h-10 px-4 rounded-xl bg-[#AD314D] hover:bg-[#92263F] text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-colors shadow-xs shrink-0 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add Exercise</span>
          </button>
        </div>

        {/* Or choose from catalog dropdown */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2 border-t border-black/[0.06]">
          <div className="flex-1 flex items-center gap-2">
            <select
              value={selectedCatalogExercise}
              onChange={(e) => setSelectedCatalogExercise(e.target.value)}
              className="flex-1 h-10 px-3 rounded-xl bg-white border border-black/[0.08] text-xs font-medium text-[#222222] outline-none"
            >
              {fullExerciseCatalog.map((cat) => (
                <option key={cat.name} value={cat.name}>
                  {cat.name} ({cat.muscleGroup}) {cat.isCustom ? "★ Custom" : ""}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={handleAddCatalogExercise}
              className="h-10 px-4 rounded-xl bg-[#222222] hover:bg-[#333333] text-white font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap shadow-xs cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Catalog Add</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => setIsAddingCustomExercise(!isAddingCustomExercise)}
            className="h-10 px-3.5 rounded-xl bg-white hover:bg-[#ECECEB] border border-black/[0.08] text-xs font-semibold text-[#AD314D] flex items-center justify-center gap-1.5 transition-colors shadow-xs cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5 text-[#AD314D]" />
            <span>+ Create Custom Exercise</span>
          </button>
        </div>

        {/* Inline custom exercise creation modal */}
        {isAddingCustomExercise && (
          <div className="p-4 rounded-xl bg-white border border-[#AD314D]/30 shadow-sm mt-3 animate-fadeIn">
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-bold text-xs text-[#222222]">Create New Custom Exercise</h4>
              <button
                type="button"
                onClick={() => setIsAddingCustomExercise(false)}
                className="text-xs text-[#4A4A4A] hover:text-[#222222]"
              >
                Cancel
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[10px] font-semibold text-[#4A4A4A] mb-1">
                  Exercise Name
                </label>
                <input
                  type="text"
                  value={newCustomName}
                  onChange={(e) => {
                    const val = e.target.value;
                    setNewCustomName(val);
                    if (val.trim()) {
                      setNewCustomMuscle(aiMatchBodypart(val));
                    }
                  }}
                  placeholder="e.g. Bulgarian Split Squat"
                  className="w-full h-9 px-3 rounded-lg bg-[#F8F8F7] border border-black/[0.08] text-xs outline-none focus:border-[#AD314D]"
                  required
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-[10px] font-semibold text-[#4A4A4A]">
                    Muscle Group
                  </label>
                  {newCustomName.trim() && (
                    <span className="text-[9px] font-bold text-[#AD314D] flex items-center gap-0.5">
                      <Sparkles className="w-2.5 h-2.5" /> Auto-matched
                    </span>
                  )}
                </div>
                <select
                  value={newCustomMuscle}
                  onChange={(e) => setNewCustomMuscle(e.target.value as MuscleGroup)}
                  className="w-full h-9 px-2 rounded-lg bg-[#F8F8F7] border border-black/[0.08] text-xs outline-none"
                >
                  <option value="Arms">Arms (Biceps, Triceps)</option>
                  <option value="Chest">Chest (Pecs, Bench)</option>
                  <option value="Back">Back (Lats, Rows)</option>
                  <option value="Legs">Legs (Quads, Hamstrings, Glutes)</option>
                  <option value="Shoulders">Shoulders (Delts, OHP)</option>
                  <option value="Core">Core (Abs)</option>
                </select>
              </div>

              <div className="flex items-end">
                <button
                  type="button"
                  onClick={handleSaveCustomExercise}
                  className="w-full h-9 rounded-lg bg-[#AD314D] hover:bg-[#942740] text-white font-semibold text-xs shadow-sm transition-colors cursor-pointer"
                >
                  Save &amp; Add Exercise
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Session Notes */}
      <div className="mb-8">
        <label className="block text-xs font-semibold uppercase tracking-wider text-[#4A4A4A] mb-1.5">
          Workout Notes &amp; Observations
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          placeholder="e.g. Felt energized today; smooth pulldown mechanics. Completed all planned working sets."
          className="w-full p-3 rounded-xl bg-[#F8F8F7] border border-black/[0.08] focus:border-[#AD314D] focus:bg-white text-xs font-medium text-[#222222] outline-none transition-colors"
        />
      </div>

      {/* Bottom Actions */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-5 border-t border-black/[0.06]">
        <div className="text-xs text-[#4A4A4A]">
          Saves directly to your training history and updates volume charts.
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 sm:flex-none px-5 py-3 rounded-xl bg-[#ECECEB] hover:bg-[#E0E0DE] text-[#222222] font-medium text-xs transition-colors cursor-pointer"
            >
              Cancel
            </button>
          )}

          <button
            type="submit"
            className="flex-1 sm:flex-none px-7 py-3 rounded-xl bg-[#AD314D] hover:bg-[#942740] active:scale-[0.99] text-white font-semibold text-sm shadow-[0_4px_14px_rgba(173,49,77,0.3)] flex items-center justify-center gap-2 transition-all cursor-pointer"
          >
            <Check className="w-4 h-4" />
            <span>Save Workout</span>
          </button>
        </div>
      </div>

      {/* ================= COMPACT FLOATING REST TIMER (Persists While Scrolling) ================= */}
      {!isFloatingTimerDismissed && (
        <div className="fixed bottom-6 right-6 z-40 flex flex-col items-end gap-2 pointer-events-auto">
          <div
            className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-2xl shadow-xl border backdrop-blur-md transition-all ${
              isTimerActive
                ? "bg-[#1e2230]/95 border-rose-500/40 text-white shadow-rose-950/30 ring-2 ring-rose-500/20"
                : restSeconds > 0
                ? "bg-white/95 border-black/10 text-[#222222]"
                : "bg-white/95 border-black/10 text-[#4A4A4A] hover:border-black/20"
            }`}
          >
            <div
              className="flex items-center gap-2 cursor-pointer"
              onClick={() => setIsTimerActive(!isTimerActive)}
              title={isTimerActive ? "Click to pause timer" : "Click to start/resume timer"}
            >
              <div
                className={`w-7 h-7 rounded-xl flex items-center justify-center ${
                  isTimerActive
                    ? "bg-[#AD314D] text-white animate-pulse"
                    : "bg-neutral-100 text-[#4A4A4A]"
                }`}
              >
                <Timer className="w-4 h-4" />
              </div>
              <div className="flex flex-col">
                <span className="text-[9px] font-bold uppercase tracking-wider opacity-70">
                  {isTimerActive ? "Resting" : restSeconds > 0 ? "Paused" : "Rest Timer"}
                </span>
                <span className="text-sm font-black font-mono leading-none tracking-tight">
                  {Math.floor(restSeconds / 60)}:{(restSeconds % 60).toString().padStart(2, "0")}
                </span>
              </div>
            </div>

            <div className="h-6 w-px bg-black/10 mx-0.5" />

            {/* Quick presets & controls */}
            <div className="flex items-center gap-1">
              {restSeconds === 0 ? (
                <>
                  <button
                    type="button"
                    onClick={() => startRestTimer(60)}
                    className="px-2 py-1 text-[11px] font-bold rounded-lg bg-neutral-100 hover:bg-neutral-200 text-[#222222] transition-colors"
                  >
                    60s
                  </button>
                  <button
                    type="button"
                    onClick={() => startRestTimer(90)}
                    className="px-2 py-1 text-[11px] font-bold rounded-lg bg-neutral-100 hover:bg-neutral-200 text-[#222222] transition-colors"
                  >
                    90s
                  </button>
                  <button
                    type="button"
                    onClick={() => startRestTimer(120)}
                    className="px-2 py-1 text-[11px] font-bold rounded-lg bg-neutral-100 hover:bg-neutral-200 text-[#222222] transition-colors"
                  >
                    120s
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => setRestSeconds((prev) => prev + 30)}
                    className="px-2 py-1 text-[11px] font-bold rounded-lg bg-neutral-100 hover:bg-neutral-200 text-[#222222] transition-colors"
                    title="Add 30 seconds"
                  >
                    +30s
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsTimerActive(!isTimerActive)}
                    className="p-1.5 text-xs rounded-lg bg-neutral-100 hover:bg-neutral-200 text-[#222222] transition-colors"
                    title={isTimerActive ? "Pause" : "Resume"}
                  >
                    {isTimerActive ? "⏸" : "▶"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsTimerActive(false);
                      setRestSeconds(0);
                    }}
                    className="p-1.5 text-xs rounded-lg bg-red-100 hover:bg-red-200 text-red-700 transition-colors"
                    title="Reset Timer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                </>
              )}

              {/* Close / Dismiss Floating Timer */}
              <button
                type="button"
                onClick={() => setIsFloatingTimerDismissed(true)}
                className="p-1 rounded-lg text-neutral-400 hover:text-neutral-800 hover:bg-neutral-100 transition-colors ml-0.5"
                title="Dismiss rest timer bar"
                aria-label="Dismiss rest timer bar"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mini-pill to restore dismissed floating timer */}
      {isFloatingTimerDismissed && restSeconds > 0 && (
        <div className="fixed bottom-6 right-6 z-40 pointer-events-auto">
          <button
            type="button"
            onClick={() => setIsFloatingTimerDismissed(false)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-neutral-900 text-white shadow-lg text-xs font-semibold hover:bg-neutral-800 transition-all cursor-pointer"
            title="Click to restore rest timer bar"
          >
            <Timer className="w-3.5 h-3.5 text-[#AD314D]" />
            <span>{Math.floor(restSeconds / 60)}:{(restSeconds % 60).toString().padStart(2, "0")}</span>
          </button>
        </div>
      )}
    </form>
  );
};
