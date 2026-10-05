import React, { useState, useEffect } from "react";
import {
  Calendar,
  Clock,
  Play,
  CheckCircle2,
  ChevronRight,
  ChevronLeft,
  Sparkles,
  ArrowRight,
  CalendarDays,
  Dumbbell,
  Building2,
  X
} from "lucide-react";
import {
  WeeklyMatrixPlan,
  MatrixDayCell,
  DayOfWeek,
  WorkoutPlan,
  WorkoutSession,
  Gym
} from "../types";
import {
  DAYS_OF_WEEK,
  getTodayDateStr,
  parseLocalDate,
  formatLocalDateISO,
  convertDayCellToWorkoutPlan,
  CANONICAL_PROGRAM_START_DATE
} from "../utils/fitnessData";
import { getWeekStartMonday, getDayOfWeekName, getDifferenceInDays, isValidDateStr } from "../utils/dateUtils";
import { resolveSession, cleanNumber, ResolvedSession } from "../utils/sessionResolver";
import { getStoredGyms, addOrUpdateGym, getWorkoutDraft, saveWorkoutDraft } from "../utils/userStorage";

interface DashboardScheduledSessionCardProps {
  matrixPlans: WeeklyMatrixPlan[];
  currentProgramName: string;
  completedDaysRecord: Record<string, boolean>;
  unit: "kg" | "lbs";
  workouts?: WorkoutSession[];
  userId?: string;
  onStartSession: (plan: WorkoutPlan) => void;
  onSaveDayCompleted: (weekNumber: number, day: DayOfWeek) => void;
  onNavigateTab: (tab: string) => void;
  onOpenCompletedWorkout?: (session: WorkoutSession) => void;
  onUpdateMatrixPlans?: (plans: WeeklyMatrixPlan[], toastMsg?: string) => void;
  onUpdateWorkout?: (workout: WorkoutSession) => void;
  isDarkMode?: boolean;
}

interface UpcomingWorkoutMatch {
  date: string;
  daysAway: number;
  weekNumber: number;
  dayName: DayOfWeek;
  plannedDay: MatrixDayCell;
  formattedDate: string;
}

