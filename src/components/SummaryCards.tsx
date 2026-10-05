import React, { useState } from "react";
import { TrendingUp, Flame, Award, ArrowUpRight, CheckCircle2, ChevronRight, Activity, Footprints, Heart, Moon, Watch, ShieldCheck, RefreshCw, Info, X, Calculator, Search, Filter, Sparkles } from "lucide-react";
import { WorkoutSession, WeightUnit, SyncedHealthMetrics, UserProfile } from "../types";
import {
  calculateWeeklyConsistency,
  calculatePersonalRecords,
  getKeyLiftPR,
  getActiveBenchmarkPRs,
  formatVolume,
  formatWeight,
  convertWeight
} from "../utils/calculations";
import { ExerciseProgressionSwipe } from "./ExerciseProgressionSwipe";

interface SummaryCardsProps {
  workouts: WorkoutSession[];
  unit: WeightUnit;
  onOpenLog: () => void;
  onOpenExecutiveSummary?: () => void;
  healthMetrics?: SyncedHealthMetrics;
  onOpenHealthIntegrations?: () => void;
  onRefreshHealthData?: () => void;
  isRefreshingHealthData?: boolean;
  userProfile?: UserProfile;
  isDarkMode?: boolean;
  completedDaysRecord?: Record<string, boolean>;
}

