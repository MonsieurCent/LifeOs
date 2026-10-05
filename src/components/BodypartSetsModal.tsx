import React, { useState } from "react";
import { X, Dumbbell, Sparkles, TrendingUp, CheckCircle2, AlertCircle, Layers } from "lucide-react";
import { WorkoutSession, WeightUnit, MuscleGroup } from "../types";
import { calculateBodypartSets } from "../utils/calculations";

interface BodypartSetsModalProps {
  isOpen: boolean;
  onClose: () => void;
  workouts: WorkoutSession[];
  unit: WeightUnit;
}

export const BodypartSetsModal: React.FC<BodypartSetsModalProps> = ({
  isOpen,
  onClose,
  workouts,
  unit
}) => {
  const [timeframe, setTimeframe] = useState<"thisWeek" | "allTime">("thisWeek");
  const [selectedBodypart, setSelectedBodypart] = useState<MuscleGroup | "All">("All");

  if (!isOpen) return null;

  const summaries = calculateBodypartSets(workouts);
  const totalSetsThisWeek = summaries.reduce((acc, s) => acc + s.setsThisWeek, 0);
  const totalSetsAllTime = summaries.reduce((acc, s) => acc + s.totalSets, 0);

  const displayedSummaries = selectedBodypart === "All" 
    ? summaries 
    : summaries.filter((s) => s.bodypart === selectedBodypart);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fadeIn">
      <div className="bg-[#ECECEB] rounded-[22px] border border-black/10 shadow-2xl max-w-3xl w-full max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="bg-white px-6 py-5 border-b border-black/[0.08] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#AD314D]/10 flex items-center justify-center text-[#AD314D]">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-[#222222] tracking-tight">
                  Sets per Bodypart
                </h2>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#AD314D]/10 text-[#AD314D]">
                  <Sparkles className="w-3 h-3" /> AI Matched
                </span>
              </div>
              <p className="text-xs text-[#4A4A4A] mt-0.5">
                Weekly hypertrophy set volume landmarks & movement breakdown
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-black/5 flex items-center justify-center text-[#4A4A4A] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Filters & Overview Bar */}
        <div className="bg-white/70 px-6 py-3 border-b border-black/[0.06] flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 overflow-x-auto py-0.5">
            <button
              onClick={() => setSelectedBodypart("All")}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
                selectedBodypart === "All"
                  ? "bg-[#222222] text-white shadow-sm"
                  : "bg-white text-[#4A4A4A] hover:bg-black/5 border border-black/[0.06]"
              }`}
            >
              All Bodyparts
            </button>
            {summaries.map((s) => (
              <button
                key={s.bodypart}
                onClick={() => setSelectedBodypart(s.bodypart)}
                className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-all ${
                  selectedBodypart === s.bodypart
                    ? "bg-[#AD314D] text-white shadow-sm"
                    : "bg-white text-[#4A4A4A] hover:bg-black/5 border border-black/[0.06]"
                }`}
              >
                {s.bodypart} ({timeframe === "thisWeek" ? s.setsThisWeek : s.totalSets})
              </button>
            ))}
          </div>

          <div className="flex items-center bg-black/[0.05] p-0.5 rounded-lg border border-black/[0.06]">
            <button
              onClick={() => setTimeframe("thisWeek")}
              className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${
                timeframe === "thisWeek"
                  ? "bg-white text-[#222222] shadow-sm"
                  : "text-[#4A4A4A] hover:text-[#222222]"
              }`}
            >
              This Week ({totalSetsThisWeek} sets)
            </button>
            <button
              onClick={() => setTimeframe("allTime")}
              className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${
                timeframe === "allTime"
                  ? "bg-white text-[#222222] shadow-sm"
                  : "text-[#4A4A4A] hover:text-[#222222]"
              }`}
            >
              All-Time ({totalSetsAllTime} sets)
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {displayedSummaries.map((item) => {
              const count = timeframe === "thisWeek" ? item.setsThisWeek : item.totalSets;
              const target = item.targetWeeklySets;
              const percent = Math.min(100, Math.round((count / target) * 100));

              return (
                <div
                  key={item.bodypart}
                  className="bg-white rounded-[18px] p-5 border border-black/[0.06] shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between"
                >
                  <div>
                    {/* Top Row */}
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-base font-bold text-[#222222]">
                            {item.bodypart}
                          </span>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-black/[0.05] text-[#4A4A4A]">
                            Target: {target} sets/wk
                          </span>
                        </div>
                        <span className="text-[11px] text-[#4A4A4A]">
                          {item.bodypart === "Arms" && "AI Matched: Biceps Curls, Hammer Curls, Tricep Pushdowns"}
                          {item.bodypart === "Chest" && "AI Matched: Bench Press, Incline DB, Pec Flies"}
                          {item.bodypart === "Back" && "AI Matched: Pulldowns, T-Bar Rows, Deadlifts, Chins"}
                          {item.bodypart === "Legs" && "AI Matched: Squats, RDLs, Leg Extensions, Lunges"}
                          {item.bodypart === "Shoulders" && "AI Matched: OHP, Face Pulls, Lateral Raises"}
                          {item.bodypart === "Core" && "AI Matched: Hanging Leg Raises, Planks, Crunches"}
                        </span>
                      </div>

                      <div className="text-right">
                        <div className="text-2xl font-bold text-[#222222]">
                          {count}
                        </div>
                        <div className="text-[10px] text-[#4A4A4A] font-medium uppercase tracking-wider">
                          Completed Sets
                        </div>
                      </div>
                    </div>

                    {/* Progress Gauge */}
                    <div className="space-y-1.5 my-3">
                      <div className="flex justify-between text-xs font-medium text-[#4A4A4A]">
                        <span>Volume Landmark Target</span>
                        <span className="text-[#222222] font-semibold">{percent}%</span>
                      </div>
                      <div className="w-full h-2 rounded-full bg-black/[0.06] overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${
                            count >= target
                              ? "bg-emerald-500"
                              : count >= target * 0.7
                              ? "bg-[#AD314D]"
                              : "bg-amber-500"
                          }`}
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                    </div>

                    {/* Exercise Breakdown */}
                    <div className="mt-4 pt-3 border-t border-black/[0.06]">
                      <div className="text-[11px] font-semibold text-[#4A4A4A] mb-2 uppercase tracking-wider">
                        Contributing Exercises:
                      </div>
                      <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                        {item.exercises.length > 0 ? (
                          item.exercises.map((ex, idx) => (
                            <div
                              key={idx}
                              className="flex items-center justify-between text-xs py-1 px-2 rounded-md bg-[#ECECEB]/60 hover:bg-[#ECECEB] transition-colors"
                            >
                              <span className="font-medium text-[#222222] truncate pr-2">
                                {ex.name}
                              </span>
                              <span className="font-bold text-[#AD314D] whitespace-nowrap">
                                {timeframe === "thisWeek" ? ex.setsThisWeek : ex.totalSets} sets
                              </span>
                            </div>
                          ))
                        ) : (
                          <div className="text-xs text-[#4A4A4A]/70 italic py-1">
                            No exercises logged for {item.bodypart} in this timeframe.
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Volume Guidance Note */}
                  <div className="mt-4 pt-2 border-t border-black/[0.04] flex items-center justify-between text-[11px]">
                    <span className="text-[#4A4A4A]">Hypertrophy Status:</span>
                    <span
                      className={`font-semibold ${
                        count >= target
                          ? "text-emerald-700"
                          : count >= target * 0.7
                          ? "text-[#AD314D]"
                          : "text-amber-700"
                      }`}
                    >
                      {count >= target
                        ? "Optimal Hypertrophy Volume"
                        : count >= target * 0.7
                        ? "Approaching Optimal MEV"
                        : "Maintenance / Low Volume"}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="bg-white px-6 py-4 border-t border-black/[0.08] flex items-center justify-between">
          <div className="text-xs text-[#4A4A4A]">
            AI dynamically classifies every exercise to its anatomical bodypart based on movement kinematics.
          </div>
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-[#222222] text-white font-medium text-xs hover:bg-black transition-colors"
          >
            Close Overview
          </button>
        </div>
      </div>
    </div>
  );
};
