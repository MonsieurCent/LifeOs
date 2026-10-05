import React, { useState } from "react";
import {
  UserProfile,
  FitnessGoal,
  UserGender,
  ExperienceLevel,
  WeeklyMatrixPlan,
  DayOfWeek
} from "../types";
import { DAYS_OF_WEEK, autoFillWeeksFromWeek1 } from "../utils/fitnessData";
import {
  Sparkles,
  Dumbbell,
  Calendar,
  CheckCircle2,
  X,
  RefreshCw,
  Flame,
  ArrowRight
} from "lucide-react";

interface AiProgramGeneratorModalProps {
  isOpen: boolean;
  onClose: () => void;
  userProfile: UserProfile;
  onApplyGeneratedProgram: (plans: WeeklyMatrixPlan[]) => void;
}

export const AiProgramGeneratorModal: React.FC<AiProgramGeneratorModalProps> = ({
  isOpen,
  onClose,
  userProfile,
  onApplyGeneratedProgram
}) => {
  const [goal, setGoal] = useState<FitnessGoal>(userProfile.goal || "bulk");
  const [gender, setGender] = useState<UserGender>(userProfile.gender || "male");
  const [level, setLevel] = useState<ExperienceLevel>(userProfile.level || "intermediate");
  const [daysPerWeek, setDaysPerWeek] = useState<number>(userProfile.daysPerWeek || 4);
  const [weeksCount, setWeeksCount] = useState<4 | 8 | 12>(4);
  const [targetFocus, setTargetFocus] = useState("Hypertrophy & progressive overload on compounds");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedResult, setGeneratedResult] = useState<any>(null);

  if (!isOpen) return null;

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsGenerating(true);
    try {
      const res = await fetch("/api/fitness/generate-program", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          goal,
          gender,
          level,
          daysPerWeek,
          weeksCount,
          targetFocus
        })
      });

      if (res.ok) {
        const json = await res.json();
        setGeneratedResult(json.program);
      }
    } catch (err) {
      console.warn("Generation error", err);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleApply = () => {
    if (!generatedResult || !generatedResult.schedule) return;

    // Convert schedule into Week 1
    const week1Days: Record<DayOfWeek, any> = {} as any;

    for (const d of DAYS_OF_WEEK) {
      const sched = generatedResult.schedule.find(
        (s: any) => s.day?.toLowerCase() === d.toLowerCase()
      );
      if (sched) {
        week1Days[d] = {
          day: d,
          workoutTitle: sched.workoutTitle || `${d} Training`,
          isRestDay: sched.isRest ?? false,
          targetMuscleGroup: sched.muscleGroup,
          notes: "Week 1 Baseline",
          exercises: (sched.exercises || []).map((ex: any) => ({
            exerciseName: ex.exerciseName,
            muscleGroup: ex.muscleGroup || "Chest",
            targetSets: ex.targetSets || 3,
            targetReps: String(ex.targetReps || "8-12"),
            targetWeight: ex.targetWeight || 50,
            warmupNotes: ex.warmupNotes
          }))
        };
      } else {
        week1Days[d] = {
          day: d,
          workoutTitle: "Rest & Active Recovery",
          isRestDay: true,
          targetMuscleGroup: "Rest",
          notes: "Rest Day",
          exercises: []
        };
      }
    }

    const week1Plan: WeeklyMatrixPlan = {
      weekNumber: 1,
      weekTheme: "Base Accumulation",
      days: week1Days
    };

    // Auto-fill across 4, 8, or 12 weeks
    const multiWeekPlans = autoFillWeeksFromWeek1(week1Plan, weeksCount, 2.5);
    onApplyGeneratedProgram(multiWeekPlans);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
      <div className="w-full max-w-2xl bg-white rounded-3xl shadow-2xl border border-black/[0.08] overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-5 border-b border-black/[0.06] bg-[#F7F7F6] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-[#AD314D] to-[#601427] text-white flex items-center justify-center shadow-sm">
              <Sparkles className="w-5 h-5 text-amber-300" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#222222]">
                AI Training Program Generator
              </h2>
              <p className="text-xs text-[#4A4A4A]">
                Evidence-based periodization tailored to biological sex, goals, and weekly frequency
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full text-[#777777] hover:bg-black/[0.05]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-5">
          {!generatedResult ? (
            <form onSubmit={handleGenerate} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-[#222222] mb-1">
                    Primary Goal
                  </label>
                  <select
                    value={goal}
                    onChange={(e) => setGoal(e.target.value as FitnessGoal)}
                    className="w-full px-3 py-2 rounded-xl border border-black/[0.1] text-xs bg-[#FBFBFA]"
                  >
                    <option value="bulk">Bulk & Hypertrophy</option>
                    <option value="shred">Shred & Fat Loss</option>
                    <option value="longevity">Longevity & Joint Health</option>
                    <option value="strength">Pure Strength</option>
                    <option value="recomp">Body Recomposition</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#222222] mb-1">
                    Biological Sex
                  </label>
                  <select
                    value={gender}
                    onChange={(e) => setGender(e.target.value as UserGender)}
                    className="w-full px-3 py-2 rounded-xl border border-black/[0.1] text-xs bg-[#FBFBFA]"
                  >
                    <option value="male">Male (Testosterone / Upper Bias)</option>
                    <option value="female">Female (Progesterone / Posterior Bias)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#222222] mb-1">
                    Lifting Level
                  </label>
                  <select
                    value={level}
                    onChange={(e) => setLevel(e.target.value as ExperienceLevel)}
                    className="w-full px-3 py-2 rounded-xl border border-black/[0.1] text-xs bg-[#FBFBFA]"
                  >
                    <option value="beginner">Beginner (&lt; 1 yr)</option>
                    <option value="intermediate">Intermediate (1-3 yrs)</option>
                    <option value="advanced">Advanced (3+ yrs)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#222222] mb-1">
                    Training Frequency
                  </label>
                  <select
                    value={daysPerWeek}
                    onChange={(e) => setDaysPerWeek(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl border border-black/[0.1] text-xs bg-[#FBFBFA]"
                  >
                    <option value={3}>3 Days / Week</option>
                    <option value={4}>4 Days / Week (Upper / Lower)</option>
                    <option value={5}>5 Days / Week (PPL + Upper/Lower)</option>
                    <option value={6}>6 Days / Week (PPL 2x)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#222222] mb-1">
                    Cycle Duration
                  </label>
                  <select
                    value={weeksCount}
                    onChange={(e) => setWeeksCount(Number(e.target.value) as any)}
                    className="w-full px-3 py-2 rounded-xl border border-black/[0.1] text-xs bg-[#FBFBFA]"
                  >
                    <option value={4}>4 Weeks (Accumulation & Deload)</option>
                    <option value={8}>8 Weeks (Volume & Intensification)</option>
                    <option value={12}>12 Weeks (Full Periodized Macrocycle)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#222222] mb-1">
                    Target Muscle Focus
                  </label>
                  <input
                    type="text"
                    value={targetFocus}
                    onChange={(e) => setTargetFocus(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-black/[0.1] text-xs bg-[#FBFBFA]"
                  />
                </div>
              </div>

              <div className="pt-3 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-full border text-xs font-semibold text-[#4A4A4A]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isGenerating}
                  className="px-5 py-2 rounded-full bg-[#AD314D] hover:bg-[#92263F] text-white text-xs font-semibold shadow-sm flex items-center gap-1.5 transition-all disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isGenerating ? "animate-spin" : ""}`} />
                  <span>{isGenerating ? "Generating Program..." : "Generate AI Routine"}</span>
                </button>
              </div>
            </form>
          ) : (
            <div className="space-y-4 animate-in fade-in">
              <div className="p-4 rounded-2xl bg-[#F8F8F7] border border-black/[0.06] space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-rose-50 text-[#AD314D]">
                    {weeksCount}-Week Periodization
                  </span>
                  <h3 className="font-bold text-sm text-[#222222]">
                    {generatedResult.programTitle}
                  </h3>
                </div>
                <p className="text-xs text-[#4A4A4A] leading-relaxed">
                  {generatedResult.periodizationOverview}
                </p>
                {generatedResult.nextPhaseSuggestion && (
                  <div className="pt-2 border-t border-black/[0.04] text-[11px] text-emerald-800 font-medium">
                    💡 <strong>Next Training Suggestion:</strong> {generatedResult.nextPhaseSuggestion}
                  </div>
                )}
              </div>

              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {generatedResult.schedule.map((day: any, idx: number) => (
                  <div
                    key={idx}
                    className="p-3 rounded-2xl bg-white border border-black/[0.06] flex items-center justify-between text-xs"
                  >
                    <div>
                      <span className="font-bold text-[#222222] mr-2">{day.day}:</span>
                      <span className="text-[#4A4A4A]">{day.workoutTitle}</span>
                    </div>
                    <span className="text-[11px] text-[#777777]">
                      {day.isRest ? "Rest" : `${day.exercises?.length || 0} exercises`}
                    </span>
                  </div>
                ))}
              </div>

              <div className="pt-3 flex justify-between items-center border-t border-black/[0.06]">
                <button
                  type="button"
                  onClick={() => setGeneratedResult(null)}
                  className="text-xs font-semibold text-[#4A4A4A] hover:text-[#222222]"
                >
                  ← Adjust Parameters
                </button>
                <button
                  type="button"
                  onClick={handleApply}
                  className="px-6 py-2.5 rounded-full bg-gradient-to-r from-[#AD314D] to-[#8C1E37] text-white text-xs font-semibold shadow-md flex items-center gap-1.5 transition-all hover:brightness-105"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Apply to Weekly Planner</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
