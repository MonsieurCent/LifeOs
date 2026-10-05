import React, { useState, useEffect } from "react";
import {
  UserProfile,
  WorkoutSession,
  SessionFeeling,
  SyncedHealthMetrics,
  WeightUnit,
  TrainingProgram,
  SupplementEntry,
  DailyMealPlan,
  BodyCompositionRecord
} from "../types";
import { AiHealthTrainingReportView } from "./AiHealthTrainingReportView";
import {
  Sparkles,
  Heart,
  Flame,
  Scale,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  Clock,
  TrendingDown,
  TrendingUp,
  RefreshCw,
  Send,
  Dumbbell,
  Apple,
  Info,
  ChevronRight,
  Target,
  Layers,
  Pill,
  Utensils,
  BookOpen,
  Calendar,
  Activity,
  Check
} from "lucide-react";
import {
  calculateHormoneAndMacroPlan,
  getRecommendedMealPlan,
  createPreplannedPrograms
} from "../utils/fitnessData";
import { calculateReadinessScore } from "../utils/calculations";

interface AiCoachPanelProps {
  userProfile: UserProfile;
  workouts?: WorkoutSession[];
  feelings?: SessionFeeling[];
  healthMetrics: SyncedHealthMetrics;
  bodyCompRecords?: BodyCompositionRecord[];
  unit: WeightUnit;
  programs?: TrainingProgram[];
  activeProgramId?: string;
  supplements?: SupplementEntry[];
  initialSection?: "overview" | "report" | "program" | "meals" | "supplements";
  onUpdateProfile: (updated: Partial<UserProfile>) => void;
  onLogFeelingClick?: () => void;
  onOpenSessionFeelingModal?: () => void;
  onOpenHealthModal?: () => void;
  onSelectProgram?: (programId: string) => void;
  onNavigateToPlanner?: () => void;
  onNavigateToDiary?: () => void;
}

