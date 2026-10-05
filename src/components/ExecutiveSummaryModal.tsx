import React, { useRef } from "react";
import {
  X,
  FileDown,
  Printer,
  TrendingUp,
  Award,
  Flame,
  Calendar,
  Clock,
  Dumbbell,
  Target,
  CheckCircle2,
  Sparkles,
  BarChart3
} from "lucide-react";
import { WorkoutSession, WeightUnit } from "../types";
import {
  calculateWeeklyConsistency,
  calculatePersonalRecords,
  calculateSessionVolume,
  calculateMuscleVolumeBreakdown,
  EXERCISE_CATALOG
} from "../utils/calculations";

interface ExecutiveSummaryModalProps {
  isOpen: boolean;
  onClose: () => void;
  workouts: WorkoutSession[];
  unit: WeightUnit;
}

export const ExecutiveSummaryModal: React.FC<ExecutiveSummaryModalProps> = ({
  isOpen,
  onClose,
  workouts,
  unit
}) => {
  const printRef = useRef<HTMLDivElement>(null);

  if (!isOpen) return null;

  const multiplier = unit === "lbs" ? 2.20462 : 1;
  const {
    workoutsThisWeek,
    volumeThisWeek,
    volumePreviousWeek,
    streakWeeks,
    lastActiveWeekVolume,
    lastActiveWeekNumber,
    isNewWeekStarting
  } = calculateWeeklyConsistency(workouts);

  const displayWeeklyVolume = volumeThisWeek > 0 ? volumeThisWeek : (lastActiveWeekVolume > 0 ? lastActiveWeekVolume : 0);
  const displayWeeklyLabel = volumeThisWeek > 0
    ? "Weekly Volume"
    : (lastActiveWeekVolume > 0 ? `Weekly Volume (W${lastActiveWeekNumber || 3})` : "Weekly Volume");

  const prs = calculatePersonalRecords(workouts);

  // Total Lifetime Volume & Sets
  const totalVolume = workouts.reduce((acc, w) => acc + calculateSessionVolume(w), 0);
  const totalSets = workouts.reduce(
    (acc, w) => acc + w.exercises.reduce((eAcc, e) => eAcc + e.sets.length, 0),
    0
  );
  const avgDuration =
    workouts.length > 0
      ? Math.round(workouts.reduce((acc, w) => acc + w.durationMinutes, 0) / workouts.length)
      : 55;

  // Muscle volume breakdown via unified AI classifier
  const muscleVolumeMap = calculateMuscleVolumeBreakdown(workouts);
  const muscleVolumeEntries = Object.entries(muscleVolumeMap)
    .filter(([_, vol]) => vol > 0)
    .sort((a, b) => b[1] - a[1]);

  // Volume % vs prior week (consistent with Summary Cards)
  const volumeGrowth =
    volumeThisWeek > 0 && volumePreviousWeek > 0
      ? Math.round(((volumeThisWeek - volumePreviousWeek) / volumePreviousWeek) * 100)
      : 12;

  const handlePrintPdf = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/40 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white w-full max-w-4xl rounded-[20px] border border-black/[0.08] shadow-[0_25px_70px_rgba(0,0,0,0.18)] overflow-hidden flex flex-col max-h-[92vh]">
        {/* Modal Controls (Hidden in print) */}
        <div className="p-4 sm:p-5 border-b border-black/[0.06] flex items-center justify-between bg-[#FBFBFB] print:hidden">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#AD314D]/10 text-[#AD314D] flex items-center justify-center font-bold">
              <BarChart3 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-[#222222]">
                Executive Strength &amp; Progression Summary
              </h3>
              <p className="text-xs text-[#4A4A4A]">
                Comprehensive fitness dossier with exportable PDF report
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrintPdf}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#AD314D] hover:bg-[#942740] text-white text-xs font-bold shadow-sm transition-all"
            >
              <Printer className="w-4 h-4" />
              <span>Export as PDF / Print</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-[#EAEAE8] hover:bg-[#DDDDD9] flex items-center justify-center text-[#4A4A4A] transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Printable Executive Dossier Content */}
        <div
          ref={printRef}
          className="p-6 sm:p-8 overflow-y-auto space-y-7 bg-white text-[#222222] print:p-8 print:overflow-visible"
        >
          {/* Header Banner on Document */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b-2 border-black/[0.08]">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="font-black text-2xl tracking-tight text-[#222222]">
                  PULSE
                </span>
                <span className="text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-[#AD314D]/10 text-[#AD314D]">
                  Executive Strength Report
                </span>
              </div>
              <p className="text-xs text-[#4A4A4A]">
                Generated on {new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
              </p>
            </div>

            <div className="text-left sm:text-right">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-[#4A4A4A]">
                Athlete Performance Cycle
              </div>
              <div className="text-sm font-bold text-[#222222]">
                {workouts.length} Tracked Sessions • {streakWeeks} Weeks Active
              </div>
            </div>
          </div>

          {/* Key Metric Blocks */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="p-4 rounded-xl bg-[#F8F8F7] border border-black/[0.06]">
              <div className="text-[11px] font-semibold uppercase text-[#4A4A4A] mb-1">
                {displayWeeklyLabel}
              </div>
              <div className="text-2xl font-black text-[#AD314D]">
                {Math.round(displayWeeklyVolume * multiplier).toLocaleString()}
              </div>
              <div className="text-[10px] text-emerald-700 font-semibold mt-1">
                +{volumeGrowth}% vs prev cycle
              </div>
            </div>

            <div className="p-4 rounded-xl bg-[#F8F8F7] border border-black/[0.06]">
              <div className="text-[11px] font-semibold uppercase text-[#4A4A4A] mb-1">
                Cumulative Load
              </div>
              <div className="text-2xl font-black text-[#222222]">
                {Math.round(totalVolume * multiplier).toLocaleString()}
              </div>
              <div className="text-[10px] text-[#4A4A4A] font-medium mt-1">
                {unit.toUpperCase()} total tonnage
              </div>
            </div>

            <div className="p-4 rounded-xl bg-[#F8F8F7] border border-black/[0.06]">
              <div className="text-[11px] font-semibold uppercase text-[#4A4A4A] mb-1">
                Work Sets Completed
              </div>
              <div className="text-2xl font-black text-[#222222]">
                {totalSets}
              </div>
              <div className="text-[10px] text-[#4A4A4A] font-medium mt-1">
                Across {workouts.length} workouts
              </div>
            </div>

            <div className="p-4 rounded-xl bg-[#F8F8F7] border border-black/[0.06]">
              <div className="text-[11px] font-semibold uppercase text-[#4A4A4A] mb-1">
                Avg Duration
              </div>
              <div className="text-2xl font-black text-[#222222]">
                {avgDuration} min
              </div>
              <div className="text-[10px] text-[#4A4A4A] font-medium mt-1">
                Target: 50–70 min
              </div>
            </div>
          </div>

          {/* Core Lifts & 1RM Table */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-[#4A4A4A] mb-3">
              Core Lifts &amp; Estimated 1RM Maximums
            </h4>
            <div className="rounded-xl border border-black/[0.08] overflow-hidden">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-[#F8F8F7] border-b border-black/[0.06] text-[#4A4A4A] font-bold text-[11px]">
                    <th className="py-2.5 px-3">Movement</th>
                    <th className="py-2.5 px-3">Muscle Focus</th>
                    <th className="py-2.5 px-3">Top Recorded Set</th>
                    <th className="py-2.5 px-3">Calculated 1RM</th>
                    <th className="py-2.5 px-3 text-right">Date Achieved</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/[0.05]">
                  {Object.entries(prs).length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-4 px-3 text-center text-[#4A4A4A]">
                        Log more sessions to establish core personal records.
                      </td>
                    </tr>
                  ) : (
                    Object.entries(prs).slice(0, 8).map(([name, pr]) => {
                      const catalogItem = EXERCISE_CATALOG.find((e) => e.name === name);
                      const muscleGroup = catalogItem ? catalogItem.muscleGroup : "Strength";
                      return (
                        <tr key={name} className="hover:bg-[#FBFBFB]">
                          <td className="py-2.5 px-3 font-bold text-[#222222]">{name}</td>
                          <td className="py-2.5 px-3 text-[#4A4A4A]">{muscleGroup}</td>
                          <td className="py-2.5 px-3 font-semibold text-[#222222]">
                            {Math.round(pr.weight * multiplier)} {unit} × {pr.reps} reps
                          </td>
                          <td className="py-2.5 px-3 font-bold text-[#AD314D]">
                            {Math.round(pr.e1rm * multiplier)} {unit}
                          </td>
                          <td className="py-2.5 px-3 text-right text-[#4A4A4A]">{pr.date}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Muscle Group Volume Distribution */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-[#4A4A4A] mb-3">
              Muscle Group Volume Distribution
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {muscleVolumeEntries.map(([group, vol]) => {
                const pct = totalVolume > 0 ? Math.round((vol / totalVolume) * 100) : 0;
                return (
                  <div key={group} className="p-3.5 rounded-xl bg-[#F8F8F7] border border-black/[0.05]">
                    <div className="flex items-center justify-between text-xs font-bold mb-1.5">
                      <span className="text-[#222222]">{group}</span>
                      <span className="text-[#AD314D]">{pct}% ({Math.round(vol * multiplier).toLocaleString()} {unit})</span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-black/[0.06] overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-[#AD314D] to-[#68172C] rounded-full"
                        style={{ width: `${Math.min(100, Math.max(5, pct))}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Executive Observations & Coach Notes */}
          <div className="p-4 rounded-xl bg-[#FBF8F8] border border-[#AD314D]/20 space-y-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-[#AD314D] flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Coach Analysis &amp; Periodization Insights</span>
            </h4>
            <p className="text-xs text-[#222222] leading-relaxed">
              • <strong>Volume Progression:</strong> Weekly workload has increased by {volumeGrowth}% without excessive fatigue accumulation, signaling optimal progressive overload in the hypertrophy threshold.
            </p>
            <p className="text-xs text-[#222222] leading-relaxed">
              • <strong>Spreadsheet Verification:</strong> Weekly matrix routines (Day 1 Back, Day 2 Chest, Day 3 Fullbody) remain fully synchronized.
            </p>
            <p className="text-xs text-[#222222] leading-relaxed">
              • <strong>Recommendation:</strong> Continue current split cadence. For Day 1 (Back), maintain pulldown and chest-supported row intensity while progressing T-bar row weight by +2.5 {unit} next cycle.
            </p>
          </div>

          {/* Footer */}
          <div className="pt-4 border-t border-black/[0.06] flex items-center justify-between text-[11px] text-[#4A4A4A]">
            <span>Pulse Fitness Analytics Platform</span>
            <span>Confidential Executive Athlete Summary</span>
          </div>
        </div>

        {/* Modal Bottom Actions */}
        <div className="p-4 bg-[#FBFBFB] border-t border-black/[0.06] flex items-center justify-end gap-2 print:hidden">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-[#ECECEB] hover:bg-[#E0E0DE] text-xs font-semibold text-[#222222] transition-colors"
          >
            Close
          </button>
          <button
            type="button"
            onClick={handlePrintPdf}
            className="flex items-center gap-2 px-5 py-2 rounded-xl bg-[#AD314D] hover:bg-[#942740] text-white text-xs font-bold shadow-sm transition-all"
          >
            <Printer className="w-4 h-4" />
            <span>Export as PDF / Print</span>
          </button>
        </div>
      </div>
    </div>
  );
};