export const SummaryCards: React.FC<SummaryCardsProps> = ({
  workouts,
  unit,
  onOpenLog,
  onOpenExecutiveSummary,
  healthMetrics,
  onOpenHealthIntegrations,
  onRefreshHealthData,
  isRefreshingHealthData = false,
  userProfile,
  isDarkMode = false,
  completedDaysRecord
}) => {
  const [useLedStyle, setUseLedStyle] = useState(true);
  const [showFitbitInfoModal, setShowFitbitInfoModal] = useState(false);
  const [selectedHorizon, setSelectedHorizon] = useState<"auto" | "current" | "last_week" | "rolling">("auto");
  const [showBenchmarkModal, setShowBenchmarkModal] = useState(false);
  const [benchmarkFilterMuscle, setBenchmarkFilterMuscle] = useState<string>("All");
  const [benchmarkSearch, setBenchmarkSearch] = useState<string>("");

  const consistency = calculateWeeklyConsistency(workouts, userProfile?.daysPerWeek || 4, completedDaysRecord);
  const {
    workoutsThisWeek,
    volumeThisWeek,
    volumePreviousWeek,
    volumeDiffPercent,
    streakWeeks,
    targetDays,
    weeklyAdherencePercent,
    dailyCompletions = [false, false, false, false, false, false, false],
    rolling7DayVolume,
    rolling7DayWorkouts,
    lastActiveWeekVolume,
    lastActiveWeekNumber,
    lastActiveWeekWorkouts,
    isNewWeekStarting
  } = consistency;

  const completionPercent = Math.round(Math.min(100, weeklyAdherencePercent));

  // Determine active volume horizon
  const effectiveHorizon =
    selectedHorizon !== "auto"
      ? selectedHorizon
      : isNewWeekStarting
      ? "last_week"
      : "current";

  let activeVolume = volumeThisWeek;
  let activeSubtitle = `${unit.toUpperCase()} TONNAGE MOVED`;
  let activeFooterNote = `${workoutsThisWeek} sessions logged`;
  let activeDiffText = volumeDiffPercent !== null
    ? `${volumeDiffPercent >= 0 ? `+${Math.round(volumeDiffPercent)}%` : `${Math.round(volumeDiffPercent)}%`} vs prior week`
    : `Prior week: ${formatVolume(volumePreviousWeek, unit, 0)}`;

  if (effectiveHorizon === "last_week") {
    activeVolume = lastActiveWeekVolume;
    activeSubtitle = `${unit.toUpperCase()} TONNAGE (WEEK ${lastActiveWeekNumber || 3})`;
    activeFooterNote = `${lastActiveWeekWorkouts} sessions in Week ${lastActiveWeekNumber || 3}`;
    activeDiffText = isNewWeekStarting
      ? `Week 4 starts today • W${lastActiveWeekNumber || 3} completed`
      : `Last completed week`;
  } else if (effectiveHorizon === "rolling") {
    activeVolume = rolling7DayVolume;
    activeSubtitle = `${unit.toUpperCase()} TONNAGE (TRAILING 7 DAYS)`;
    activeFooterNote = `${rolling7DayWorkouts} sessions in past 7 days`;
    activeDiffText = `Rolling 7-day workload`;
  } else {
    activeVolume = volumeThisWeek;
    activeSubtitle = `${unit.toUpperCase()} TONNAGE (CURRENT WEEK)`;
    if (workoutsThisWeek === 0) {
      activeFooterNote = `0/${targetDays} sessions • Week started`;
      activeDiffText = `Prior week was ${formatVolume(volumePreviousWeek, unit, 0)}`;
    }
  }

  const benchmarkAnalysis = getActiveBenchmarkPRs(workouts);
  const prCount = benchmarkAnalysis.totalCount;

  // Key lift PRs derived from single source of truth with aliases
  const benchPrRecord = getKeyLiftPR(workouts, "bench");
  const squatPrRecord = getKeyLiftPR(workouts, "squat");
  const deadliftPrRecord = getKeyLiftPR(workouts, "deadlift");

  // Calculated via Brzycki overload formulas: 1RM = Weight * (36 / (37 - Reps))
  const bench1RM = benchPrRecord.e1rm;
  const squat1RM = squatPrRecord.e1rm;
  const deadlift1RM = deadliftPrRecord.e1rm;

  // Formatted display values using unified rounding
  const displayVolume = formatVolume(activeVolume, unit, 0);
  const displayBench = formatWeight(bench1RM, unit, 0);
  const displaySquat = formatWeight(squat1RM, unit, 0);
  const displayDeadlift = formatWeight(deadlift1RM, unit, 0);

  // Google Health telemetry
  const gh = healthMetrics?.googleHealth;
  const fb = healthMetrics?.fitbit;
  const dailySteps = gh?.dailySteps ?? gh?.todaySteps ?? fb?.dailySteps;
  const distanceKm = gh?.distanceKm ?? gh?.todayDistanceKm ?? fb?.distanceKm;
  const floorsClimbed = gh?.floorsClimbed ?? gh?.todayFloors ?? fb?.floorsClimbed;
  const restingHeartRate = gh?.restingHeartRate ?? fb?.restingHeartRate;
  const sleepScore = gh?.sleepScore ?? fb?.sleepScore;
  const activeDevice = gh?.device || fb?.device || "Fitbit Inspire 3";
  const athleteName = gh?.athleteName || "David Rootwelt-Norberg";

  return (
    <section className="w-full space-y-6">
      {/* GOOGLE HEALTH API V4 LIVE TELEMETRY BAR */}
      <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-emerald-950 via-teal-950 to-neutral-900 border border-emerald-500/30 text-white shadow-sm space-y-3.5 relative overflow-hidden">
        {/* Top Header: Google Health API Live + Info Icon & Right-Aligned Action Buttons */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center text-emerald-400 shrink-0">
              <Watch className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] sm:text-[11px] uppercase font-bold tracking-wider px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Google Health API Live
              </span>

              {/* Fitbit Inspire 3 Information Button */}
              <button
                type="button"
                onClick={() => setShowFitbitInfoModal(true)}
                title="View Fitbit Inspire 3 telemetry details"
                className="w-6 h-6 rounded-full bg-white/10 hover:bg-white/20 border border-white/20 flex items-center justify-center text-emerald-300 hover:text-white transition-all shadow-xs"
                aria-label="Device and integration information"
              >
                <Info className="w-3.5 h-3.5" />
              </button>


            </div>
          </div>

          {/* Action buttons cleanly aligned with proper breathing room on mobile & desktop */}
          <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
            {onRefreshHealthData && (
              <button
                type="button"
                onClick={onRefreshHealthData}
                disabled={isRefreshingHealthData}
                title="Synchronize Google Health API biometrics"
                className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 active:scale-95 text-emerald-300 border border-white/15 transition-all flex items-center gap-1.5 text-xs font-semibold"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isRefreshingHealthData ? "animate-spin" : ""}`} />
                <span>{isRefreshingHealthData ? "Syncing..." : "Sync"}</span>
              </button>
            )}

            {onOpenHealthIntegrations && (
              <button
                type="button"
                onClick={onOpenHealthIntegrations}
                className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white text-xs font-semibold shadow-xs transition-all flex items-center gap-1.5"
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Manage</span>
              </button>
            )}
          </div>
        </div>

        {/* Biometrics 4-Card Grid: Clean, balanced 2-col on mobile, 4-col on desktop */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3">
          <div className="px-3 py-2 rounded-xl bg-white/5 border border-white/10 flex items-center gap-2.5">
            <Footprints className="w-4 h-4 text-emerald-400 shrink-0" />
            <div>
              <div className="text-[10px] uppercase text-neutral-400 font-bold">Steps Today</div>
              <div className="text-sm font-extrabold text-white">
                {dailySteps !== undefined ? dailySteps.toLocaleString() : "No data"}
              </div>
            </div>
          </div>

          <div className="px-3 py-2 rounded-xl bg-white/5 border border-white/10 flex items-center gap-2.5">
            <Activity className="w-4 h-4 text-teal-400 shrink-0" />
            <div>
              <div className="text-[10px] uppercase text-neutral-400 font-bold">Distance</div>
              <div className="text-sm font-extrabold text-white">
                {distanceKm !== undefined ? (
                  <>
                    {distanceKm} km{" "}
                    {floorsClimbed !== undefined && (
                      <span className="text-[10px] text-neutral-400 font-normal">({floorsClimbed} fl)</span>
                    )}
                  </>
                ) : (
                  "No data"
                )}
              </div>
            </div>
          </div>

          <div className="px-3 py-2 rounded-xl bg-white/5 border border-white/10 flex items-center gap-2.5">
            <Heart className="w-4 h-4 text-rose-400 shrink-0" />
            <div>
              <div className="text-[10px] uppercase text-neutral-400 font-bold">Resting HR</div>
              <div className="text-sm font-extrabold text-white">
                {restingHeartRate !== undefined ? (
                  <>
                    {restingHeartRate} <span className="text-[10px] text-neutral-400 font-normal">bpm</span>
                  </>
                ) : (
                  "No data"
                )}
              </div>
            </div>
          </div>

          <div className="px-3 py-2 rounded-xl bg-white/5 border border-white/10 flex items-center gap-2.5">
            <Moon className="w-4 h-4 text-indigo-400 shrink-0" />
            <div>
              <div className="text-[10px] uppercase text-neutral-400 font-bold">Sleep Index</div>
              <div className="text-sm font-extrabold text-white">
                {sleepScore !== undefined ? (
                  <>
                    {sleepScore} <span className="text-[10px] text-neutral-400 font-normal">/ 100</span>
                  </>
                ) : (
                  "No data"
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Fitbit Inspire 3 Information Modal */}
        {showFitbitInfoModal && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
            <div className="bg-[#1b2533] border border-emerald-500/40 rounded-3xl p-5 sm:p-6 max-w-md w-full shadow-2xl text-white space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-white/10">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center text-emerald-400">
                    <Watch className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">Fitbit Inspire 3 Integration</h3>
                    <p className="text-[11px] text-emerald-300">Live Device Telemetry</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowFitbitInfoModal(false)}
                  className="p-1 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3 text-xs text-neutral-300 leading-relaxed">
                <div className="p-3 rounded-2xl bg-white/5 border border-white/10 space-y-1.5">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-neutral-400">Connected Device:</span>
                    <span className="font-bold text-white">{activeDevice}</span>
                  </div>
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-neutral-400">Athlete Profile:</span>
                    <span className="font-bold text-white">{athleteName}</span>
                  </div>
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-neutral-400">Data Pipeline:</span>
                    <span className="font-bold text-emerald-300">Google Health API v4</span>
                  </div>
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-neutral-400">Sync Status:</span>
                    <span className="font-bold text-emerald-400 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      Active Live Stream
                    </span>
                  </div>
                </div>

                <p className="text-[11px] text-neutral-300">
                  Biometric telemetry from your <strong>Fitbit Inspire 3</strong> is automatically captured and processed via Google Health Connect. It measures continuous optical heart rate, step cadence, active metabolic calorie burn, and hypnogram sleep architecture.
                </p>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setShowFitbitInfoModal(false)}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* SWIPABLE EXERCISE PROGRESSION & SETS PER BODYPART (Placed before Weekly Volume Load) */}
      <ExerciseProgressionSwipe workouts={workouts} unit={unit} />

      <div>
        <div className="flex items-center justify-between mb-3 px-1">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-[#4A4A4A]">
              Weekly Volume &amp; Consistency Cadence
            </h2>
          </div>
          <div className="flex items-center gap-2">
            {onOpenExecutiveSummary && (
              <button
                type="button"
                onClick={onOpenExecutiveSummary}
                className="text-[11px] font-semibold text-[#AD314D] hover:text-[#942740] transition-colors flex items-center gap-1 bg-[#AD314D]/10 hover:bg-[#AD314D]/15 px-2.5 py-0.5 rounded-full"
              >
                <span>Full Dossier &amp; PDF</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setUseLedStyle(!useLedStyle)}
              className="text-[11px] font-medium text-[#4A4A4A] hover:text-[#222222] transition-colors flex items-center gap-1 bg-black/[0.04] px-2.5 py-0.5 rounded-full"
              title="Toggle LED digital dotted typography for prominent stat"
            >
              <span>LED Numeral:</span>
              <span className="font-semibold text-[#AD314D]">
                {useLedStyle ? "Dotted On" : "Standard"}
              </span>
            </button>
          </div>
        </div>

        {/* 3 Rich Gradient Cards: row on desktop, stack on mobile */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-5">
        {/* CARD 1: Berry Pink to Burgundy */}
        <div
          className="gradient-grain card-highlight rounded-[18px] p-6 text-white bg-gradient-to-br from-[#C2385C] via-[#942740] to-[#5C1324] border border-white/20 shadow-[0_10px_30px_rgba(173,49,77,0.18)] flex flex-col justify-between relative transition-all duration-200 hover:shadow-[0_14px_36px_rgba(173,49,77,0.25)] hover:-translate-y-0.5 group"
        >
          <div className="flex items-center justify-between mb-3 gap-2">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[11px] font-semibold tracking-wider uppercase text-white/90">
                Weekly Volume Load
              </span>
              {effectiveHorizon === "last_week" && (
                <span className="text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded-full bg-white/20 border border-white/30 text-white backdrop-blur-xs">
                  Week {lastActiveWeekNumber || 3}
                </span>
              )}
            </div>
            
            <div className="flex items-center gap-1.5">
              {/* Multi-Horizon Quick Toggle */}
              <div className="flex items-center bg-black/30 backdrop-blur-xs p-0.5 rounded-lg border border-white/15 text-[10px]">
                <button
                  type="button"
                  onClick={() => setSelectedHorizon("last_week")}
                  className={`px-2 py-0.5 rounded transition-all cursor-pointer ${
                    effectiveHorizon === "last_week"
                      ? "bg-white text-[#942740] font-bold shadow-xs"
                      : "text-white/75 hover:text-white"
                  }`}
                  title="Show last completed week volume"
                >
                  {lastActiveWeekNumber ? `W${lastActiveWeekNumber}` : "Last"}
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedHorizon("current")}
                  className={`px-2 py-0.5 rounded transition-all cursor-pointer ${
                    effectiveHorizon === "current"
                      ? "bg-white text-[#942740] font-bold shadow-xs"
                      : "text-white/75 hover:text-white"
                  }`}
                  title="Show current calendar week volume"
                >
                  This Wk
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedHorizon("rolling")}
                  className={`px-2 py-0.5 rounded transition-all cursor-pointer ${
                    effectiveHorizon === "rolling"
                      ? "bg-white text-[#942740] font-bold shadow-xs"
                      : "text-white/75 hover:text-white"
                  }`}
                  title="Show trailing 7-day rolling volume"
                >
                  7D
                </button>
              </div>

              <div className="w-8 h-8 rounded-xl bg-white/15 backdrop-blur-sm flex items-center justify-center text-white/90 border border-white/20 shrink-0">
                <TrendingUp className="w-4 h-4" />
              </div>
            </div>
          </div>

          <div className="my-1">
            <div
              className={`text-4xl sm:text-[44px] font-bold text-white tracking-tight leading-none ${
                useLedStyle ? "font-led text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.25)]" : ""
              }`}
            >
              {displayVolume}
            </div>
            <div className="flex items-baseline gap-2 mt-1.5 flex-wrap">
              <span className="text-xs uppercase font-medium text-white/85 tracking-wide">
                {activeSubtitle}
              </span>
            </div>
          </div>

          <div className="mt-5 pt-3.5 border-t border-white/15 flex items-center justify-between text-xs text-white/85 gap-2 flex-wrap">
            <div className="flex items-center gap-1 font-medium truncate">
              <ArrowUpRight className="w-3.5 h-3.5 text-white shrink-0" />
              <span className="truncate">{activeDiffText}</span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-white/80">
                {activeFooterNote}
              </span>
              {effectiveHorizon === "current" && workoutsThisWeek === 0 && (
                <button
                  type="button"
                  onClick={onOpenLog}
                  className="px-2 py-0.5 rounded-full bg-white text-[#942740] font-bold text-[10px] hover:bg-white/90 transition-all cursor-pointer shadow-xs"
                  title="Log today's workout"
                >
                  + Log Today
                </button>
              )}
            </div>
          </div>
        </div>

        {/* CARD 2: Lavender to Plum */}
        <div
          className="gradient-grain card-highlight rounded-[18px] p-6 text-white bg-gradient-to-br from-[#8E78B3] via-[#654382] to-[#3F1B4E] border border-white/20 shadow-[0_10px_30px_rgba(79,33,99,0.16)] flex flex-col justify-between relative transition-all duration-200 hover:shadow-[0_14px_36px_rgba(79,33,99,0.22)] hover:-translate-y-0.5"
        >
          <div className="flex items-center justify-between mb-4">
            <span className="text-[11px] font-semibold tracking-wider uppercase text-white/80">
              Consistency &amp; Cadence
            </span>
            <div className="w-8 h-8 rounded-xl bg-white/15 backdrop-blur-sm flex items-center justify-center text-white/90 border border-white/20">
              <Flame className="w-4 h-4" />
            </div>
          </div>

          <div className="my-1">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="flex items-baseline gap-2">
                  <span className="text-4xl sm:text-[44px] font-bold text-white tracking-tight leading-none">
                    {streakWeeks}
                  </span>
                  <span className="text-lg font-semibold text-white/90">
                    Weeks Streak
                  </span>
                </div>
                <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                  <span className="text-[10px] uppercase tracking-wider font-extrabold px-2 py-0.5 rounded-full bg-white/20 text-white border border-white/30 backdrop-blur-sm">
                    {streakWeeks >= 4 ? "⭐ Veteran Streak" : streakWeeks >= 2 ? "🔥 Active Habit" : "⚡ Streak Started"}
                  </span>
                  <span className="text-xs text-white/80 font-medium">
                    {workoutsThisWeek > 0
                      ? `${workoutsThisWeek}/${targetDays} sessions this week`
                      : `${streakWeeks} consecutive weeks completed • Week 4 in progress`}
                  </span>
                </div>
              </div>

              {/* Completion Progress Ring */}
              <div className="relative w-14 h-14 shrink-0 flex items-center justify-center" title={`${completionPercent}% weekly target complete`}>
                <svg className="w-14 h-14 -rotate-90" viewBox="0 0 52 52">
                  <circle
                    cx="26"
                    cy="26"
                    r="22"
                    fill="none"
                    stroke="rgba(255,255,255,0.2)"
                    strokeWidth="4"
                  />
                  <circle
                    cx="26"
                    cy="26"
                    r="22"
                    fill="none"
                    stroke="#FFFFFF"
                    strokeWidth="4"
                    strokeDasharray={138.23}
                    strokeDashoffset={138.23 * (1 - Math.min(1, Math.max(0, workoutsThisWeek / Math.max(1, targetDays))))}
                    strokeLinecap="round"
                    className="transition-all duration-700 ease-out"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                  <span className="text-xs font-black text-white leading-none">
                    {completionPercent}%
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Weekday indicator pills */}
          <div className="mt-5 pt-3.5 border-t border-white/15">
            <div className="flex items-center justify-between gap-1 text-[11px] text-white/90 font-medium">
              {["M", "T", "W", "T", "F", "S", "S"].map((day, idx) => {
                const isCompleted = dailyCompletions[idx] || false;
                return (
                  <div key={idx} className="flex flex-col items-center gap-1">
                    <span className="text-[10px] text-white/60">{day}</span>
                    <div
                      className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold transition-all ${
                        isCompleted
                          ? "bg-white text-[#472153] shadow-sm"
                          : "bg-white/15 text-white/50 border border-white/10"
                      }`}
                      title={isCompleted ? `${day} session completed` : `${day} no workout logged`}
                    >
                      {isCompleted ? "✓" : "·"}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* CARD 3: Coral to Warm Orange */}
        <div
          onClick={() => setShowBenchmarkModal(true)}
          className="gradient-grain card-highlight rounded-[18px] p-6 text-white bg-gradient-to-br from-[#E2684F] via-[#BD472B] to-[#8C2913] border border-white/20 shadow-[0_10px_30px_rgba(226,104,79,0.18)] flex flex-col justify-between relative transition-all duration-200 hover:shadow-[0_14px_36px_rgba(226,104,79,0.25)] hover:-translate-y-0.5 cursor-pointer group"
          title="Click to view all Active Benchmark PRs and Brzycki formula calculations"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-semibold tracking-wider uppercase text-white/90">
                Estimated 1RM &amp; PRs
              </span>
              <span className="text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded-full bg-white/20 border border-white/30 text-white backdrop-blur-xs flex items-center gap-1">
                <Calculator className="w-2.5 h-2.5" /> Brzycki
              </span>
            </div>
            <div className="w-8 h-8 rounded-xl bg-white/15 backdrop-blur-sm flex items-center justify-center text-white/90 border border-white/20 group-hover:bg-white/25 transition-all">
              <Award className="w-4 h-4" />
            </div>
          </div>

          <div className="my-1">
            <div className="flex items-baseline gap-2">
              <span
                className={`text-4xl sm:text-[44px] font-bold text-white tracking-tight leading-none ${
                  useLedStyle ? "font-led text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.25)]" : ""
                }`}
              >
                {prCount}
              </span>
              <span className="text-base font-semibold text-white/90">
                Active Benchmark PRs
              </span>
            </div>
            <p className="text-xs text-white/85 mt-1.5 flex items-center justify-between">
              <span>Calculated via Brzycki overload formulas</span>
              <span className="text-[10px] font-bold underline underline-offset-2 opacity-80 group-hover:opacity-100 flex items-center gap-0.5">
                View All →
              </span>
            </p>
          </div>

          {/* Quick 1RM pills showing actual Brzycki 1RM and rep load */}
          <div className="mt-5 pt-3.5 border-t border-white/15 grid grid-cols-3 gap-2 text-xs">
            <div className="bg-black/25 backdrop-blur-sm px-2 py-1.5 rounded-xl text-center border border-white/15 transition-all group-hover:bg-black/30">
              <div className="text-[9px] text-white/80 uppercase font-bold truncate tracking-wider" title={benchPrRecord.exerciseName}>
                {benchPrRecord.exerciseName.includes("Bench") ? "Bench" : benchPrRecord.exerciseName.includes("Press") ? "Chest Press" : "Chest"}
              </div>
              <div className="font-black text-white text-xs sm:text-sm mt-0.5">
                {benchPrRecord.e1rm > 0 ? `${displayBench} ${unit}` : "—"}
              </div>
              <div className="text-[9px] text-white/70 truncate mt-0.5 font-medium">
                {benchPrRecord.weight > 0 ? `${benchPrRecord.weight}kg × ${benchPrRecord.reps}r` : "No logs"}
              </div>
            </div>

            <div className="bg-black/25 backdrop-blur-sm px-2 py-1.5 rounded-xl text-center border border-white/15 transition-all group-hover:bg-black/30">
              <div className="text-[9px] text-white/80 uppercase font-bold truncate tracking-wider" title={squatPrRecord.exerciseName}>
                {squatPrRecord.exerciseName.includes("Squat") ? "Squat" : squatPrRecord.exerciseName.includes("Ext") ? "Leg Ext" : "Legs"}
              </div>
              <div className="font-black text-white text-xs sm:text-sm mt-0.5">
                {squatPrRecord.e1rm > 0 ? `${displaySquat} ${unit}` : "—"}
              </div>
              <div className="text-[9px] text-white/70 truncate mt-0.5 font-medium">
                {squatPrRecord.weight > 0 ? `${squatPrRecord.weight}kg × ${squatPrRecord.reps}r` : "No logs"}
              </div>
            </div>

            <div className="bg-black/25 backdrop-blur-sm px-2 py-1.5 rounded-xl text-center border border-white/15 transition-all group-hover:bg-black/30">
              <div className="text-[9px] text-white/80 uppercase font-bold truncate tracking-wider" title={deadliftPrRecord.exerciseName}>
                {deadliftPrRecord.exerciseName.includes("Deadlift") ? "Deadlift" : deadliftPrRecord.exerciseName.includes("Pulldown") ? "Pulldown" : "Pull"}
              </div>
              <div className="font-black text-white text-xs sm:text-sm mt-0.5">
                {deadliftPrRecord.e1rm > 0 ? `${displayDeadlift} ${unit}` : "—"}
              </div>
              <div className="text-[9px] text-white/70 truncate mt-0.5 font-medium">
                {deadliftPrRecord.weight > 0 ? `${deadliftPrRecord.weight}kg × ${deadliftPrRecord.reps}r` : "No logs"}
              </div>
            </div>
          </div>
        </div>
      </div>
      </div>

      {/* ACTIVE BENCHMARK PRS & BRZYCKI OVERLOAD ANALYSIS MODAL */}
      {showBenchmarkModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/50 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white rounded-[24px] border border-black/[0.08] shadow-2xl overflow-hidden flex flex-col w-full max-w-3xl max-h-[90vh]">
            {/* Modal Header */}
            <div className="p-4 sm:p-5 border-b border-black/[0.06] flex items-center justify-between bg-gradient-to-r from-orange-50/70 via-rose-50/40 to-neutral-50 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-[#E2684F]/15 border border-[#E2684F]/25 flex items-center justify-center text-[#BD472B]">
                  <Calculator className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-extrabold text-[#222222] flex items-center gap-2">
                    <span>Active Benchmark PRs</span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#E2684F]/15 text-[#BD472B] border border-[#E2684F]/25">
                      {benchmarkAnalysis.totalCount} Records
                    </span>
                  </h3>
                  <p className="text-xs text-[#666666]">
                    Calculated via Brzycki Overload Formula: <code className="font-mono text-[#AD314D] font-bold">1RM = Weight × (36 / (37 - Reps))</code>
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowBenchmarkModal(false)}
                className="w-8 h-8 rounded-full bg-neutral-100 hover:bg-neutral-200 text-neutral-600 flex items-center justify-center transition-all cursor-pointer"
                title="Close modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Top 3 Compound Highlights */}
            <div className="p-4 sm:p-5 bg-neutral-50/70 border-b border-black/[0.06] grid grid-cols-1 sm:grid-cols-3 gap-3 shrink-0">
              <div className="p-3 rounded-xl bg-white border border-black/[0.06] shadow-2xs">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase text-[#777777] tracking-wider">Chest Benchmark</span>
                  <span className="text-[10px] font-semibold text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded">Chest</span>
                </div>
                <div className="text-lg font-black text-[#222222] mt-1">
                  {displayBench} {unit} <span className="text-xs font-semibold text-[#888888]">1RM</span>
                </div>
                <div className="text-xs text-[#555555] font-medium truncate mt-0.5">
                  {benchPrRecord.exerciseName}
                </div>
                <div className="text-[10px] text-[#777777] mt-1 font-mono">
                  {benchPrRecord.weight}kg × {benchPrRecord.reps}r → {benchPrRecord.e1rm}kg e1RM
                </div>
              </div>

              <div className="p-3 rounded-xl bg-white border border-black/[0.06] shadow-2xs">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase text-[#777777] tracking-wider">Legs Benchmark</span>
                  <span className="text-[10px] font-semibold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">Legs</span>
                </div>
                <div className="text-lg font-black text-[#222222] mt-1">
                  {displaySquat} {unit} <span className="text-xs font-semibold text-[#888888]">1RM</span>
                </div>
                <div className="text-xs text-[#555555] font-medium truncate mt-0.5">
                  {squatPrRecord.exerciseName}
                </div>
                <div className="text-[10px] text-[#777777] mt-1 font-mono">
                  {squatPrRecord.weight}kg × {squatPrRecord.reps}r → {squatPrRecord.e1rm}kg e1RM
                </div>
              </div>

              <div className="p-3 rounded-xl bg-white border border-black/[0.06] shadow-2xs">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase text-[#777777] tracking-wider">Pull Benchmark</span>
                  <span className="text-[10px] font-semibold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">Back</span>
                </div>
                <div className="text-lg font-black text-[#222222] mt-1">
                  {displayDeadlift} {unit} <span className="text-xs font-semibold text-[#888888]">1RM</span>
                </div>
                <div className="text-xs text-[#555555] font-medium truncate mt-0.5">
                  {deadliftPrRecord.exerciseName}
                </div>
                <div className="text-[10px] text-[#777777] mt-1 font-mono">
                  {deadliftPrRecord.weight}kg × {deadliftPrRecord.reps}r → {deadliftPrRecord.e1rm}kg e1RM
                </div>
              </div>
            </div>

            {/* Filter and Search controls */}
            <div className="p-3 sm:p-4 border-b border-black/[0.06] flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0 scrollbar-none">
                {["All", "Chest", "Back", "Legs", "Shoulders", "Arms", "Core"].map((tab) => {
                  const isSelected = benchmarkFilterMuscle === tab;
                  return (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => setBenchmarkFilterMuscle(tab)}
                      className={`px-3 py-1 rounded-full text-xs font-bold transition-all shrink-0 cursor-pointer ${
                        isSelected
                          ? "bg-[#AD314D] text-white shadow-2xs"
                          : "bg-neutral-100 text-[#555555] hover:bg-neutral-200"
                      }`}
                    >
                      {tab}
                    </button>
                  );
                })}
              </div>

              <div className="relative w-full sm:w-64">
                <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Search PR exercises..."
                  value={benchmarkSearch}
                  onChange={(e) => setBenchmarkSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 rounded-full bg-neutral-100 border border-black/[0.06] text-xs text-[#222222] placeholder:text-neutral-400 focus:outline-none focus:ring-1 focus:ring-[#AD314D]"
                />
              </div>
            </div>

            {/* Scrollable PR List */}
            <div className="p-4 sm:p-5 overflow-y-auto space-y-2 flex-1 divide-y divide-black/[0.04]">
              {benchmarkAnalysis.records
                .filter((rec) => {
                  const matchesMuscle =
                    benchmarkFilterMuscle === "All" ||
                    rec.muscleGroup.toLowerCase().includes(benchmarkFilterMuscle.toLowerCase());
                  const matchesSearch =
                    !benchmarkSearch ||
                    rec.exerciseName.toLowerCase().includes(benchmarkSearch.toLowerCase()) ||
                    rec.muscleGroup.toLowerCase().includes(benchmarkSearch.toLowerCase());
                  return matchesMuscle && matchesSearch;
                })
                .map((rec, idx) => (
                  <div key={rec.exerciseName} className="pt-2.5 pb-2.5 first:pt-0 flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2.5 min-w-[200px]">
                      <span className="w-6 text-center text-xs font-extrabold text-neutral-400 font-mono">
                        #{idx + 1}
                      </span>
                      <div>
                        <div className="text-sm font-bold text-[#222222] flex items-center gap-2">
                          <span>{rec.exerciseName}</span>
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-neutral-100 text-[#555555]">
                            {rec.muscleGroup}
                          </span>
                        </div>
                        <div className="text-xs text-[#666666] font-mono mt-0.5">
                          Best set: <strong className="text-[#222222]">{rec.weight} kg × {rec.reps} reps</strong>
                          <span className="text-neutral-400 mx-1.5">•</span>
                          Brzycki: <span className="text-[#AD314D] font-bold">{rec.weight} × (36 / {37 - rec.reps}) = {rec.e1rm} kg</span>
                          <span className="text-neutral-400 mx-1.5">•</span>
                          Logged: {rec.date}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <div className="text-base font-black text-[#AD314D]">
                          {formatWeight(rec.e1rm, unit, 1)} {unit}
                        </div>
                        <div className="text-[10px] text-neutral-500 font-mono">
                          Brzycki 1RM
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
            </div>

            {/* Modal Footer */}
            <div className="p-3 sm:p-4 bg-neutral-50 border-t border-black/[0.06] flex items-center justify-between text-xs text-[#666666] shrink-0">
              <span className="flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-[#AD314D]" />
                All PRs synchronize dynamically with your workout logs and progressive overload cadence.
              </span>
              <button
                type="button"
                onClick={() => setShowBenchmarkModal(false)}
                className="px-4 py-1.5 rounded-full bg-neutral-200 hover:bg-neutral-300 font-bold text-[#222222] transition-all cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