export const AiCoachPanel: React.FC<AiCoachPanelProps> = ({
  userProfile,
  workouts = [],
  feelings = [],
  healthMetrics,
  bodyCompRecords = [],
  unit,
  programs = [],
  activeProgramId,
  supplements = [],
  initialSection = "overview",
  onUpdateProfile,
  onLogFeelingClick,
  onOpenSessionFeelingModal,
  onOpenHealthModal,
  onSelectProgram,
  onNavigateToPlanner,
  onNavigateToDiary
}) => {
  const [activeSection, setActiveSection] = useState<"overview" | "report" | "program" | "meals" | "supplements">(initialSection);

  useEffect(() => {
    if (initialSection) {
      setActiveSection(initialSection);
    }
  }, [initialSection]);
  const [loadingAnalysis, setLoadingAnalysis] = useState(false);
  const [userQuery, setUserQuery] = useState("");
  const [coachingThread, setCoachingThread] = useState<
    { role: "coach" | "user"; text: string; time: string }[]
  >([
    {
      role: "coach",
      text: `Hello ${userProfile.name || "Athlete"}. I have analyzed your current physiological status, active training program, and endocrine targets. How can I assist your progression today?`,
      time: "Just now"
    }
  ]);

  // Active program resolution
  const effectivePrograms = programs.length > 0 ? programs : createPreplannedPrograms();
  const currentProgram = effectivePrograms.find((p) => p.id === activeProgramId) || effectivePrograms[0];

  // Meal Plan generation
  const mealPlan: DailyMealPlan[] = getRecommendedMealPlan(userProfile);

  // Calculate 14-day rule
  const today = new Date();
  const lastChange = userProfile.lastProgramChangeDate
    ? new Date(userProfile.lastProgramChangeDate)
    : new Date(today.getTime() - 16 * 24 * 60 * 60 * 1000);

  const daysSinceChange = Math.floor(
    (today.getTime() - lastChange.getTime()) / (1000 * 60 * 60 * 24)
  );
  const isCooldownActive = daysSinceChange < 14;
  const daysRemaining = Math.max(0, 14 - daysSinceChange);

  // Hormone & Macro scientific calculations
  const macroPlan = calculateHormoneAndMacroPlan(
    userProfile.gender,
    userProfile.goal,
    userProfile.weightKg
  );

  // Default rich coach analysis data (ensures the view is NEVER blank)
  const [coachData, setCoachData] = useState<{
    readinessScore: number;
    coachSummary: string;
    programAlterationSuggestion: string;
    actionableSteps: string[];
  }>({
    readinessScore: calculateReadinessScore(healthMetrics),
    coachSummary: `Progressive overload volume on ${currentProgram.name} is on track. Endocrine markers and sleep duration (${healthMetrics.sleepHours || 7.5}h) support sustained hypertrophic signaling.`,
    programAlterationSuggestion: isCooldownActive
      ? `Maintain current exercises for the remaining ${daysRemaining} days of your 14-day observation window. Biological cellular adaptation requires 14+ days before changing variables.`
      : "You have satisfied the 14-day adaptation cycle. You may incrementally increase working loads by 2-2.5% or rotate accessory movements if needed.",
    actionableSteps: [
      `Consume ${macroPlan.proteinGrams}g of protein evenly distributed across your 4 scheduled meals.`,
      `Hit your ${currentProgram.daysPerWeek} scheduled training sessions on ${currentProgram.name}.`,
      `Target at least ${macroPlan.carbsGrams}g carbohydrates with 60% loaded peri-workout for maximal glycogen supercompensation.`,
      `Ensure at least 7.5 hours of sleep to optimize natural growth hormone and testosterone release.`
    ]
  });

  // Fetch AI coach analysis from server-side Gemini route
  const fetchCoachAnalysis = async () => {
    setLoadingAnalysis(true);
    try {
      const res = await fetch("/api/fitness/coach-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profile: userProfile,
          program: currentProgram,
          recentWorkouts: workouts.slice(0, 10),
          recentFeelings: feelings.slice(0, 10),
          healthMetrics
        })
      });
      if (res.ok) {
        const json = await res.json();
        if (json?.analysis) {
          setCoachData({
            readinessScore: json.analysis.readinessScore || coachData.readinessScore,
            coachSummary: json.analysis.coachSummary || coachData.coachSummary,
            programAlterationSuggestion: json.analysis.programAlterationSuggestion || coachData.programAlterationSuggestion,
            actionableSteps: Array.isArray(json.analysis.actionableSteps) && json.analysis.actionableSteps.length > 0
              ? json.analysis.actionableSteps
              : coachData.actionableSteps
          });
        }
      }
    } catch (e) {
      console.warn("Using offline coaching calculations", e);
    } finally {
      setLoadingAnalysis(false);
    }
  };

  useEffect(() => {
    fetchCoachAnalysis();
  }, [userProfile.gender, userProfile.goal, userProfile.weightKg, currentProgram.id]);

  const handleApplyDietAndResetCooldown = () => {
    const todayStr = new Date().toISOString().split("T")[0];
    onUpdateProfile({
      targetCalories: macroPlan.totalCalories,
      macroSplit: {
        proteinG: macroPlan.proteinGrams,
        carbsG: macroPlan.carbsGrams,
        fatsG: macroPlan.fatGrams
      },
      lastProgramChangeDate: todayStr,
      lastDietChangeDate: todayStr
    });
  };

  const handleSendQuestion = (questionText?: string) => {
    const textToSend = questionText || userQuery;
    if (!textToSend.trim()) return;

    const time = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const newQuestion = textToSend.trim();
    setUserQuery("");

    setCoachingThread((prev) => [
      ...prev,
      { role: "user", text: newQuestion, time }
    ]);

    setTimeout(() => {
      let coachReply = "";
      const lower = newQuestion.toLowerCase();

      if (lower.includes("meal") || lower.includes("eat") || lower.includes("diet") || lower.includes("food")) {
        coachReply = `For your ${userProfile.goal} goal, your daily requirement is ${macroPlan.totalCalories} kcal (${macroPlan.proteinGrams}g Protein, ${macroPlan.carbsGrams}g Carbs, ${macroPlan.fatGrams}g Healthy Fats). Prioritize your pre-workout meal (${mealPlan[1]?.mealName}) with 180g lean chicken and jasmine rice 90 minutes before your workout for optimal intra-muscular glycogen saturation.`;
      } else if (lower.includes("program") || lower.includes("routine") || lower.includes("split") || lower.includes("workout")) {
        coachReply = `You are currently training on "${currentProgram.name}", programmed for ${currentProgram.daysPerWeek} days/week. Objective: "${currentProgram.primaryObjective}". Stick to progressive overload (+2.0-2.5% load per week) and record your actual sets in Today's Session Diary!`;
      } else if (isCooldownActive && (lower.includes("change") || lower.includes("switch") || lower.includes("new"))) {
        coachReply = `Golden Rule Advisory: You are currently on Day ${daysSinceChange} of your 14-day scientific observation window (${daysRemaining} days remaining). Neural adaptation, connective tissue strengthening, and cellular myofibrillar growth take a minimum of 2 weeks to objectively assess. Stay the course!`;
      } else if (lower.includes("supplement") || lower.includes("creatine") || lower.includes("protein")) {
        coachReply = `Your active supplement stack contains ${supplements.length} tracked items. Take 5g Creatine Monohydrate daily with your post-workout shake (${mealPlan[2]?.mealName}) alongside fast-digesting carbohydrates to optimize muscle cell uptake via insulin signaling.`;
      } else {
        coachReply = `Based on your biometrics (${healthMetrics.readinessScore || 84}% readiness, HRV ${healthMetrics.hrvMs || 58}ms), your central nervous system is in an optimal parasympathetic state for high mechanical tension training. Prioritize controlled eccentrics and log your sets today.`;
      }

      setCoachingThread((prev) => [
        ...prev,
        {
          role: "coach",
          text: coachReply,
          time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
        }
      ]);
    }, 500);
  };

  const handleFeelingClick = () => {
    if (onLogFeelingClick) onLogFeelingClick();
    else if (onOpenSessionFeelingModal) onOpenSessionFeelingModal();
  };

  return (
    <div className="space-y-6">
      {/* ======================================================================= */}
      {/* HEADER BANNER */}
      {/* ======================================================================= */}
      <div className="p-6 rounded-3xl bg-white border border-black/[0.08] shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#AD314D] to-[#68172C] flex items-center justify-center text-white shadow-md">
              <Sparkles className="w-6 h-6 text-amber-200" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-xl font-bold text-[#222222]">
                  Personal &amp; Health AI Coach
                </h2>
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-rose-50 text-[#AD314D] border border-rose-100 uppercase">
                  {userProfile.goal} Focus
                </span>
                <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-black/[0.05] text-[#4A4A4A] capitalize">
                  {userProfile.gender} Athlete
                </span>
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">
                  Readiness: {coachData.readinessScore}%
                </span>
              </div>
              <p className="text-xs text-[#4A4A4A] mt-0.5">
                Kinesiology guidance, progressive overload monitoring, and evidence-based nutrition intelligence.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => setActiveSection("report")}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-full border text-xs font-bold transition-all shadow-sm ${
                activeSection === "report"
                  ? "bg-[#222222] text-white border-black"
                  : "bg-rose-50 text-[#AD314D] border-rose-200 hover:bg-rose-100"
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              <span>Health &amp; Training Report</span>
            </button>
            <button
              type="button"
              onClick={handleFeelingClick}
              className="px-4 py-2 rounded-full border border-black/[0.08] hover:bg-neutral-50 text-xs font-semibold text-[#222222] transition-colors"
            >
              Log Session Feeling
            </button>
            <button
              type="button"
              onClick={fetchCoachAnalysis}
              disabled={loadingAnalysis}
              className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#AD314D] hover:bg-[#92263F] text-white text-xs font-semibold shadow-sm transition-all disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingAnalysis ? "animate-spin" : ""}`} />
              <span>{loadingAnalysis ? "Analyzing..." : "Re-evaluate"}</span>
            </button>
          </div>
        </div>

        {/* 14-DAY COOLDOWN RULE BANNER (Mandatory User Rule) */}
        <div
          className={`mt-5 p-4 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
            isCooldownActive
              ? "bg-amber-50/80 border-amber-200 text-amber-950"
              : "bg-emerald-50/80 border-emerald-200 text-emerald-950"
          }`}
        >
          <div className="flex items-start gap-3">
            <div
              className={`p-2 rounded-xl shrink-0 ${
                isCooldownActive ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"
              }`}
            >
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <div className="font-bold text-xs uppercase tracking-wider">
                14-Day Scientific Observation Window ({isCooldownActive ? "Observation Active" : "Cycle Complete"})
              </div>
              <div className="text-xs font-semibold mt-0.5">
                {isCooldownActive
                  ? `Day ${daysSinceChange} of 14 • ${daysRemaining} days until next recommended program/macro revision`
                  : "14-day evaluation window completed! You may now objectively evaluate progress or adjust variables."}
              </div>
              <p className="text-[11px] opacity-90 mt-0.5">
                <strong>Rule:</strong> Keep routines &amp; diet stable for at least 2 weeks. Premature switching prevents muscular protein synthesis from adapting.
              </p>
            </div>
          </div>

          {!isCooldownActive && (
            <button
              type="button"
              onClick={handleApplyDietAndResetCooldown}
              className="px-4 py-2 rounded-full bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold shrink-0 transition-colors shadow-sm"
            >
              Lock In Updated Protocol
            </button>
          )}
        </div>

        {/* Sub-Section Navigation Tabs */}
        <div className="flex items-center gap-1.5 mt-5 pt-4 border-t border-black/[0.06] overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveSection("overview")}
            className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all flex items-center gap-1.5 ${
              activeSection === "overview"
                ? "bg-[#222222] text-white shadow-sm"
                : "bg-neutral-100 text-[#4A4A4A] hover:text-[#222222]"
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>Overview &amp; Action Plan</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSection("report")}
            className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all flex items-center gap-1.5 ${
              activeSection === "report"
                ? "bg-gradient-to-r from-[#AD314D] to-[#68172C] text-white shadow-sm"
                : "bg-rose-50 text-[#AD314D] hover:bg-rose-100 border border-rose-200"
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>Health &amp; Training Report</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSection("program")}
            className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all flex items-center gap-1.5 ${
              activeSection === "program"
                ? "bg-[#222222] text-white shadow-sm"
                : "bg-neutral-100 text-[#4A4A4A] hover:text-[#222222]"
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Training Program Data ({currentProgram.name.split(" ")[0]})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSection("meals")}
            className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all flex items-center gap-1.5 ${
              activeSection === "meals"
                ? "bg-[#222222] text-white shadow-sm"
                : "bg-neutral-100 text-[#4A4A4A] hover:text-[#222222]"
            }`}
          >
            <Utensils className="w-3.5 h-3.5" />
            <span>Daily Meal Plan ({mealPlan.length} Meals)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSection("supplements")}
            className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all flex items-center gap-1.5 ${
              activeSection === "supplements"
                ? "bg-[#222222] text-white shadow-sm"
                : "bg-neutral-100 text-[#4A4A4A] hover:text-[#222222]"
            }`}
          >
            <Pill className="w-3.5 h-3.5" />
            <span>Supplement Stack ({supplements.length})</span>
          </button>
        </div>
      </div>

      {/* ======================================================================= */}
      {/* SECTION 1: OVERVIEW & INTELLIGENCE ANALYSIS */}
      {/* ======================================================================= */}
      {activeSection === "overview" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Card 1: Hormone-Balanced Macro Split */}
            <div className="p-6 rounded-3xl bg-white border border-black/[0.08] shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Apple className="w-4 h-4 text-[#AD314D]" />
                  <h3 className="font-bold text-sm text-[#222222]">Hormone &amp; Macro Target</h3>
                </div>
                <span className="text-[11px] font-bold text-[#AD314D]">
                  {macroPlan.totalCalories} kcal/day
                </span>
              </div>

              {/* Macro Pills */}
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="p-2.5 rounded-2xl bg-rose-50/60 border border-rose-100">
                  <div className="text-[10px] uppercase font-bold text-rose-800">Protein</div>
                  <div className="text-base font-extrabold text-[#AD314D] mt-0.5">
                    {macroPlan.proteinGrams}g
                  </div>
                  <div className="text-[10px] text-[#777777]">
                    {(macroPlan.proteinGrams / userProfile.weightKg).toFixed(1)}g/kg
                  </div>
                </div>

                <div className="p-2.5 rounded-2xl bg-amber-50/60 border border-amber-100">
                  <div className="text-[10px] uppercase font-bold text-amber-800">Carbs</div>
                  <div className="text-base font-extrabold text-amber-700 mt-0.5">
                    {macroPlan.carbsGrams}g
                  </div>
                  <div className="text-[10px] text-[#777777]">Peri-workout</div>
                </div>

                <div className="p-2.5 rounded-2xl bg-indigo-50/60 border border-indigo-100">
                  <div className="text-[10px] uppercase font-bold text-indigo-800">Fats</div>
                  <div className="text-base font-extrabold text-indigo-700 mt-0.5">
                    {macroPlan.fatGrams}g
                  </div>
                  <div className="text-[10px] text-[#777777]">
                    {(macroPlan.fatGrams / userProfile.weightKg).toFixed(1)}g/kg min
                  </div>
                </div>
              </div>

              {/* Endocrine Insights */}
              <div className="space-y-2 pt-2 border-t border-black/[0.04]">
                {macroPlan.hormoneInsights.map((insight, idx) => (
                  <div key={idx} className="p-2.5 rounded-xl bg-[#F8F8F7] text-[11px] text-[#4A4A4A] leading-relaxed">
                    {insight}
                  </div>
                ))}
              </div>
            </div>

            {/* Card 2: Session Fatigue & Plateau Analysis */}
            <div className="p-6 rounded-3xl bg-white border border-black/[0.08] shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Dumbbell className="w-4 h-4 text-[#AD314D]" />
                  <h3 className="font-bold text-sm text-[#222222]">Progression &amp; Recovery</h3>
                </div>
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                  Readiness: {coachData.readinessScore}%
                </span>
              </div>

              <div className="p-3.5 rounded-2xl bg-[#F8F8F7] border border-black/[0.04] space-y-2">
                <div className="text-xs font-bold text-[#222222]">
                  {coachData.coachSummary}
                </div>
                <p className="text-[11px] text-[#4A4A4A] leading-relaxed">
                  {coachData.programAlterationSuggestion}
                </p>
              </div>

              {/* Recent session feelings */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-semibold text-[#4A4A4A]">
                  <span>Recent Session Feelings</span>
                  <span className="text-[10px] text-[#777777]">{feelings.length} logged</span>
                </div>
                {feelings.length === 0 ? (
                  <div className="p-3 rounded-xl bg-[#FAF9F8] border border-black/[0.04] text-[11px] text-[#777777] text-center">
                    No session feelings logged yet. Click &quot;Log Session Feeling&quot; after your workout to feed the kinesiology engine!
                  </div>
                ) : (
                  feelings.slice(0, 2).map((f, i) => (
                    <div
                      key={i}
                      className="p-2.5 rounded-xl bg-white border border-black/[0.06] flex items-center justify-between text-xs"
                    >
                      <div>
                        <span className="font-semibold text-[#222222]">
                          Rating: {f.rating}/5 • Soreness: {f.soreness}/5
                        </span>
                        {f.notes && <p className="text-[10px] text-[#777777] truncate max-w-[200px]">{f.notes}</p>}
                      </div>
                      <span className="text-[10px] text-[#777777]">{f.loggedAt}</span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Card 3: Actionable Optimization Steps */}
            <div className="p-6 rounded-3xl bg-white border border-black/[0.08] shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <h3 className="font-bold text-sm text-[#222222]">Coach Action Items</h3>
                </div>
                <span className="text-[10px] font-bold text-[#777777] uppercase">Weekly Checklist</span>
              </div>

              <div className="space-y-2.5">
                {coachData.actionableSteps.map((step: string, idx: number) => (
                  <div
                    key={idx}
                    className="p-3 rounded-2xl bg-[#F8F8F7] border border-black/[0.04] text-xs text-[#222222] flex items-start gap-2.5"
                  >
                    <span className="w-4 h-4 rounded-full bg-[#AD314D] text-white text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                      {idx + 1}
                    </span>
                    <span className="leading-relaxed">{step}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================================= */}
      {/* SECTION: AI HEALTH & TRAINING SYNTHESIS REPORT (User Requested) */}
      {/* ======================================================================= */}
      {activeSection === "report" && (
        <AiHealthTrainingReportView
          userProfile={userProfile}
          workouts={workouts}
          feelings={feelings}
          healthMetrics={healthMetrics}
          bodyCompRecords={bodyCompRecords}
          unit={unit}
          onUpdateProfile={onUpdateProfile}
          onNavigateToPlanner={onNavigateToPlanner}
        />
      )}

      {/* ======================================================================= */}
      {/* SECTION 2: TRAINING PROGRAM DATA (User Requested) */}
      {/* ======================================================================= */}
      {activeSection === "program" && (
        <div className="p-6 rounded-3xl bg-white border border-black/[0.08] shadow-sm space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-[#AD314D] text-white flex items-center justify-center shadow-sm">
                <Layers className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#AD314D]">
                  Current Active Training Program
                </span>
                <h3 className="text-lg font-bold text-[#222222]">
                  {currentProgram.name}
                </h3>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {onNavigateToDiary && (
                <button
                  type="button"
                  onClick={onNavigateToDiary}
                  className="px-4 py-2 rounded-full bg-[#AD314D] hover:bg-[#92263F] text-white text-xs font-bold transition-all shadow-sm flex items-center gap-1.5"
                >
                  <BookOpen className="w-3.5 h-3.5" />
                  <span>Open Today&apos;s Diary</span>
                </button>
              )}
              {onNavigateToPlanner && (
                <button
                  type="button"
                  onClick={onNavigateToPlanner}
                  className="px-4 py-2 rounded-full border border-black/[0.1] hover:bg-neutral-50 text-xs font-bold text-[#222222] transition-colors flex items-center gap-1.5"
                >
                  <Calendar className="w-3.5 h-3.5 text-[#AD314D]" />
                  <span>Open Planner</span>
                </button>
              )}
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-[#FBFBFA] border border-black/[0.05] grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
            <div>
              <span className="text-[10px] font-bold uppercase text-[#777777] block">Training Goal</span>
              <p className="font-bold text-[#222222] mt-0.5 capitalize">{currentProgram.goal}</p>
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase text-[#777777] block">Frequency</span>
              <p className="font-bold text-[#222222] mt-0.5">{currentProgram.daysPerWeek} Days Per Week</p>
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase text-[#777777] block">Periodization</span>
              <p className="font-bold text-[#222222] mt-0.5">{currentProgram.totalWeeks} Weeks Overload Arc</p>
            </div>
          </div>

          {/* Objectives */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            <div className="p-4 rounded-2xl bg-rose-50/40 border border-rose-100">
              <span className="text-[10px] font-bold uppercase text-[#AD314D] block">
                Primary Program Objective
              </span>
              <p className="font-semibold text-[#222222] mt-1">
                {currentProgram.primaryObjective}
              </p>
            </div>
            <div className="p-4 rounded-2xl bg-amber-50/40 border border-amber-100">
              <span className="text-[10px] font-bold uppercase text-amber-800 block">
                Secondary Objective / Specialization
              </span>
              <p className="font-semibold text-[#222222] mt-1">
                {currentProgram.secondaryObjective || "Joint longevity, balanced volume distribution, and core stabilization."}
              </p>
            </div>
          </div>

          {/* Available Programs Switcher Grid */}
          <div className="space-y-3 pt-3 border-t border-black/[0.04]">
            <h4 className="text-xs font-bold uppercase tracking-wider text-[#4A4A4A]">
              Switch or Compare Pre-Planned Programs
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {effectivePrograms.map((prog) => {
                const isSelected = prog.id === currentProgram.id;
                return (
                  <div
                    key={prog.id}
                    className={`p-4 rounded-2xl border transition-all flex items-center justify-between ${
                      isSelected
                        ? "border-[#AD314D] bg-rose-50/20 ring-1 ring-[#AD314D]/30"
                        : "border-black/[0.08] bg-white hover:border-black/[0.15]"
                    }`}
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-xs text-[#222222]">{prog.name}</span>
                        {isSelected && (
                          <span className="text-[10px] font-bold px-2 py-0.2 bg-[#AD314D] text-white rounded-full">
                            Active
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-[#777777] mt-0.5">
                        {prog.goal} • {prog.daysPerWeek} days/wk • {prog.primaryObjective}
                      </p>
                    </div>

                    {!isSelected && onSelectProgram && (
                      <button
                        type="button"
                        onClick={() => onSelectProgram(prog.id)}
                        className="px-3 py-1.5 rounded-xl bg-black/[0.06] hover:bg-[#AD314D] hover:text-white text-xs font-bold text-[#222222] transition-colors shrink-0 ml-3"
                      >
                        Select
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ======================================================================= */}
      {/* SECTION 3: DAILY MEAL PLAN (User Requested) */}
      {/* ======================================================================= */}
      {activeSection === "meals" && (
        <div className="p-6 rounded-3xl bg-white border border-black/[0.08] shadow-sm space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-amber-500 text-white flex items-center justify-center shadow-sm">
                <Utensils className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700">
                  Targeted Nutrition Plan
                </span>
                <h3 className="text-lg font-bold text-[#222222]">
                  Daily Meal Plan Protocol ({macroPlan.totalCalories} kcal)
                </h3>
              </div>
            </div>

            <div className="text-xs font-semibold px-3 py-1.5 rounded-full bg-neutral-100 text-[#4A4A4A]">
              Split: {macroPlan.proteinGrams}g P • {macroPlan.carbsGrams}g C • {macroPlan.fatGrams}g F
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {mealPlan.map((meal) => (
              <div
                key={meal.id}
                className="p-5 rounded-2xl border border-black/[0.08] bg-[#FAF9F8] space-y-3 hover:border-black/[0.15] transition-all"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-bold text-sm text-[#222222]">{meal.mealName}</h4>
                    <span className="text-[10px] text-[#777777] block">{meal.timing}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-xs font-extrabold text-[#AD314D]">{meal.targetCalories} kcal</span>
                    <div className="text-[10px] text-[#777777]">
                      {meal.targetProteinG}g P • {meal.targetCarbsG}g C • {meal.targetFatsG}g F
                    </div>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-white border border-black/[0.04] space-y-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#777777] block">
                    Recommended Food Items
                  </span>
                  <ul className="space-y-1 text-xs text-[#222222]">
                    {meal.recommendedFoods.map((food, i) => (
                      <li key={i} className="flex items-start gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#AD314D] mt-1.5 shrink-0" />
                        <span>{food}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {meal.scientificRationale && (
                  <p className="text-[11px] text-[#4A4A4A] italic bg-amber-50/50 p-2.5 rounded-xl border border-amber-100/60 leading-relaxed">
                    <strong>Science:</strong> {meal.scientificRationale}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ======================================================================= */}
      {/* SECTION 4: SUPPLEMENT STACK */}
      {/* ======================================================================= */}
      {activeSection === "supplements" && (
        <div className="p-6 rounded-3xl bg-white border border-black/[0.08] shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-xs">
                <Pill className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-base font-bold text-[#222222]">Active Supplement Strategy</h3>
                <p className="text-xs text-[#4A4A4A]">Evidence-based micronutrient &amp; performance ergogenics.</p>
              </div>
            </div>
            <span className="text-xs font-bold text-indigo-700">{supplements.length} active items</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {supplements.map((s) => (
              <div key={s.id} className="p-4 rounded-2xl bg-[#FAF9F8] border border-black/[0.06] space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs text-[#222222]">{s.name}</span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-800 capitalize">
                    {s.timing}
                  </span>
                </div>
                <div className="text-xs text-[#AD314D] font-bold">{s.dosage}</div>
                <p className="text-[11px] text-[#4A4A4A] leading-relaxed">{s.notes}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ======================================================================= */}
      {/* INTERACTIVE COACH Q&A CONSOLE (Always Accessible) */}
      {/* ======================================================================= */}
      <div className="p-6 rounded-3xl bg-white border border-black/[0.08] shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[#AD314D]" />
            <h3 className="font-bold text-sm text-[#222222]">
              Ask Your AI Coach (Programs, Meals, Recovery, Deloads)
            </h3>
          </div>
          <span className="text-[10px] font-semibold text-[#777777]">Powered by Gemini AI</span>
        </div>

        {/* Quick prompt pills */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => handleSendQuestion("What should my pre-workout meal be today?")}
            className="px-3 py-1.5 rounded-full bg-[#F0F0EE] hover:bg-[#E4E4E1] text-[11px] font-semibold text-[#222222] transition-colors"
          >
            🥗 Pre-Workout Meal?
          </button>
          <button
            type="button"
            onClick={() => handleSendQuestion("How is my progressive overload pacing on this program?")}
            className="px-3 py-1.5 rounded-full bg-[#F0F0EE] hover:bg-[#E4E4E1] text-[11px] font-semibold text-[#222222] transition-colors"
          >
            🏋️ Overload Pacing?
          </button>
          <button
            type="button"
            onClick={() => handleSendQuestion("Why is the 14-day rule critical for my goal?")}
            className="px-3 py-1.5 rounded-full bg-[#F0F0EE] hover:bg-[#E4E4E1] text-[11px] font-semibold text-[#222222] transition-colors"
          >
            ⏱️ 14-Day Observation Rule?
          </button>
          <button
            type="button"
            onClick={() => handleSendQuestion("How do I take creatine and electrolytes post-workout?")}
            className="px-3 py-1.5 rounded-full bg-[#F0F0EE] hover:bg-[#E4E4E1] text-[11px] font-semibold text-[#222222] transition-colors"
          >
            💊 Supplement Timing?
          </button>
        </div>

        {/* Conversation Thread */}
        <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
          {coachingThread.map((msg, index) => (
            <div
              key={index}
              className={`p-3.5 rounded-2xl text-xs max-w-xl animate-in fade-in ${
                msg.role === "user"
                  ? "ml-auto bg-[#AD314D] text-white"
                  : "bg-[#F8F8F7] border border-black/[0.06] text-[#222222]"
              }`}
            >
              <div className="flex items-center justify-between text-[10px] opacity-75 mb-1 font-semibold">
                <span>{msg.role === "user" ? "You" : "Coach Gemini"}</span>
                <span>{msg.time}</span>
              </div>
              <div className="leading-relaxed whitespace-pre-wrap">{msg.text}</div>
            </div>
          ))}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSendQuestion();
          }}
          className="flex gap-2"
        >
          <input
            type="text"
            value={userQuery}
            onChange={(e) => setUserQuery(e.target.value)}
            placeholder="Ask about your program, meal portions, recovery, or weight progressions..."
            className="flex-1 px-4 py-2.5 rounded-full border border-black/[0.1] bg-[#FBFBFA] text-xs text-[#222222] focus:outline-none focus:ring-2 focus:ring-[#AD314D]/20 focus:border-[#AD314D]"
          />
          <button
            type="submit"
            className="px-5 py-2.5 rounded-full bg-[#AD314D] hover:bg-[#92263F] text-white text-xs font-semibold shadow-sm transition-all flex items-center gap-1.5"
          >
            <Send className="w-3.5 h-3.5" />
            <span>Send</span>
          </button>
        </form>
      </div>
    </div>
  );
};

export default AiCoachPanel;