export const DashboardScheduledSessionCard: React.FC<DashboardScheduledSessionCardProps> = ({
  matrixPlans,
  currentProgramName,
  completedDaysRecord,
  unit,
  workouts = [],
  userId,
  onStartSession,
  onSaveDayCompleted,
  onNavigateTab,
  onOpenCompletedWorkout,
  onUpdateMatrixPlans,
  onUpdateWorkout,
  isDarkMode = false
}) => {
  const [selectedDateStr, setSelectedDateStr] = useState<string>(getTodayDateStr);

  // Gyms state
  const [gyms, setGyms] = useState<Gym[]>(() => getStoredGyms(userId));
  const [isGymModalOpen, setIsGymModalOpen] = useState(false);
  const [newGymName, setNewGymName] = useState("");
  const [newGymLocation, setNewGymLocation] = useState("");

  useEffect(() => {
    const handleGymsUpdate = () => {
      setGyms(getStoredGyms(userId));
    };
    handleGymsUpdate();
    window.addEventListener("gyms-updated", handleGymsUpdate);
    window.addEventListener("storage", handleGymsUpdate);
    return () => {
      window.removeEventListener("gyms-updated", handleGymsUpdate);
      window.removeEventListener("storage", handleGymsUpdate);
    };
  }, [userId]);

  const todayStr = getTodayDateStr();
  const isTargetToday = selectedDateStr === todayStr;

  // Selected Date Object
  const selectedDateObj = parseLocalDate(selectedDateStr);
  const isValidDate = !isNaN(selectedDateObj.getTime());

  const targetDayName: DayOfWeek = isValidDate
    ? getDayOfWeekName(selectedDateStr)
    : "Monday";

  const formattedSelectedDate = isValidDate
    ? selectedDateObj.toLocaleDateString(undefined, {
        weekday: "long",
        month: "short",
        day: "numeric",
        year: "numeric"
      })
    : selectedDateStr;

  // Cycle start base Monday
  const cycleBaseMonday = getWeekStartMonday(
    matrixPlans[0]?.startDate ||
    matrixPlans[0]?.days?.Monday?.date ||
    CANONICAL_PROGRAM_START_DATE
  );
  const diffDaysFromCycleStart = isValidDate ? getDifferenceInDays(cycleBaseMonday, selectedDateStr) : 0;
  const calcWeekFromCycle = diffDaysFromCycleStart >= 0 ? Math.floor(diffDaysFromCycleStart / 7) + 1 : 1;

  // Search matrixPlans for selectedDateStr - cycle week calculation is authoritative
  let selectedWeekNumber = calcWeekFromCycle;
  let selectedDayName: DayOfWeek = targetDayName;
  let selectedPlannedDay: MatrixDayCell | undefined = undefined;

  // 1. Direct cycle week & day match (authoritative for current calendar position)
  const cycleWeekPlan = matrixPlans.find((p) => p.weekNumber === calcWeekFromCycle);
  if (cycleWeekPlan && cycleWeekPlan.days?.[targetDayName]) {
    selectedWeekNumber = calcWeekFromCycle;
    selectedDayName = targetDayName;
    selectedPlannedDay = cycleWeekPlan.days[targetDayName];
  } else {
    // 2. Exact date match fallback across all matrixPlans
    for (const wp of matrixPlans) {
      for (const dKey of DAYS_OF_WEEK) {
        const cell = wp.days?.[dKey];
        if (cell && cell.date === selectedDateStr) {
          selectedWeekNumber = wp.weekNumber;
          selectedDayName = dKey;
          selectedPlannedDay = cell;
          break;
        }
      }
      if (selectedPlannedDay) break;
    }
  }

  // Canonical session resolution (Completed > Active > Planned)
  const resolvedSession: ResolvedSession = resolveSession(
    {
      date: selectedDateStr,
      weekNumber: selectedWeekNumber,
      dayOfWeek: selectedDayName,
      dayKey: `w${selectedWeekNumber}-${selectedDayName}`
    },
    {
      workouts,
      matrixPlans,
      completedDaysRecord,
      userId
    }
  );

  const isSelectedSessionCompleted = resolvedSession.isCompleted;

  // Helper to find the Next Upcoming Workout from selectedDateStr
  const findNextUpcomingWorkout = (fromDateStr: string): UpcomingWorkoutMatch | null => {
    const baseObj = parseLocalDate(fromDateStr);
    if (isNaN(baseObj.getTime())) return null;

    for (let offset = 1; offset <= 90; offset++) {
      const checkObj = new Date(baseObj.getFullYear(), baseObj.getMonth(), baseObj.getDate() + offset);
      const checkStr = formatLocalDateISO(checkObj);

      // Exact match in matrix plans
      for (const wp of matrixPlans) {
        for (const dKey of DAYS_OF_WEEK) {
          const cell = wp.days?.[dKey];
          if (cell && cell.date === checkStr) {
            if (!cell.isRestDay && cell.exercises && cell.exercises.length > 0) {
              return {
                date: checkStr,
                daysAway: offset,
                weekNumber: wp.weekNumber,
                dayName: dKey,
                plannedDay: cell,
                formattedDate: checkObj.toLocaleDateString(undefined, {
                  weekday: "short",
                  month: "short",
                  day: "numeric"
                })
              };
            }
          }
        }
      }

      // Offset calculation match
      const offsetDiff = getDifferenceInDays(cycleBaseMonday, checkStr);
      if (offsetDiff >= 0) {
        const calcWeek = Math.floor(offsetDiff / 7) + 1;
        const dName = getDayOfWeekName(checkStr);
        const wp = matrixPlans.find((p) => p.weekNumber === calcWeek);
        const cell = wp?.days?.[dName];
        if (
          cell &&
          !cell.isRestDay &&
          cell.exercises &&
          cell.exercises.length > 0
        ) {
          return {
            date: checkStr,
            daysAway: offset,
            weekNumber: calcWeek,
            dayName: dName,
            plannedDay: cell,
            formattedDate: checkObj.toLocaleDateString(undefined, {
              weekday: "short",
              month: "short",
              day: "numeric"
            })
          };
        }
      }
    }
    return null;
  };

  const isRestOrEmpty =
    resolvedSession.isRest ||
    (resolvedSession.status === "empty" &&
      (!selectedPlannedDay ||
        selectedPlannedDay.isRestDay ||
        !selectedPlannedDay.exercises ||
        selectedPlannedDay.exercises.length === 0));

  const nextUpcomingWorkout = isRestOrEmpty
    ? findNextUpcomingWorkout(selectedDateStr)
    : null;

  // Generate 7-day strip around selectedDate
  const generate7DayStrip = () => {
    if (!isValidDate) return [];
    // Align to Monday of selected date's week
    const currentDayIdx = selectedDateObj.getDay(); // 0 Sun, 1 Mon...
    const diffToMon = currentDayIdx === 0 ? -6 : 1 - currentDayIdx;
    const monObj = new Date(selectedDateObj.getFullYear(), selectedDateObj.getMonth(), selectedDateObj.getDate() + diffToMon);

    const strip = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(monObj.getFullYear(), monObj.getMonth(), monObj.getDate() + i);
      const iso = formatLocalDateISO(d);
      const dayName = DAYS_OF_WEEK[i];

      const stripDiff = getDifferenceInDays(cycleBaseMonday, iso);
      const stripWeekNum = stripDiff >= 0 ? Math.floor(stripDiff / 7) + 1 : 1;

      // Resolve each day's authoritative status
      const dayResolved = resolveSession(
        {
          date: iso,
          weekNumber: stripWeekNum,
          dayOfWeek: dayName,
          dayKey: `w${stripWeekNum}-${dayName}`
        },
        {
          workouts,
          matrixPlans,
          completedDaysRecord,
          userId
        }
      );

      strip.push({
        dateStr: iso,
        dayNum: d.getDate(),
        shortDay: dayName.substring(0, 3),
        dayName,
        isToday: iso === todayStr,
        isSelected: iso === selectedDateStr,
        isRest: dayResolved.isRest || dayResolved.status === "empty",
        isCompleted: dayResolved.isCompleted,
        isActive: dayResolved.isActive
      });
    }
    return strip;
  };

  const dayStrip = generate7DayStrip();

  const handlePrevDay = () => {
    if (!isValidDate) return;
    const prev = new Date(selectedDateObj);
    prev.setDate(prev.getDate() - 1);
    setSelectedDateStr(formatLocalDateISO(prev));
  };

  const handleNextDay = () => {
    if (!isValidDate) return;
    const next = new Date(selectedDateObj);
    next.setDate(next.getDate() + 1);
    setSelectedDateStr(formatLocalDateISO(next));
  };

  const handleStartWorkout = (cell: MatrixDayCell) => {
    try {
      localStorage.setItem("pulse_diary_target_date", selectedDateStr);
      localStorage.setItem("pulse_diary_target_week", String(selectedWeekNumber));
      localStorage.setItem("pulse_diary_target_day", selectedDayName);
    } catch (e) {}

    if (cell && cell.exercises && cell.exercises.length > 0) {
      const workoutPlan = convertDayCellToWorkoutPlan(
        cell,
        selectedWeekNumber,
        selectedDayName,
        currentProgramName
      );
      workoutPlan.scheduledDate = selectedDateStr;
      onStartSession(workoutPlan);
    } else {
      onNavigateTab("diary");
    }
  };

  const currentGymId =
    selectedPlannedDay?.gymId ||
    resolvedSession.gymId ||
    resolvedSession.completedWorkout?.gymId ||
    resolvedSession.activeDraft?.gymId ||
    "";

  const handleDashboardSelectGym = (newGymId: string) => {
    const gymObj = gyms.find((g) => g.id === newGymId);
    if (onUpdateMatrixPlans) {
      const updated = matrixPlans.map((w) => {
        if (w.weekNumber !== selectedWeekNumber) return w;
        const cell = w.days[selectedDayName] || {
          day: selectedDayName,
          workoutTitle: `${selectedDayName} Session`,
          isRestDay: false,
          exercises: []
        };
        return {
          ...w,
          days: {
            ...w.days,
            [selectedDayName]: {
              ...cell,
              gymId: newGymId || undefined,
              gymName: gymObj?.name || undefined
            }
          }
        };
      });
      onUpdateMatrixPlans(updated, `Training gym set to "${gymObj?.name || 'None'}" & synced`);
    }

    if (resolvedSession.completedWorkout && onUpdateWorkout) {
      onUpdateWorkout({
        ...resolvedSession.completedWorkout,
        gymId: newGymId || undefined,
        gymName: gymObj?.name || undefined,
        updatedAt: new Date().toISOString()
      });
    }

    // Also update draft for this day if one exists
    try {
      const dayKey = `w${selectedWeekNumber}-${selectedDayName}`;
      const draft = getWorkoutDraft(userId, dayKey);
      if (draft) {
        saveWorkoutDraft(userId, {
          ...draft,
          gymId: newGymId || undefined,
          gymName: gymObj?.name || undefined
        });
      }
    } catch {}
  };

  const handleCreateGym = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGymName.trim()) return;
    const newGym: Gym = {
      id: `gym-${Date.now()}`,
      name: newGymName.trim(),
      location: newGymLocation.trim() || undefined,
      isDefault: gyms.length === 0,
      machines: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    const updated = addOrUpdateGym(userId, newGym);
    setGyms(updated);
    handleDashboardSelectGym(newGym.id);
    setNewGymName("");
    setNewGymLocation("");
    setIsGymModalOpen(false);
  };

  return (
    <div
      className={`p-5 sm:p-6 rounded-3xl border shadow-xs space-y-5 transition-all ${
        isDarkMode
          ? "bg-[#12141c] border-slate-800 text-slate-100"
          : "bg-white border-black/[0.08] text-[#222222]"
      }`}
    >
      {/* HEADER BAR & DATE PICKER CONTROLS */}
      <div
        className={`flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b ${
          isDarkMode ? "border-slate-800" : "border-black/[0.06]"
        }`}
      >
        <div className="flex items-start sm:items-center gap-3">
          <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-[#AD314D] text-white flex items-center justify-center shadow-xs shrink-0">
            <Calendar className="w-5 h-5 sm:w-6 sm:h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className={`text-[10px] uppercase font-bold tracking-wider px-2.5 py-0.5 rounded-full border ${
                  isDarkMode
                    ? "bg-rose-950/40 border-rose-900 text-rose-300"
                    : "bg-rose-50 border-rose-200 text-[#AD314D]"
                }`}
              >
                {currentProgramName}
              </span>
              <span
                className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${
                  isDarkMode
                    ? "bg-slate-800 border-slate-700 text-slate-300"
                    : "bg-[#F0F0EE] border-black/[0.04] text-[#555555]"
                }`}
              >
                Week {selectedWeekNumber} • {selectedDayName}
              </span>
              {isTargetToday ? (
                <span
                  className={`text-[10px] font-extrabold uppercase px-2.5 py-0.5 rounded-full border ${
                    isDarkMode
                      ? "bg-emerald-950/60 border-emerald-800 text-emerald-300"
                      : "bg-emerald-50 border-emerald-200 text-emerald-800"
                  }`}
                >
                  Today
                </span>
              ) : (
                <span
                  className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${
                    isDarkMode
                      ? "bg-amber-950/60 border-amber-800 text-amber-300"
                      : "bg-amber-50 border-amber-200 text-amber-900"
                  }`}
                >
                  Selected Date View
                </span>
              )}
            </div>
            <h3 className="text-base sm:text-lg font-extrabold mt-1 flex items-center gap-2">
              <span className={
                resolvedSession.isCompleted
                  ? "text-emerald-700 font-extrabold"
                  : resolvedSession.isActive
                  ? "text-amber-600 font-extrabold"
                  : isDarkMode
                  ? "text-slate-100"
                  : "text-[#18181b]"
              }>
                {resolvedSession.isCompleted
                  ? "Completed Session:"
                  : resolvedSession.isActive
                  ? "In-Progress Session:"
                  : "Planned Session:"}
              </span>
              <span className={isDarkMode ? "text-rose-400" : "text-[#AD314D]"}>{formattedSelectedDate}</span>
            </h3>
          </div>
        </div>

        {/* DATE PICKER & QUICK CONTROLS */}
        <div className="flex items-center gap-2 flex-wrap self-start lg:self-auto">
          {/* Quick Date Picker Selector */}
          <div
            className={`flex items-center gap-1.5 p-1 rounded-2xl border ${
              isDarkMode
                ? "bg-slate-800/80 border-slate-700"
                : "bg-[#FAF9F8] border-black/[0.08]"
            }`}
          >
            <button
              type="button"
              onClick={handlePrevDay}
              title="Previous Day"
              className={`p-1.5 rounded-xl transition-colors cursor-pointer ${
                isDarkMode
                  ? "hover:bg-slate-700 text-slate-200"
                  : "hover:bg-white text-[#4A4A4A]"
              }`}
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <div className="relative flex items-center">
              <input
                type="date"
                value={selectedDateStr}
                onChange={(e) => {
                  if (e.target.value) setSelectedDateStr(e.target.value);
                }}
                className={`text-xs font-bold bg-transparent px-2 py-1 focus:outline-none cursor-pointer ${
                  isDarkMode ? "text-slate-100" : "text-[#222222]"
                }`}
              />
            </div>

            <button
              type="button"
              onClick={handleNextDay}
              title="Next Day"
              className={`p-1.5 rounded-xl transition-colors cursor-pointer ${
                isDarkMode
                  ? "hover:bg-slate-700 text-slate-200"
                  : "hover:bg-white text-[#4A4A4A]"
              }`}
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {!isTargetToday && (
            <button
              type="button"
              onClick={() => setSelectedDateStr(todayStr)}
              className="px-3 py-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold shadow-xs transition-all flex items-center gap-1 cursor-pointer"
            >
              <CalendarDays className="w-3.5 h-3.5" />
              <span>Jump to Today</span>
            </button>
          )}

          {/* Action buttons matching authoritative state */}
          {resolvedSession.isCompleted ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  const targetSession = resolvedSession.completedWorkout || {
                    id: `sess-${selectedDateStr}`,
                    date: selectedDateStr,
                    weekNumber: resolvedSession.weekNumber,
                    dayOfWeek: resolvedSession.dayOfWeek,
                    title: resolvedSession.title || "Completed Workout",
                    durationMinutes: 60,
                    exercises: []
                  };
                  if (onOpenCompletedWorkout) {
                    onOpenCompletedWorkout(targetSession);
                  } else {
                    onNavigateTab("diary");
                  }
                }}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 active:scale-95 text-white text-xs font-extrabold shadow-xs transition-all cursor-pointer"
              >
                <CheckCircle2 className="w-3.5 h-3.5 text-white" />
                <span>View Completed Log</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  if (selectedPlannedDay) handleStartWorkout(selectedPlannedDay);
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors cursor-pointer ${
                  isDarkMode
                    ? "border-slate-700 hover:bg-slate-800 text-slate-200"
                    : "border-black/[0.1] hover:bg-[#FAF9F8] text-[#222222]"
                }`}
                title="Log another workout for this date"
              >
                Log Again
              </button>
            </div>
          ) : resolvedSession.isActive ? (
            <button
              type="button"
              onClick={() => {
                if (selectedPlannedDay) handleStartWorkout(selectedPlannedDay);
                else onNavigateTab("logger");
              }}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 active:scale-95 text-white text-xs font-extrabold shadow-xs transition-all cursor-pointer"
            >
              <Play className="w-3.5 h-3.5 fill-white" />
              <span>Resume Active Session</span>
            </button>
          ) : !isRestOrEmpty ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => selectedPlannedDay && handleStartWorkout(selectedPlannedDay)}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-[#AD314D] hover:bg-[#8C1E37] active:scale-95 text-white text-xs font-extrabold shadow-xs transition-all cursor-pointer"
              >
                <Play className="w-3.5 h-3.5 fill-white" />
                <span>Start Workout Now</span>
              </button>
              <button
                type="button"
                onClick={() => onSaveDayCompleted(selectedWeekNumber, selectedDayName)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors cursor-pointer ${
                  isDarkMode
                    ? "border-slate-700 hover:bg-slate-800 text-slate-200"
                    : "border-black/[0.1] hover:bg-[#FAF9F8] text-[#222222]"
                }`}
              >
                Mark Completed
              </button>
            </div>
          ) : null}

          <button
            type="button"
            onClick={() => onNavigateTab("matrix")}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
              isDarkMode
                ? "bg-slate-800 hover:bg-slate-700 text-slate-200"
                : "bg-[#F0F0EE] hover:bg-[#E4E4E1] text-[#222222]"
            }`}
          >
            <span>Planner</span>
            <ChevronRight className={`w-3.5 h-3.5 ${isDarkMode ? "text-rose-400" : "text-[#AD314D]"}`} />
          </button>
        </div>
      </div>

      {/* 7-DAY QUICK CHIP STRIP */}
      <div className="flex items-center justify-between gap-1 sm:gap-2 overflow-x-auto pb-1 pt-0.5 no-scrollbar">
        {dayStrip.map((item) => {
          let chipClasses = "";
          if (item.isSelected) {
            chipClasses = "bg-[#AD314D] text-white border-[#AD314D] shadow-sm font-bold scale-[1.02]";
          } else if (item.isToday) {
            chipClasses = isDarkMode
              ? "bg-rose-950/40 border-rose-800 text-rose-300 font-bold"
              : "bg-rose-50 border-rose-300 text-[#AD314D] font-bold";
          } else {
            chipClasses = isDarkMode
              ? "bg-[#1a1d28] border-slate-800 text-slate-200 hover:bg-slate-800"
              : "bg-[#FAF9F8] border-black/[0.06] text-[#222222] hover:bg-[#F4F4F2]";
          }

          return (
            <button
              key={item.dateStr}
              type="button"
              onClick={() => setSelectedDateStr(item.dateStr)}
              className={`flex-1 min-w-[50px] p-2.5 rounded-2xl border text-center transition-all cursor-pointer ${chipClasses}`}
            >
              <div
                className={`text-[10px] uppercase font-bold tracking-wider ${
                  item.isSelected
                    ? "text-rose-100"
                    : isDarkMode
                    ? "text-slate-400"
                    : "text-[#777777]"
                }`}
              >
                {item.shortDay}
              </div>
              <div
                className={`text-sm font-extrabold my-0.5 ${
                  item.isSelected
                    ? "text-white"
                    : isDarkMode
                    ? "text-slate-100"
                    : "text-[#18181b]"
                }`}
              >
                {item.dayNum}
              </div>
              <div className="flex items-center justify-center gap-1 mt-1">
                {item.isCompleted ? (
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${item.isSelected ? "bg-emerald-300" : "bg-emerald-500"}`}
                    title="Completed"
                  />
                ) : !item.isRest ? (
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${item.isSelected ? "bg-white" : "bg-[#AD314D]"}`}
                    title="Workout Day"
                  />
                ) : (
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      item.isSelected ? "bg-rose-200/50" : isDarkMode ? "bg-slate-600" : "bg-neutral-300"
                    }`}
                    title="Rest Day"
                  />
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* WORKOUT DETAILS OR REST DAY + UPCOMING WORKOUT */}
      {isRestOrEmpty ? (
        <div className="space-y-4">
          {/* Rest Day Banner */}
          <div
            className={`p-5 rounded-2xl border flex flex-col sm:flex-row items-center justify-between gap-4 ${
              isDarkMode
                ? "bg-slate-900/60 border-slate-800"
                : "bg-[#FAF9F8] border-black/[0.06]"
            }`}
          >
            <div className="flex items-center gap-3.5 text-center sm:text-left">
              <div
                className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${
                  isDarkMode
                    ? "bg-amber-950/80 text-amber-300"
                    : "bg-amber-50 text-amber-800 border border-amber-200"
                }`}
              >
                <Clock className="w-5 h-5" />
              </div>
              <div>
                <h4
                  className={`font-bold text-sm ${
                    isDarkMode ? "text-slate-100" : "text-[#18181b]"
                  }`}
                >
                  {isTargetToday
                    ? "Scheduled Rest & Recovery Day"
                    : `No Session Scheduled for ${formattedSelectedDate}`}
                </h4>
                <p
                  className={`text-xs mt-0.5 ${
                    isDarkMode ? "text-slate-400" : "text-[#666666]"
                  }`}
                >
                  Prioritize muscle recovery, hydration, active mobility, and quality sleep.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onNavigateTab("diary")}
              className={`px-4 py-2 rounded-xl text-xs font-bold border shrink-0 cursor-pointer transition-colors ${
                isDarkMode
                  ? "bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 border-rose-900"
                  : "bg-rose-50 hover:bg-rose-100 text-[#AD314D] border-rose-200"
              }`}
            >
              Log Session in Diary
            </button>
          </div>

          {/* UPCOMING / NEXT WORKOUT CARD */}
          {nextUpcomingWorkout ? (
            <div
              className={`p-5 rounded-2xl border shadow-2xs space-y-3.5 ${
                isDarkMode
                  ? "bg-slate-900 border-rose-900/60"
                  : "bg-white border-rose-200/90"
              }`}
            >
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <span className="flex items-center gap-1 text-[11px] font-extrabold uppercase tracking-wider px-3 py-1 rounded-full bg-[#AD314D] text-white shadow-xs">
                    <Sparkles className="w-3 h-3 text-amber-300 fill-amber-300" />
                    <span>Next Scheduled Session Preview</span>
                  </span>
                  <span
                    className={`text-xs font-extrabold px-2.5 py-0.5 rounded-full ${
                      isDarkMode
                        ? "text-rose-400 bg-rose-950/60"
                        : "text-[#AD314D] bg-rose-50 border border-rose-200"
                    }`}
                  >
                    {nextUpcomingWorkout.daysAway === 1
                      ? `Starts Tomorrow (${nextUpcomingWorkout.dayName})`
                      : `In ${nextUpcomingWorkout.daysAway} Days (${nextUpcomingWorkout.formattedDate})`}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedDateStr(nextUpcomingWorkout.date)}
                  className={`text-xs font-bold underline cursor-pointer flex items-center gap-1 ${
                    isDarkMode
                      ? "text-slate-300 hover:text-rose-400"
                      : "text-[#222222] hover:text-[#AD314D]"
                  }`}
                >
                  <span>View {nextUpcomingWorkout.dayName} Schedule</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>

              <div
                className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl border ${
                  isDarkMode
                    ? "bg-slate-800 border-slate-700"
                    : "bg-[#FAF9F8] border-black/[0.06]"
                }`}
              >
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full ${
                        isDarkMode
                          ? "bg-rose-950 text-rose-300"
                          : "bg-rose-100 text-[#AD314D]"
                      }`}
                    >
                      Upcoming: Week {nextUpcomingWorkout.weekNumber} • {nextUpcomingWorkout.dayName}
                    </span>
                    <h5
                      className={`font-bold text-sm ${
                        isDarkMode ? "text-slate-100" : "text-[#18181b]"
                      }`}
                    >
                      {nextUpcomingWorkout.plannedDay.workoutTitle}
                    </h5>
                  </div>
                  <p
                    className={`text-xs mt-1 ${
                      isDarkMode ? "text-slate-400" : "text-[#666666]"
                    }`}
                  >
                    Target Muscles:{" "}
                    {Array.isArray(nextUpcomingWorkout.plannedDay.targetMuscleGroup)
                      ? nextUpcomingWorkout.plannedDay.targetMuscleGroup.join(" • ")
                      : nextUpcomingWorkout.plannedDay.targetMuscleGroup || "General Training"}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => handleStartWorkout(nextUpcomingWorkout.plannedDay)}
                  className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#AD314D] hover:bg-[#8C1E37] text-white text-xs font-extrabold shadow-xs transition-all shrink-0 cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5 fill-white" />
                  <span>Start Next Workout Early</span>
                </button>
              </div>

              {/* Preview Next Exercises */}
              {nextUpcomingWorkout.plannedDay.exercises &&
                nextUpcomingWorkout.plannedDay.exercises.length > 0 && (
                  <div className="space-y-1.5">
                    <div
                      className={`text-[11px] font-bold uppercase tracking-wider flex items-center gap-1 ${
                        isDarkMode ? "text-slate-400" : "text-[#555555]"
                      }`}
                    >
                      <Dumbbell className="w-3 h-3 text-[#AD314D]" />
                      <span>Planned Routine Preview ({nextUpcomingWorkout.plannedDay.exercises.length} Exercises):</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                      {nextUpcomingWorkout.plannedDay.exercises.slice(0, 6).map((ex, idx) => (
                        <div
                          key={idx}
                          className={`p-2.5 rounded-xl border text-xs flex justify-between items-center ${
                            isDarkMode
                              ? "bg-slate-800/80 border-slate-700"
                              : "bg-[#FAF9F8] border-black/[0.04]"
                          }`}
                        >
                          <span
                            className={`font-semibold truncate ${
                              isDarkMode ? "text-slate-200" : "text-[#18181b]"
                            }`}
                          >
                            {idx + 1}. {ex.exerciseName}
                          </span>
                          <span
                            className={`font-extrabold shrink-0 ml-1.5 ${
                              isDarkMode ? "text-rose-400" : "text-[#AD314D]"
                            }`}
                          >
                            {ex.targetSets}×{ex.targetReps}
                          </span>
                        </div>
                      ))}
                      {nextUpcomingWorkout.plannedDay.exercises.length > 6 && (
                        <div
                          className={`p-2.5 rounded-xl text-[11px] font-medium flex items-center justify-center ${
                            isDarkMode
                              ? "bg-slate-800/40 text-slate-400"
                              : "bg-neutral-100 text-[#666666]"
                          }`}
                        >
                          +{nextUpcomingWorkout.plannedDay.exercises.length - 6} more exercises planned
                        </div>
                      )}
                    </div>
                  </div>
                )}
            </div>
          ) : (
            <div
              className={`p-4 rounded-2xl border text-xs text-center ${
                isDarkMode
                  ? "bg-slate-900/40 border-slate-800 text-slate-400"
                  : "bg-[#FAF9F8] border-black/[0.04] text-[#666666]"
              }`}
            >
              No future workouts found in current program. Visit Planner to configure your training split.
            </div>
          )}
        </div>
      ) : (
        /* WORKOUT DAY EXERCISES LIST & TABLE (Authoritative Completed > Active > Planned) */
        <div className="space-y-3.5">
          {/* WORKOUT DAY SUMMARY BANNER */}
          <div
            className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl border shadow-2xs ${
              resolvedSession.isCompleted
                ? isDarkMode
                  ? "bg-emerald-950/20 border-emerald-900/60"
                  : "bg-emerald-50/50 border-emerald-200/80"
                : isDarkMode
                ? "bg-[#1a1d28] border-slate-800"
                : "bg-[#FAF9F8] border-black/[0.06]"
            }`}
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 w-full">
              <div>
                <div className="flex items-center gap-2">
                  <h4
                    className={`text-base font-extrabold ${
                      resolvedSession.isCompleted
                        ? isDarkMode
                          ? "text-emerald-300"
                          : "text-emerald-950"
                        : isDarkMode
                        ? "text-slate-100"
                        : "text-[#18181b]"
                    }`}
                  >
                    {resolvedSession.title || selectedPlannedDay?.workoutTitle || "Workout Session"}
                  </h4>
                  {resolvedSession.isCompleted && (
                    <span className="flex items-center gap-1 text-[11px] font-extrabold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Completed Fact</span>
                    </span>
                  )}
                </div>
                <p
                  className={`text-xs font-medium mt-0.5 ${
                    isDarkMode ? "text-slate-400" : "text-[#666666]"
                  }`}
                >
                  Target Muscles:{" "}
                  <span className={isDarkMode ? "text-slate-200" : "text-[#222222]"}>
                    {resolvedSession.targetMuscleGroup}
                  </span>
                  {resolvedSession.isCompleted && resolvedSession.totalVolume > 0 && (
                    <>
                      {" "}• Total Volume:{" "}
                      <strong className={isDarkMode ? "text-emerald-300" : "text-emerald-800"}>
                        {resolvedSession.totalVolume.toLocaleString()} {unit}
                      </strong>
                      {" "}• Completed Sets:{" "}
                      <strong className={isDarkMode ? "text-emerald-300" : "text-emerald-800"}>
                        {resolvedSession.completedSets}
                      </strong>
                    </>
                  )}
                </p>
              </div>

              {/* Gym Selector & Notes */}
              <div className="flex items-center gap-2 flex-wrap self-start sm:self-auto">
                <div
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-semibold shadow-2xs ${
                    isDarkMode
                      ? "bg-slate-800/90 border-slate-700 text-slate-200"
                      : "bg-white border-black/[0.08] text-[#222222]"
                  }`}
                >
                  <Building2 className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                  <span className="text-[10px] font-bold uppercase text-[#777777]">Gym:</span>
                  <select
                    value={currentGymId}
                    onChange={(e) => handleDashboardSelectGym(e.target.value)}
                    className={`bg-transparent border-none text-xs font-bold outline-none cursor-pointer max-w-[140px] truncate ${
                      isDarkMode ? "text-indigo-400" : "text-indigo-700"
                    }`}
                    title="Training Gym (synced with Planner and Today's Session)"
                  >
                    <option value="" className={isDarkMode ? "bg-slate-800 text-slate-200" : "bg-white text-black"}>
                      (Select Gym)
                    </option>
                    {gyms.map((g) => (
                      <option
                        key={g.id}
                        value={g.id}
                        className={isDarkMode ? "bg-slate-800 text-slate-200" : "bg-white text-black"}
                      >
                        {g.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => setIsGymModalOpen(true)}
                    className="text-[10px] font-extrabold text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 px-1.5 py-0.5 rounded transition-colors"
                    title="Add new gym"
                  >
                    + Add
                  </button>
                </div>

                {resolvedSession.notes && (
                  <span
                    className={`text-xs font-semibold italic px-3 py-1 rounded-full border shrink-0 ${
                      resolvedSession.isCompleted
                        ? isDarkMode
                          ? "bg-emerald-950/40 border-emerald-800 text-emerald-300"
                          : "bg-emerald-100/60 border-emerald-200 text-emerald-900"
                        : isDarkMode
                        ? "bg-rose-950/40 border-rose-900 text-rose-300"
                        : "bg-rose-50 border-rose-200 text-[#AD314D]"
                    }`}
                  >
                    &ldquo;{resolvedSession.notes}&rdquo;
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* MOBILE EXERCISE CARDS */}
          <div className="sm:hidden space-y-2.5">
            {resolvedSession.exercises.map((ex, idx) => (
              <div
                key={idx}
                className={`p-3.5 rounded-xl border flex flex-col gap-2 ${
                  resolvedSession.isCompleted
                    ? isDarkMode
                      ? "bg-emerald-950/10 border-emerald-900/40"
                      : "bg-white border-emerald-200"
                    : isDarkMode
                    ? "bg-[#1a1d28] border-slate-800"
                    : "bg-[#FAF9F8] border-black/[0.06]"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                    <span
                      className={`text-[10px] font-bold ${
                        isDarkMode ? "text-slate-400" : "text-[#888888]"
                      }`}
                    >
                      #{idx + 1}
                    </span>
                    <span
                      className={`text-xs font-extrabold truncate ${
                        isDarkMode ? "text-slate-100" : "text-[#18181b]"
                      }`}
                    >
                      {ex.exerciseName}
                    </span>
                    {ex.machineName && (
                      <span className="inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.2 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200">
                        ⚙️ {ex.machineName}
                      </span>
                    )}
                  </div>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-md border shrink-0 ${
                      resolvedSession.isCompleted
                        ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                        : "bg-neutral-100 border-neutral-200 text-[#555555]"
                    }`}
                  >
                    {ex.muscleGroup}
                  </span>
                </div>

                {resolvedSession.isCompleted ? (
                  <div className="space-y-1.5">
                    <div className="text-[11px] font-bold text-emerald-800">
                      Completed Work Sets:
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {ex.sets.map((s) => (
                        <span
                          key={s.setNumber}
                          className="px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-50 text-emerald-900 border border-emerald-200"
                        >
                          S{s.setNumber}: {s.weight} {unit} × {s.reps}
                          {s.rpe ? ` @RPE${s.rpe}` : ""}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between text-[11px] text-[#666666]">
                    <span>
                      Target: {ex.targetSets} sets × {ex.targetReps}
                    </span>
                    <span className="font-extrabold text-[#AD314D]">
                      {ex.targetWeight ? `${ex.targetWeight} ${unit}` : "BW"}
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* DESKTOP EXERCISE TABLE */}
          <div
            className={`hidden sm:block overflow-x-auto rounded-2xl border shadow-2xs ${
              isDarkMode
                ? "bg-[#151824] border-slate-800"
                : "bg-white border-black/[0.08]"
            }`}
          >
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr
                  className={`border-b text-[11px] font-bold uppercase tracking-wider ${
                    isDarkMode
                      ? "bg-[#1e2230] border-slate-800 text-slate-300"
                      : "bg-[#F4F4F2] border-black/[0.08] text-[#555555]"
                  }`}
                >
                  <th className="py-3 px-3.5 w-10 text-center">#</th>
                  <th className="py-3 px-3.5">Exercise Name</th>
                  <th className="py-3 px-3.5">Muscle</th>
                  {resolvedSession.isCompleted ? (
                    <>
                      <th className="py-3 px-3.5">Actual Completed Sets ({unit} × Reps)</th>
                      <th className="py-3 px-3.5 text-center">Sets Done</th>
                      <th className="py-3 px-3.5 text-right">Volume ({unit})</th>
                    </>
                  ) : (
                    <>
                      <th className="py-3 px-3.5 text-center">Target Sets</th>
                      <th className="py-3 px-3.5 text-center">Reps</th>
                      <th className="py-3 px-3.5 text-center">Target Load</th>
                      <th className="py-3 px-3.5">Warmup &amp; Cue</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody
                className={`divide-y ${
                  isDarkMode ? "divide-slate-800/60 bg-[#151824]" : "divide-black/[0.04] bg-white"
                }`}
              >
                {resolvedSession.exercises.map((ex, idx) => {
                  const exVol = cleanNumber(
                    ex.sets.reduce((acc, s) => acc + (s.completed ? s.weight * s.reps : 0), 0)
                  );

                  return (
                    <tr
                      key={idx}
                      className={`transition-colors ${
                        isDarkMode ? "hover:bg-[#1a1e2c]" : "hover:bg-[#FAF9F8]"
                      }`}
                    >
                      <td
                        className={`py-3 px-3.5 text-center font-bold text-xs ${
                          isDarkMode ? "text-slate-500" : "text-[#888888]"
                        }`}
                      >
                        {idx + 1}
                      </td>
                      <td
                        className={`py-3 px-3.5 font-extrabold text-xs ${
                          isDarkMode ? "text-slate-100" : "text-[#18181b]"
                        }`}
                      >
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span>{ex.exerciseName}</span>
                          {ex.machineName && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                              ⚙️ {ex.machineName}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-3.5">
                        <span
                          className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-semibold capitalize border ${
                            isDarkMode
                              ? "bg-slate-800 border-slate-700 text-slate-300"
                              : "bg-[#F0F0EE] border-black/[0.04] text-[#4A4A4A]"
                          }`}
                        >
                          {ex.muscleGroup}
                        </span>
                      </td>

                      {resolvedSession.isCompleted ? (
                        <>
                          <td className="py-3 px-3.5">
                            <div className="flex flex-wrap gap-1.5">
                              {ex.sets.map((s) => (
                                <span
                                  key={s.setNumber}
                                  className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-emerald-50 text-emerald-900 border border-emerald-200"
                                >
                                  S{s.setNumber}: {s.weight} {unit} × {s.reps}
                                  {s.rpe ? ` @RPE${s.rpe}` : ""}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="py-3 px-3.5 text-center font-extrabold text-xs text-emerald-700">
                            {ex.sets.length}
                          </td>
                          <td className="py-3 px-3.5 text-right font-extrabold text-xs text-emerald-800">
                            {exVol.toLocaleString()} {unit}
                          </td>
                        </>
                      ) : (
                        <>
                          <td
                            className={`py-3 px-3.5 text-center font-semibold text-xs ${
                              isDarkMode ? "text-slate-200" : "text-[#222222]"
                            }`}
                          >
                            {ex.targetSets} sets
                          </td>
                          <td
                            className={`py-3 px-3.5 text-center font-semibold text-xs ${
                              isDarkMode ? "text-slate-200" : "text-[#222222]"
                            }`}
                          >
                            {ex.targetReps}
                          </td>
                          <td className="py-3 px-3.5 text-center">
                            <span
                              className={`inline-block px-2.5 py-1 rounded-md font-extrabold text-xs border ${
                                isDarkMode
                                  ? "bg-rose-950/40 border-rose-900/50 text-rose-400"
                                  : "bg-rose-50 border-rose-100 text-[#AD314D]"
                              }`}
                            >
                              {ex.targetWeight ? `${ex.targetWeight} ${unit}` : "BW / Warmup"}
                            </span>
                          </td>
                          <td
                            className={`py-3 px-3.5 text-[11px] italic ${
                              isDarkMode ? "text-slate-400" : "text-[#666666]"
                            }`}
                          >
                            Standard controlled tempo
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* TABLE FOOTER SUMMARY & CTA */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-xs pt-2 px-1">
            <span className={isDarkMode ? "text-slate-400 font-medium" : "text-[#666666] font-medium"}>
              <strong className={isDarkMode ? "text-slate-200" : "text-[#18181b]"}>
                {resolvedSession.exercises.length} movements
              </strong>{" "}
              •{" "}
              <strong className={isDarkMode ? "text-slate-200" : "text-[#18181b]"}>
                {resolvedSession.isCompleted
                  ? `${resolvedSession.completedSets} completed work sets`
                  : `${resolvedSession.totalSets} total working sets`}
              </strong>
            </span>
            {resolvedSession.isCompleted ? (
              <button
                type="button"
                onClick={() => {
                  const targetSession = resolvedSession.completedWorkout || {
                    id: `sess-${selectedDateStr}`,
                    date: selectedDateStr,
                    weekNumber: resolvedSession.weekNumber,
                    dayOfWeek: resolvedSession.dayOfWeek,
                    title: resolvedSession.title || "Completed Workout",
                    durationMinutes: 60,
                    exercises: []
                  };
                  if (onOpenCompletedWorkout) {
                    onOpenCompletedWorkout(targetSession);
                  } else {
                    onNavigateTab("diary");
                  }
                }}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-extrabold shadow-sm transition-all cursor-pointer"
              >
                <CheckCircle2 className="w-3.5 h-3.5 text-white" />
                <span>Open Full Session History</span>
                <ArrowRight className="w-3.5 h-3.5 ml-0.5" />
              </button>
            ) : isTargetToday ? (
              <button
                type="button"
                onClick={() => selectedPlannedDay && handleStartWorkout(selectedPlannedDay)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#AD314D] hover:bg-[#8C1E37] text-white text-xs font-extrabold shadow-sm transition-all cursor-pointer"
              >
                <Play className="w-3.5 h-3.5 fill-white" />
                <span>Start Workout Now</span>
                <ArrowRight className="w-3.5 h-3.5 ml-0.5" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => selectedPlannedDay && handleStartWorkout(selectedPlannedDay)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-extrabold shadow-sm transition-all cursor-pointer"
              >
                <CalendarDays className="w-3.5 h-3.5 text-white" />
                <span>Log Session ({formattedSelectedDate})</span>
                <ArrowRight className="w-3.5 h-3.5 ml-0.5" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* ADD GYM MODAL */}
      {isGymModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div
            className={`w-full max-w-md rounded-2xl border shadow-xl p-5 space-y-4 ${
              isDarkMode ? "bg-[#181a24] border-slate-800 text-slate-100" : "bg-white border-black/[0.08] text-[#222222]"
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Building2 className="w-5 h-5 text-indigo-600" />
                <h3 className="text-base font-extrabold">Add Training Gym</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsGymModalOpen(false)}
                className={`p-1.5 rounded-lg transition-colors ${
                  isDarkMode ? "hover:bg-slate-800 text-slate-400" : "hover:bg-black/5 text-[#666666]"
                }`}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateGym} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold uppercase text-[#777777] mb-1">
                  Gym Name *
                </label>
                <input
                  type="text"
                  required
                  value={newGymName}
                  onChange={(e) => setNewGymName(e.target.value)}
                  placeholder="e.g. Golds Gym, Equinox, Home Gym"
                  className={`w-full px-3 py-2 text-sm rounded-xl border font-medium outline-none focus:ring-2 focus:ring-indigo-500 ${
                    isDarkMode ? "bg-[#12141c] border-slate-700 text-slate-100" : "bg-white border-black/[0.12] text-[#222222]"
                  }`}
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-[#777777] mb-1">
                  Location / Branch (Optional)
                </label>
                <input
                  type="text"
                  value={newGymLocation}
                  onChange={(e) => setNewGymLocation(e.target.value)}
                  placeholder="e.g. Downtown, Venice Beach, 4th Floor"
                  className={`w-full px-3 py-2 text-sm rounded-xl border font-medium outline-none focus:ring-2 focus:ring-indigo-500 ${
                    isDarkMode ? "bg-[#12141c] border-slate-700 text-slate-100" : "bg-white border-black/[0.12] text-[#222222]"
                  }`}
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsGymModalOpen(false)}
                  className={`px-3 py-1.5 text-xs font-bold rounded-xl border transition-colors ${
                    isDarkMode ? "border-slate-700 text-slate-300 hover:bg-slate-800" : "border-black/[0.1] text-[#555555] hover:bg-black/5"
                  }`}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!newGymName.trim()}
                  className="px-4 py-1.5 text-xs font-extrabold rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white transition-colors disabled:opacity-50"
                >
                  Save &amp; Set Gym
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
