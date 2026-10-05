import React, { useState, useEffect } from "react";
import {
  UserProfile,
  WorkoutSession,
  SessionFeeling,
  SyncedHealthMetrics,
  WeightUnit,
  BodyCompositionRecord,
  HealthTrainingReport
} from "../types";
import {
  Sparkles,
  Activity,
  Heart,
  Flame,
  Moon,
  Footprints,
  Dumbbell,
  Calendar,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  Download,
  Copy,
  Check,
  AlertTriangle,
  CheckCircle2,
  Zap,
  Apple,
  Scale,
  ChevronRight,
  Info,
  Clock,
  ArrowRight,
  ShieldCheck
} from "lucide-react";

interface AiHealthTrainingReportViewProps {
  userProfile: UserProfile;
  workouts: WorkoutSession[];
  feelings?: SessionFeeling[];
  healthMetrics: SyncedHealthMetrics;
  bodyCompRecords?: BodyCompositionRecord[];
  unit: WeightUnit;
  onUpdateProfile?: (updated: Partial<UserProfile>) => void;
  onNavigateToPlanner?: () => void;
}

type TimeRangePreset = "7d" | "14d" | "30d" | "90d" | "custom";

export const AiHealthTrainingReportView: React.FC<AiHealthTrainingReportViewProps> = ({
  userProfile,
  workouts = [],
  feelings = [],
  healthMetrics,
  bodyCompRecords = [],
  unit,
  onUpdateProfile,
  onNavigateToPlanner
}) => {
  const [selectedRange, setSelectedRange] = useState<TimeRangePreset>("7d");
  const [customStartDate, setCustomStartDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().split("T")[0];
  });
  const [customEndDate, setCustomEndDate] = useState<string>(() => {
    return new Date().toISOString().split("T")[0];
  });

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [report, setReport] = useState<HealthTrainingReport | null>(null);
  const [copied, setCopied] = useState(false);
  const [appliedActions, setAppliedActions] = useState<Record<string, boolean>>({});

  // Calculate start & end string based on preset or custom
  const getDateWindow = (range: TimeRangePreset) => {
    const today = new Date();
    const endStr = today.toISOString().split("T")[0];
    let startD = new Date();

    if (range === "7d") {
      startD.setDate(today.getDate() - 7);
    } else if (range === "14d") {
      startD.setDate(today.getDate() - 14);
    } else if (range === "30d") {
      startD.setDate(today.getDate() - 30);
    } else if (range === "90d") {
      startD.setDate(today.getDate() - 90);
    } else {
      return {
        startDate: customStartDate || new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0],
        endDate: customEndDate || endStr
      };
    }

    return {
      startDate: startD.toISOString().split("T")[0],
      endDate: endStr
    };
  };

  // Generate / Fetch Report from API
  const generateReport = async (range: TimeRangePreset = selectedRange) => {
    setLoading(true);
    setErrorMsg(null);

    const { startDate, endDate } = getDateWindow(range);

    try {
      const res = await fetch("/api/fitness/health-training-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          timeRange: range,
          startDate,
          endDate,
          profile: userProfile,
          workouts,
          feelings,
          healthMetrics,
          bodyCompRecords
        })
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `Server responded with status ${res.status}`);
      }

      const data = await res.json();
      if (data?.report) {
        setReport(data.report);
        // Cache to localStorage for fast initial render
        try {
          localStorage.setItem(`lifeos_health_report_${range}`, JSON.stringify(data.report));
        } catch {
          // Ignore quota errors
        }
      } else {
        throw new Error("Report payload was empty from server.");
      }
    } catch (err: any) {
      console.error("Health report generation error:", err);
      setErrorMsg(err.message || "Failed to generate AI health report. Using sports-science analysis.");
    } finally {
      setLoading(false);
    }
  };

  // On initial mount or preset change, check localStorage cache or generate
  useEffect(() => {
    const cached = localStorage.getItem(`lifeos_health_report_${selectedRange}`);
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (parsed && parsed.biometricSignals) {
          setReport(parsed);
          return;
        }
      } catch {
        // Fallback to generating
      }
    }
    generateReport(selectedRange);
  }, [selectedRange]);

  // Handle action item apply
  const handleApplyAction = (action: HealthTrainingReport["prescriptiveActionPlan"][0]) => {
    setAppliedActions((prev) => ({ ...prev, [action.id]: true }));

    if (action.category === "nutrition" && onUpdateProfile) {
      // Check if recommendation mentions adjusting calories
      const matchPlus = action.recommendation.match(/\+(\d+)\s*kcal/i);
      const matchMinus = action.recommendation.match(/-(\d+)\s*kcal/i);
      const currentCal = userProfile.targetCalories || 2800;

      if (matchPlus && matchPlus[1]) {
        const delta = parseInt(matchPlus[1], 10);
        onUpdateProfile({ targetCalories: currentCal + delta });
      } else if (matchMinus && matchMinus[1]) {
        const delta = parseInt(matchMinus[1], 10);
        onUpdateProfile({ targetCalories: Math.max(1500, currentCal - delta) });
      }
    }
  };

  // Copy full summary to clipboard
  const handleCopySummary = () => {
    if (!report) return;
    const text = `LIFEOS AI COACH HEALTH & TRAINING REPORT
Period: ${report.periodLabel}
Overall Score: ${report.overallScore}/100 (${report.overallStatus})

EXECUTIVE SUMMARY:
${report.executiveSummary}

BIOMETRIC & TRAINING TELEMETRY:
• Sleep & Recovery: ${report.biometricSignals.sleepAndCns.avgSleepFormatted} avg sleep, ${report.biometricSignals.sleepAndCns.restingHeartRateAvg} RHR
• Energy Balance: ${report.biometricSignals.metabolicAndEnergy.avgDailyBurnKcal} kcal burn vs ${report.biometricSignals.metabolicAndEnergy.targetIntakeKcal} kcal target (Net: ${report.biometricSignals.metabolicAndEnergy.netBalanceKcal}), ${report.biometricSignals.metabolicAndEnergy.avgDailySteps.toLocaleString()} daily steps
• Training Volume: ${report.biometricSignals.trainingStrain.completedSessions} workouts, ${report.biometricSignals.trainingStrain.totalVolumeKg.toLocaleString()} kg volume moved (Avg RPE: ${report.biometricSignals.trainingStrain.avgRpe})

PRESCRIPTIVE SUGGESTIONS FOR CHANGES:
${report.prescriptiveActionPlan.map((act, i) => `${i + 1}. [${act.category.toUpperCase()}] ${act.title}: ${act.recommendation} (Rationale: ${act.rationale})`).join("\n")}
`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  // Print report
  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      {/* ------------------------------------------------------------------- */}
      {/* CONTROL BAR: TIMEFRAME SELECTOR & ACTIONS */}
      {/* ------------------------------------------------------------------- */}
      <div className="bg-white rounded-3xl p-5 border border-black/[0.08] shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-xl bg-gradient-to-br from-[#AD314D] to-[#68172C] text-white">
                <Sparkles className="w-4 h-4 text-amber-300" />
              </span>
              <h3 className="text-base font-bold text-[#222222]">
                AI Health &amp; Training Report Horizon
              </h3>
            </div>
            <p className="text-xs text-[#666666] mt-1">
              Synthesizing Google Health telemetry (sleep, calories, steps, HRV) with training progressive overload.
            </p>
          </div>

          {/* Timeframe preset pills */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              type="button"
              onClick={() => setSelectedRange("7d")}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                selectedRange === "7d"
                  ? "bg-[#222222] text-white shadow-sm"
                  : "bg-neutral-100 text-[#4A4A4A] hover:bg-neutral-200"
              }`}
            >
              7 Days
            </button>
            <button
              type="button"
              onClick={() => setSelectedRange("14d")}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                selectedRange === "14d"
                  ? "bg-[#222222] text-white shadow-sm"
                  : "bg-neutral-100 text-[#4A4A4A] hover:bg-neutral-200"
              }`}
            >
              14 Days (Adaptation Window)
            </button>
            <button
              type="button"
              onClick={() => setSelectedRange("30d")}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                selectedRange === "30d"
                  ? "bg-[#222222] text-white shadow-sm"
                  : "bg-neutral-100 text-[#4A4A4A] hover:bg-neutral-200"
              }`}
            >
              1 Month (30 Days)
            </button>
            <button
              type="button"
              onClick={() => setSelectedRange("90d")}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                selectedRange === "90d"
                  ? "bg-[#222222] text-white shadow-sm"
                  : "bg-neutral-100 text-[#4A4A4A] hover:bg-neutral-200"
              }`}
            >
              90 Days (Quarter)
            </button>
            <button
              type="button"
              onClick={() => setSelectedRange("custom")}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all flex items-center gap-1 ${
                selectedRange === "custom"
                  ? "bg-[#222222] text-white shadow-sm"
                  : "bg-neutral-100 text-[#4A4A4A] hover:bg-neutral-200"
              }`}
            >
              <Calendar className="w-3 h-3" />
              <span>Custom Date Range</span>
            </button>
          </div>
        </div>

        {/* Custom date range picker drawer */}
        {selectedRange === "custom" && (
          <div className="mt-4 pt-4 border-t border-black/[0.06] flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold text-[#4A4A4A]">From:</label>
              <input
                type="date"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                className="px-3 py-1.5 rounded-xl border border-black/[0.12] text-xs font-medium text-[#222222] focus:outline-none focus:ring-2 focus:ring-[#AD314D]"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold text-[#4A4A4A]">To:</label>
              <input
                type="date"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                className="px-3 py-1.5 rounded-xl border border-black/[0.12] text-xs font-medium text-[#222222] focus:outline-none focus:ring-2 focus:ring-[#AD314D]"
              />
            </div>
            <button
              type="button"
              onClick={() => generateReport("custom")}
              disabled={loading}
              className="px-4 py-1.5 rounded-full bg-[#AD314D] hover:bg-[#92263F] text-white text-xs font-semibold shadow-sm transition-all disabled:opacity-50"
            >
              Apply Date Window
            </button>
          </div>
        )}

        {/* Header Action Bar */}
        <div className="flex items-center justify-between gap-3 mt-4 pt-3 border-t border-black/[0.06] flex-wrap">
          <div className="flex items-center gap-2 text-xs text-[#666666]">
            <Clock className="w-3.5 h-3.5" />
            <span>
              {report?.periodLabel ? report.periodLabel : "Synthesizing requested time window..."}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopySummary}
              disabled={!report}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-black/[0.08] hover:bg-neutral-50 text-xs font-semibold text-[#222222] transition-colors"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? "Copied Report!" : "Copy Report"}</span>
            </button>
            <button
              type="button"
              onClick={handlePrint}
              disabled={!report}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-black/[0.08] hover:bg-neutral-50 text-xs font-semibold text-[#222222] transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Print / PDF</span>
            </button>
            <button
              type="button"
              onClick={() => generateReport(selectedRange)}
              disabled={loading}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[#AD314D] hover:bg-[#92263F] text-white text-xs font-semibold shadow-sm transition-all disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              <span>{loading ? "Synthesizing..." : "Re-generate Report"}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Loading state indicator */}
      {loading && (
        <div className="p-8 rounded-3xl bg-white border border-rose-100 flex flex-col items-center justify-center text-center shadow-sm">
          <div className="w-12 h-12 rounded-2xl bg-rose-50 flex items-center justify-center text-[#AD314D] mb-3 animate-pulse">
            <Sparkles className="w-6 h-6 animate-spin" />
          </div>
          <h4 className="text-base font-bold text-[#222222]">
            Analyzing Multi-Signal Biometric &amp; Training Telemetry...
          </h4>
          <p className="text-xs text-[#666666] max-w-md mt-1">
            Gemini is correlating your Google Health sleep stages, caloric burn, daily steps, and resting heart rate against working volume and RPE progression.
          </p>
        </div>
      )}

      {/* Error Banner */}
      {errorMsg && (
        <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-center gap-2.5">
          <AlertTriangle className="w-4 h-4 shrink-0 text-amber-700" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* ------------------------------------------------------------------- */}
      {/* REPORT CONTENT BODY */}
      {/* ------------------------------------------------------------------- */}
      {report && !loading && (
        <div className="space-y-6">
          {/* TOP SCORE & EXECUTIVE STATUS HERO */}
          <div className="p-6 rounded-3xl bg-gradient-to-br from-neutral-900 via-neutral-950 to-neutral-900 text-white shadow-xl relative overflow-hidden">
            {/* Background subtle glow */}
            <div className="absolute top-0 right-0 w-96 h-96 bg-[#AD314D]/20 rounded-full blur-3xl pointer-events-none" />

            <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div className="space-y-3 max-w-2xl">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="px-2.5 py-1 rounded-full bg-white/10 backdrop-blur-md text-amber-300 text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5 border border-white/10">
                    <Sparkles className="w-3 h-3" />
                    AI Coach Holistic Health Synthesis
                  </span>
                  <span className="px-2.5 py-1 rounded-full bg-white/10 text-neutral-300 text-[11px] font-medium border border-white/10">
                    {report.periodLabel}
                  </span>
                  <span className="px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 text-[11px] font-semibold border border-emerald-500/30">
                    {report.source || "gemini-3.8-flash"}
                  </span>
                </div>

                <div className="flex items-baseline gap-3">
                  <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
                    {report.overallStatus}
                  </h2>
                </div>

                <p className="text-sm text-neutral-300 leading-relaxed font-normal">
                  {report.executiveSummary}
                </p>
              </div>

              {/* Overall Score Dial */}
              <div className="shrink-0 flex flex-col items-center justify-center p-5 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-md min-w-[140px]">
                <div className="text-4xl font-black text-white tracking-tight">
                  {report.overallScore}
                  <span className="text-lg font-bold text-neutral-400">/100</span>
                </div>
                <span className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider mt-1">
                  Adaptation Index
                </span>
                <div className="w-full bg-white/10 h-1.5 rounded-full mt-3 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-emerald-400 via-amber-400 to-[#AD314D] rounded-full transition-all duration-1000"
                    style={{ width: `${Math.min(100, Math.max(0, report.overallScore))}%` }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* ----------------------------------------------------------------- */}
          {/* THE 3 CORE PILLARS: SLEEP/CNS, METABOLISM, TRAINING STRAIN */}
          {/* ----------------------------------------------------------------- */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {/* Pillar 1: Sleep & CNS Autonomic Recovery */}
            <div className="p-5 rounded-3xl bg-white border border-black/[0.08] shadow-sm flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2">
                    <div className="p-2 rounded-xl bg-indigo-50 text-indigo-700">
                      <Moon className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-[#222222]">Sleep &amp; CNS Recovery</h4>
                      <span className="text-[10px] text-[#666666]">Autonomic nervous system</span>
                    </div>
                  </div>
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-800 border border-indigo-100">
                    {report.biometricSignals.sleepAndCns.score}/100
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 p-3 rounded-2xl bg-neutral-50 mb-3 text-xs">
                  <div>
                    <span className="text-[10px] text-[#666666] block">Average Sleep</span>
                    <span className="font-bold text-[#222222]">
                      {report.biometricSignals.sleepAndCns.avgSleepFormatted}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-[#666666] block">Resting HR</span>
                    <span className="font-bold text-[#222222]">
                      {report.biometricSignals.sleepAndCns.restingHeartRateAvg}
                    </span>
                  </div>
                  {report.biometricSignals.sleepAndCns.deepSleepAvg && (
                    <div>
                      <span className="text-[10px] text-[#666666] block">Deep Sleep</span>
                      <span className="font-semibold text-indigo-700">
                        {report.biometricSignals.sleepAndCns.deepSleepAvg}
                      </span>
                    </div>
                  )}
                  {report.biometricSignals.sleepAndCns.remSleepAvg && (
                    <div>
                      <span className="text-[10px] text-[#666666] block">REM Sleep</span>
                      <span className="font-semibold text-indigo-700">
                        {report.biometricSignals.sleepAndCns.remSleepAvg}
                      </span>
                    </div>
                  )}
                </div>

                <p className="text-xs text-[#4A4A4A] leading-relaxed">
                  {report.biometricSignals.sleepAndCns.analysis}
                </p>
              </div>

              <div className="mt-3 pt-3 border-t border-black/[0.06] text-[11px] text-indigo-900 font-medium flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-indigo-600" />
                <span>{report.biometricSignals.sleepAndCns.hrvStatus}</span>
              </div>
            </div>

            {/* Pillar 2: Metabolic Burn & Daily Energy Balance */}
            <div className="p-5 rounded-3xl bg-white border border-black/[0.08] shadow-sm flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2">
                    <div className="p-2 rounded-xl bg-amber-50 text-amber-700">
                      <Flame className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-[#222222]">Energy &amp; Caloric Balance</h4>
                      <span className="text-[10px] text-[#666666]">Google Health vs Target</span>
                    </div>
                  </div>
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-100">
                    {report.biometricSignals.metabolicAndEnergy.score}/100
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 p-3 rounded-2xl bg-neutral-50 mb-3 text-xs">
                  <div>
                    <span className="text-[10px] text-[#666666] block">Google Health Burn</span>
                    <span className="font-bold text-[#222222]">
                      {report.biometricSignals.metabolicAndEnergy.avgDailyBurnKcal.toLocaleString()} kcal
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-[#666666] block">Net Calorie Balance</span>
                    <span className="font-bold text-amber-800">
                      {report.biometricSignals.metabolicAndEnergy.netBalanceKcal}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-[#666666] block">Target Intake</span>
                    <span className="font-semibold text-[#4A4A4A]">
                      {report.biometricSignals.metabolicAndEnergy.targetIntakeKcal.toLocaleString()} kcal
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-[#666666] block">Average Steps</span>
                    <span className="font-semibold text-emerald-700">
                      {report.biometricSignals.metabolicAndEnergy.avgDailySteps.toLocaleString()} / day
                    </span>
                  </div>
                </div>

                <p className="text-xs text-[#4A4A4A] leading-relaxed">
                  {report.biometricSignals.metabolicAndEnergy.analysis}
                </p>
              </div>

              <div className="mt-3 pt-3 border-t border-black/[0.06] text-[11px] text-amber-900 font-medium flex items-center gap-1.5">
                <Footprints className="w-3.5 h-3.5 text-amber-700" />
                <span>{report.biometricSignals.metabolicAndEnergy.stepImpact}</span>
              </div>
            </div>

            {/* Pillar 3: Mechanical Strain & Progressive Overload */}
            <div className="p-5 rounded-3xl bg-white border border-black/[0.08] shadow-sm flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2">
                    <div className="p-2 rounded-xl bg-rose-50 text-[#AD314D]">
                      <Dumbbell className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-[#222222]">Training Volume Strain</h4>
                      <span className="text-[10px] text-[#666666]">Mechanical tension</span>
                    </div>
                  </div>
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-rose-50 text-[#AD314D] border border-rose-100">
                    {report.biometricSignals.trainingStrain.score}/100
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 p-3 rounded-2xl bg-neutral-50 mb-3 text-xs">
                  <div>
                    <span className="text-[10px] text-[#666666] block">Total Volume Moved</span>
                    <span className="font-bold text-[#AD314D]">
                      {report.biometricSignals.trainingStrain.totalVolumeKg.toLocaleString()} {unit}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-[#666666] block">Sessions Completed</span>
                    <span className="font-bold text-[#222222]">
                      {report.biometricSignals.trainingStrain.completedSessions} workouts
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-[#666666] block">Average RPE</span>
                    <span className="font-semibold text-[#4A4A4A]">
                      {report.biometricSignals.trainingStrain.avgRpe} / 10
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-[#666666] block">Stimulated Muscles</span>
                    <span className="font-semibold text-neutral-800 truncate block">
                      {report.biometricSignals.trainingStrain.topMuscleGroups.slice(0, 2).join(", ") || "Full Body"}
                    </span>
                  </div>
                </div>

                <p className="text-xs text-[#4A4A4A] leading-relaxed">
                  {report.biometricSignals.trainingStrain.analysis}
                </p>
              </div>

              <div className="mt-3 pt-3 border-t border-black/[0.06] text-[11px] text-rose-950 font-medium flex items-center justify-between">
                <span>Readiness: {report.biometricSignals.trainingStrain.recoveryReadiness}</span>
                {onNavigateToPlanner && (
                  <button
                    type="button"
                    onClick={onNavigateToPlanner}
                    className="text-[#AD314D] hover:underline font-bold flex items-center gap-0.5"
                  >
                    Planner <ChevronRight className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* ----------------------------------------------------------------- */}
          {/* LONGITUDINAL TRENDS */}
          {/* ----------------------------------------------------------------- */}
          {report.longitudinalTrends && report.longitudinalTrends.length > 0 && (
            <div className="p-5 rounded-3xl bg-white border border-black/[0.08] shadow-sm">
              <h4 className="text-sm font-bold text-[#222222] mb-3 flex items-center gap-2">
                <Activity className="w-4 h-4 text-[#AD314D]" />
                <span>Multi-Horizon Trend Analysis</span>
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {report.longitudinalTrends.map((tr, idx) => (
                  <div key={idx} className="p-3.5 rounded-2xl bg-neutral-50 border border-black/[0.04]">
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <span className="text-xs font-bold text-[#222222]">{tr.metric}</span>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 ${
                          tr.trend === "upward"
                            ? "bg-emerald-50 text-emerald-800 border border-emerald-100"
                            : tr.trend === "downward"
                            ? "bg-blue-50 text-blue-800 border border-blue-100"
                            : "bg-neutral-100 text-neutral-700 border border-neutral-200"
                        }`}
                      >
                        {tr.trend === "upward" ? (
                          <TrendingUp className="w-3 h-3" />
                        ) : tr.trend === "downward" ? (
                          <TrendingDown className="w-3 h-3" />
                        ) : (
                          <Activity className="w-3 h-3" />
                        )}
                        <span className="capitalize">{tr.trend}</span>
                      </span>
                    </div>
                    <p className="text-xs text-[#555555] leading-relaxed">{tr.detail}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ----------------------------------------------------------------- */}
          {/* PRESCRIPTIVE SUGGESTIONS FOR CHANGES (KEY FEATURE REQUEST!) */}
          {/* ----------------------------------------------------------------- */}
          <div className="p-6 rounded-3xl bg-white border border-black/[0.08] shadow-sm">
            <div className="flex items-center justify-between gap-4 mb-4 flex-wrap">
              <div>
                <div className="flex items-center gap-2">
                  <span className="p-1 rounded-lg bg-emerald-100 text-emerald-800">
                    <CheckCircle2 className="w-4 h-4" />
                  </span>
                  <h3 className="text-base font-bold text-[#222222]">
                    Prescriptive Action Plan &amp; Suggestions for Changes
                  </h3>
                </div>
                <p className="text-xs text-[#666666] mt-0.5">
                  Scientific modifications to steps, sleep architecture, caloric timing, and training volume.
                </p>
              </div>
              <span className="text-xs font-bold text-[#AD314D] px-2.5 py-1 rounded-full bg-rose-50 border border-rose-100">
                {report.prescriptiveActionPlan.length} Targeted Action Items
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {report.prescriptiveActionPlan.map((act) => {
                const isApplied = appliedActions[act.id];
                const categoryColor =
                  act.category === "steps"
                    ? "bg-amber-50 text-amber-800 border-amber-200"
                    : act.category === "sleep"
                    ? "bg-indigo-50 text-indigo-800 border-indigo-200"
                    : act.category === "nutrition"
                    ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                    : "bg-rose-50 text-[#AD314D] border-rose-200";

                const categoryIcon =
                  act.category === "steps" ? (
                    <Footprints className="w-3.5 h-3.5" />
                  ) : act.category === "sleep" ? (
                    <Moon className="w-3.5 h-3.5" />
                  ) : act.category === "nutrition" ? (
                    <Apple className="w-3.5 h-3.5" />
                  ) : (
                    <Dumbbell className="w-3.5 h-3.5" />
                  );

                return (
                  <div
                    key={act.id}
                    className="p-4 rounded-2xl border border-black/[0.06] bg-neutral-50/50 hover:bg-neutral-50 transition-all flex flex-col justify-between gap-3"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full border capitalize flex items-center gap-1 ${categoryColor}`}
                        >
                          {categoryIcon}
                          <span>{act.category}</span>
                        </span>

                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                            act.priority === "high"
                              ? "bg-red-50 text-red-700 border border-red-200"
                              : "bg-neutral-100 text-neutral-600"
                          }`}
                        >
                          {act.priority} priority
                        </span>
                      </div>

                      <h4 className="text-sm font-bold text-[#222222] mb-1">{act.title}</h4>
                      <p className="text-xs text-[#222222] font-medium leading-relaxed mb-2">
                        {act.recommendation}
                      </p>
                      <p className="text-[11px] text-[#666666] leading-relaxed italic bg-white p-2.5 rounded-xl border border-black/[0.04]">
                        <span className="font-semibold text-[#4A4A4A]">Physiological Rationale: </span>
                        {act.rationale}
                      </p>
                    </div>

                    <div className="flex items-center justify-between gap-2 pt-2 border-t border-black/[0.04]">
                      <span className="text-[11px] text-[#666666]">
                        {isApplied ? "Target protocol calibrated" : "Ready to lock in"}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleApplyAction(act)}
                        disabled={isApplied}
                        className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all flex items-center gap-1 shadow-sm ${
                          isApplied
                            ? "bg-emerald-600 text-white cursor-default"
                            : "bg-[#222222] hover:bg-black text-white"
                        }`}
                      >
                        {isApplied ? (
                          <>
                            <Check className="w-3 h-3" />
                            <span>Applied ✓</span>
                          </>
                        ) : (
                          <>
                            <span>Apply Suggestion</span>
                            <ArrowRight className="w-3 h-3" />
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AiHealthTrainingReportView;
