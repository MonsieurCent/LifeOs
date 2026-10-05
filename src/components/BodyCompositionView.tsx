import React, { useState, useMemo } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend
} from "recharts";
import { BodyCompositionRecord, WeightUnit, SyncedHealthMetrics } from "../types";
import {
  getRecordMusclePercent,
  calculateBodyCompositionChanges,
  convertWeight,
  formatWeight,
  LBS_PER_KG
} from "../utils/calculations";
import { getTodayDateStr } from "../utils/dateUtils";
import {
  Scale,
  Activity,
  Plus,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  Heart,
  Droplets,
  Flame,
  Zap,
  CheckCircle2,
  Calendar,
  ShieldCheck
} from "lucide-react";

interface BodyCompositionViewProps {
  records: BodyCompositionRecord[];
  onAddRecord: (record: BodyCompositionRecord) => void;
  onUpdateRecord?: ((record: BodyCompositionRecord) => void) | ((id: string, updated: Partial<BodyCompositionRecord>) => void);
  onDeleteRecord?: (id: string) => void;
  onOpenHealthModal?: () => void;
  unit: WeightUnit;
  healthMetrics?: SyncedHealthMetrics;
  onSyncGoogleHealth?: () => void | Promise<void>;
  isDarkMode?: boolean;
}

export const BodyCompositionView: React.FC<BodyCompositionViewProps> = ({
  records,
  onAddRecord,
  onUpdateRecord,
  onDeleteRecord,
  onOpenHealthModal,
  unit,
  healthMetrics,
  onSyncGoogleHealth,
  isDarkMode = false
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  // Form state
  const [newDate, setNewDate] = useState(getTodayDateStr);
  const [newWeight, setNewWeight] = useState(unit === "lbs" ? "178.5" : "81.0");
  const [newBodyFat, setNewBodyFat] = useState("15.0");
  const [newMuscle, setNewMuscle] = useState("44.5");
  const [newBone, setNewBone] = useState("3.5");
  const [newWater, setNewWater] = useState("58.3");
  const [newVisceral, setNewVisceral] = useState("5");
  const [newBmr, setNewBmr] = useState("1985");
  const [newWaist, setNewWaist] = useState("82.0");
  const [newNotes, setNewNotes] = useState("");

  const multiplier = unit === "lbs" ? LBS_PER_KG : 1;
  const unitLabel = unit === "lbs" ? "lbs" : "kg";

  const ghMetrics = healthMetrics?.googleHealth;
  const isGoogleHealthLive = ghMetrics && (typeof ghMetrics.bodyWeightKg === "number" || typeof ghMetrics.bodyFatPercent === "number");

  // Sorted records chronologically
  const sortedRecords = useMemo(() => {
    return [...records].sort((a, b) => a.date.localeCompare(b.date));
  }, [records]);

  // Latest vs Baseline metrics
  const latestRecord = sortedRecords[sortedRecords.length - 1];
  const latest: BodyCompositionRecord = {
    id: latestRecord?.id || "default-latest",
    date: latestRecord?.date || getTodayDateStr(),
    weightKg: latestRecord?.weightKg ?? ghMetrics?.bodyWeightKg ?? 81.0,
    bodyFatPercent: latestRecord?.bodyFatPercent ?? ghMetrics?.bodyFatPercent ?? 15.0,
    muscleMassPercent: latestRecord?.muscleMassPercent ?? ghMetrics?.muscleMassPercent ?? 44.5,
    boneMassKg: latestRecord?.boneMassKg ?? ghMetrics?.boneMassKg ?? 3.5,
    waterPercent: latestRecord?.waterPercent ?? ghMetrics?.bodyWaterPercent ?? 58.3,
    visceralFat: latestRecord?.visceralFat ?? ghMetrics?.visceralFatRating ?? 5,
    bmrKcal: latestRecord?.bmrKcal ?? ghMetrics?.bmrKcal ?? 1985,
    waistCm: latestRecord?.waistCm ?? 82.0,
    source: latestRecord?.source || (isGoogleHealthLive ? "google_health" : "manual"),
    notes: latestRecord?.notes
  };

  const baseline = sortedRecords[0] || latest;

  const {
    weightChange,
    bodyFatChange,
    muscleChange
  } = useMemo(() => {
    return calculateBodyCompositionChanges(latest, baseline, unit);
  }, [latest, baseline, unit]);

  const latestMusclePercent = getRecordMusclePercent(latest) ?? 44.5;
  const leanMassKg = (latest.weightKg * (1 - (latest.bodyFatPercent || 15) / 100));
  const leanMassDisplay = (leanMassKg * multiplier).toFixed(1);

  // Computed BMI
  const computedBmi = ghMetrics?.bmi || Number((latest.weightKg / Math.pow(1.82, 2)).toFixed(1));

  // Chart data formatting
  const chartData = useMemo(() => {
    return sortedRecords.map((r) => ({
      date: r.date.slice(5), // MM-DD
      fullDate: r.date,
      weight: Number((r.weightKg * multiplier).toFixed(1)),
      bodyFat: r.bodyFatPercent || 0,
      muscle: getRecordMusclePercent(r) || 0,
      water: r.waterPercent || 0,
      bmr: r.bmrKcal || 0
    }));
  }, [sortedRecords, multiplier]);

  const handleSyncClick = async () => {
    setIsSyncing(true);
    setSyncMessage(null);
    try {
      if (onSyncGoogleHealth) {
        await onSyncGoogleHealth();
      }
    } catch (e: any) {
      setSyncMessage(e?.message || "Sync completed.");
      setTimeout(() => setSyncMessage(null), 5000);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSubmitNew = (e: React.FormEvent) => {
    e.preventDefault();
    const wKg = unit === "lbs" ? parseFloat(newWeight) / 2.20462 : parseFloat(newWeight);
    const muscleVal = newMuscle ? parseFloat(newMuscle) : undefined;

    const record: BodyCompositionRecord = {
      id: `bc-${Date.now()}`,
      date: newDate,
      weightKg: isNaN(wKg) ? 80 : Number(wKg.toFixed(1)),
      notes: newNotes.trim() || "",
      source: "manual"
    };

    if (newBodyFat && !isNaN(parseFloat(newBodyFat))) {
      record.bodyFatPercent = parseFloat(newBodyFat);
    }
    if (muscleVal !== undefined && !isNaN(muscleVal)) {
      record.muscleMassPercent = muscleVal;
    }
    if (newBone && !isNaN(parseFloat(newBone))) {
      record.boneMassKg = parseFloat(newBone);
    }
    if (newWater && !isNaN(parseFloat(newWater))) {
      record.waterPercent = parseFloat(newWater);
    }
    if (newVisceral && !isNaN(parseInt(newVisceral))) {
      record.visceralFat = parseInt(newVisceral);
    }
    if (newBmr && !isNaN(parseInt(newBmr))) {
      record.bmrKcal = parseInt(newBmr);
    }
    if (newWaist && !isNaN(parseFloat(newWaist))) {
      record.waistCm = parseFloat(newWaist);
    }

    onAddRecord(record);
    setIsModalOpen(false);
    setNewNotes("");
  };

  return (
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6 animate-fadeIn">
      {/* Top Banner */}
      <div className="bg-white rounded-[20px] border border-black/[0.06] p-6 shadow-[0_4px_24px_rgba(0,0,0,0.03)] flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[11px] font-semibold tracking-wider uppercase px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700">
              Biometric Intelligence
            </span>
            <span className="text-xs text-[#4A4A4A]">
              Synced with Google Health API &amp; Smart Scale
            </span>
          </div>
          <h1 className="text-2xl font-bold text-[#222222] tracking-tight">
            Body Composition &amp; Progression
          </h1>
          <p className="text-xs text-[#4A4A4A] mt-0.5">
            Track weight, body fat %, skeletal muscle %, bone density, and physiological metrics over time.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={handleSyncClick}
            disabled={isSyncing}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 transition-colors shadow-sm disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-emerald-600 ${isSyncing ? "animate-spin" : ""}`} />
            <span>{isSyncing ? "Syncing Scale..." : "Sync Google Health"}</span>
          </button>

          <button
            type="button"
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-[#222222] hover:bg-black text-white shadow-sm transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Log Reading</span>
          </button>
        </div>
      </div>

      {syncMessage && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-3 rounded-xl text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{syncMessage}</span>
        </div>
      )}

      {/* Summary Stat Grid: All Scale Biometrics */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
        {/* 1. Body Weight */}
        <div className="bg-white p-4.5 rounded-[18px] border border-black/[0.06] shadow-[0_2px_12px_rgba(0,0,0,0.02)] flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-xs text-[#4A4A4A] mb-1.5">
              <span className="font-semibold flex items-center gap-1.5 text-[#222222]">
                <Scale className="w-3.5 h-3.5 text-[#AD314D]" />
                Weight
              </span>
              <span className={`flex items-center gap-0.5 font-bold text-[10.5px] ${weightChange <= 0 ? "text-emerald-600" : "text-amber-600"}`}>
                {weightChange <= 0 ? <TrendingDown className="w-3 h-3" /> : <TrendingUp className="w-3 h-3" />}
                {weightChange > 0 ? `+${weightChange.toFixed(1)}` : weightChange.toFixed(1)} {unitLabel}
              </span>
            </div>
            <div className="flex items-baseline gap-1.5 mt-1">
              <span className="text-2xl font-bold text-[#222222] tracking-tight">
                {(latest.weightKg * multiplier).toFixed(1)}
              </span>
              <span className="text-xs font-medium text-[#4A4A4A]">{unitLabel}</span>
            </div>
          </div>
          <div className="mt-2.5 pt-2 border-t border-black/[0.04] flex items-center justify-between text-[10.5px] text-[#4A4A4A]">
            <span>Baseline: {(baseline.weightKg * multiplier).toFixed(1)}</span>
            <span className="text-[9.5px] px-1.5 py-0.5 rounded font-medium bg-emerald-50 text-emerald-700">
              {latest.source === "google_health" ? "Scale Sync" : "Logged"}
            </span>
          </div>
        </div>

        {/* 2. Body Fat % */}
        <div className="bg-white p-4.5 rounded-[18px] border border-black/[0.06] shadow-[0_2px_12px_rgba(0,0,0,0.02)] flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-xs text-[#4A4A4A] mb-1.5">
              <span className="font-semibold flex items-center gap-1.5 text-[#222222]">
                <Activity className="w-3.5 h-3.5 text-indigo-600" />
                Body Fat
              </span>
              <span className={`flex items-center gap-0.5 font-bold text-[10.5px] ${bodyFatChange <= 0 ? "text-emerald-600" : "text-amber-600"}`}>
                {bodyFatChange <= 0 ? <TrendingDown className="w-3 h-3" /> : <TrendingUp className="w-3 h-3" />}
                {bodyFatChange > 0 ? `+${bodyFatChange.toFixed(1)}` : bodyFatChange.toFixed(1)}%
              </span>
            </div>
            <div className="flex items-baseline gap-1.5 mt-1">
              <span className="text-2xl font-bold text-[#222222] tracking-tight">
                {(latest.bodyFatPercent ?? 15.0).toFixed(1)}%
              </span>
            </div>
          </div>
          <div className="mt-2.5 pt-2 border-t border-black/[0.04] flex items-center justify-between text-[10.5px] text-[#4A4A4A]">
            <span>Fat Mass: {((latest.weightKg * ((latest.bodyFatPercent || 15) / 100)) * multiplier).toFixed(1)} {unitLabel}</span>
            <span className="text-[9.5px] px-1.5 py-0.5 rounded font-medium bg-indigo-50 text-indigo-700">
              {(latest.bodyFatPercent || 15) < 18 ? "Athletic" : "Normal"}
            </span>
          </div>
        </div>

        {/* 3. Skeletal Muscle */}
        <div className="bg-white p-4.5 rounded-[18px] border border-black/[0.06] shadow-[0_2px_12px_rgba(0,0,0,0.02)] flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-xs text-[#4A4A4A] mb-1.5">
              <span className="font-semibold flex items-center gap-1.5 text-[#222222]">
                <Zap className="w-3.5 h-3.5 text-amber-500" />
                Muscle Mass
              </span>
              <span className={`flex items-center gap-0.5 font-bold text-[10.5px] ${muscleChange >= 0 ? "text-emerald-600" : "text-amber-600"}`}>
                {muscleChange >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                {muscleChange > 0 ? `+${muscleChange.toFixed(1)}%` : `${muscleChange.toFixed(1)}%`}
              </span>
            </div>
            <div className="flex items-baseline gap-1.5 mt-1">
              <span className="text-2xl font-bold text-[#222222] tracking-tight">
                {latestMusclePercent.toFixed(1)}%
              </span>
            </div>
          </div>
          <div className="mt-2.5 pt-2 border-t border-black/[0.04] flex items-center justify-between text-[10.5px] text-[#4A4A4A]">
            <span>Lean Mass: {leanMassDisplay} {unitLabel}</span>
            <span className="text-[9.5px] px-1.5 py-0.5 rounded font-medium bg-amber-50 text-amber-700">
              Skeletal
            </span>
          </div>
        </div>

        {/* 4. Body Water / Hydration */}
        <div className="bg-white p-4.5 rounded-[18px] border border-black/[0.06] shadow-[0_2px_12px_rgba(0,0,0,0.02)] flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-xs text-[#4A4A4A] mb-1.5">
              <span className="font-semibold flex items-center gap-1.5 text-[#222222]">
                <Droplets className="w-3.5 h-3.5 text-sky-500" />
                Hydration
              </span>
              <span className="text-[10px] font-semibold text-sky-700 bg-sky-50 px-1.5 py-0.2 rounded">
                Optimal
              </span>
            </div>
            <div className="flex items-baseline gap-1.5 mt-1">
              <span className="text-2xl font-bold text-[#222222] tracking-tight">
                {(latest.waterPercent ?? 58.3).toFixed(1)}%
              </span>
            </div>
          </div>
          <div className="mt-2.5 pt-2 border-t border-black/[0.04] flex items-center justify-between text-[10.5px] text-[#4A4A4A]">
            <span>Target: 55 - 65%</span>
            <span className="text-[9.5px] px-1.5 py-0.5 rounded font-medium bg-sky-50 text-sky-700">
              Water
            </span>
          </div>
        </div>

        {/* 5. Visceral Fat & Bone Mass */}
        <div className="bg-white p-4.5 rounded-[18px] border border-black/[0.06] shadow-[0_2px_12px_rgba(0,0,0,0.02)] flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-xs text-[#4A4A4A] mb-1.5">
              <span className="font-semibold flex items-center gap-1.5 text-[#222222]">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                Visceral &amp; Bone
              </span>
              <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded">
                Level {latest.visceralFat ?? 5}
              </span>
            </div>
            <div className="flex items-baseline gap-1.5 mt-1">
              <span className="text-2xl font-bold text-[#222222] tracking-tight">
                {((latest.boneMassKg ?? 3.5) * multiplier).toFixed(1)}
              </span>
              <span className="text-xs font-medium text-[#4A4A4A]">{unitLabel} bone</span>
            </div>
          </div>
          <div className="mt-2.5 pt-2 border-t border-black/[0.04] flex items-center justify-between text-[10.5px] text-[#4A4A4A]">
            <span>Visceral: {latest.visceralFat ?? 5} / 12</span>
            <span className="text-[9.5px] px-1.5 py-0.5 rounded font-medium bg-emerald-50 text-emerald-700">
              Safe &lt; 9
            </span>
          </div>
        </div>

        {/* 6. BMR & BMI */}
        <div className="bg-white p-4.5 rounded-[18px] border border-black/[0.06] shadow-[0_2px_12px_rgba(0,0,0,0.02)] flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-xs text-[#4A4A4A] mb-1.5">
              <span className="font-semibold flex items-center gap-1.5 text-[#222222]">
                <Flame className="w-3.5 h-3.5 text-rose-500" />
                BMR &amp; BMI
              </span>
              <span className="text-[10px] font-semibold text-rose-700 bg-rose-50 px-1.5 py-0.2 rounded">
                BMI {computedBmi}
              </span>
            </div>
            <div className="flex items-baseline gap-1.5 mt-1">
              <span className="text-2xl font-bold text-[#222222] tracking-tight">
                {latest.bmrKcal || 1985}
              </span>
              <span className="text-xs font-medium text-[#4A4A4A]">kcal/d</span>
            </div>
          </div>
          <div className="mt-2.5 pt-2 border-t border-black/[0.04] flex items-center justify-between text-[10.5px] text-[#4A4A4A]">
            <span>Basal metabolism</span>
            <span className="text-[9.5px] px-1.5 py-0.5 rounded font-medium bg-rose-50 text-rose-700">
              Active Burn
            </span>
          </div>
        </div>
      </div>

      {/* Progression Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Weight & Body Fat Trend */}
        <div className="bg-white p-6 rounded-[20px] border border-black/[0.06] shadow-[0_4px_24px_rgba(0,0,0,0.03)]">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-[#222222]">Weight &amp; Body Fat Progression</h3>
              <p className="text-xs text-[#4A4A4A]">Historical trajectory over recent weigh-ins</p>
            </div>
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-neutral-100 text-[#4A4A4A]">
              {unit.toUpperCase()}
            </span>
          </div>
          <div className="w-full h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#666' }} stroke="#e0e0e0" />
                <YAxis yAxisId="weight" domain={['auto', 'auto']} tick={{ fontSize: 11, fill: '#666' }} stroke="#e0e0e0" />
                <YAxis yAxisId="fat" orientation="right" domain={[10, 25]} tick={{ fontSize: 11, fill: '#666' }} stroke="#e0e0e0" />
                <Tooltip
                  contentStyle={{ backgroundColor: 'rgba(255,255,255,0.95)', borderRadius: 12, border: '1px solid rgba(0,0,0,0.08)', fontSize: 12 }}
                />
                <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                <Line yAxisId="weight" type="monotone" dataKey="weight" name={`Weight (${unitLabel})`} stroke="#AD314D" strokeWidth={2.5} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                <Line yAxisId="fat" type="monotone" dataKey="bodyFat" name="Body Fat %" stroke="#6366f1" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Muscle % & Water Trend */}
        <div className="bg-white p-6 rounded-[20px] border border-black/[0.06] shadow-[0_4px_24px_rgba(0,0,0,0.03)]">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-[#222222]">Muscle % &amp; Hydration Trends</h3>
              <p className="text-xs text-[#4A4A4A]">Skeletal muscle % &amp; body water %</p>
            </div>
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-neutral-100 text-[#4A4A4A]">
              Muscle %
            </span>
          </div>
          <div className="w-full h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#666' }} stroke="#e0e0e0" />
                <YAxis yAxisId="muscle" domain={['auto', 'auto']} tick={{ fontSize: 11, fill: '#666' }} stroke="#e0e0e0" unit="%" />
                <YAxis yAxisId="water" orientation="right" domain={[50, 70]} tick={{ fontSize: 11, fill: '#666' }} stroke="#e0e0e0" unit="%" />
                <Tooltip
                  contentStyle={{ backgroundColor: 'rgba(255,255,255,0.95)', borderRadius: 12, border: '1px solid rgba(0,0,0,0.08)', fontSize: 12 }}
                  formatter={(val: any, name: string) => [`${val}%`, name]}
                />
                <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                <Line yAxisId="muscle" type="monotone" dataKey="muscle" name="Muscle %" stroke="#10b981" strokeWidth={2.5} dot={{ r: 4 }} />
                <Line yAxisId="water" type="monotone" dataKey="water" name="Water %" stroke="#0ea5e9" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Historical Records Table */}
      <div className="bg-white rounded-[20px] border border-black/[0.06] p-6 shadow-[0_4px_24px_rgba(0,0,0,0.03)]">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-[#222222]">Historical Log Entries</h3>
            <p className="text-xs text-[#4A4A4A]">Complete timeline of syncs and manual weigh-ins</p>
          </div>
          <span className="text-xs text-[#4A4A4A] font-medium">
            {sortedRecords.length} records saved
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-black/[0.06] text-[#4A4A4A]">
                <th className="py-3 font-semibold">Date</th>
                <th className="py-3 font-semibold">Weight ({unitLabel})</th>
                <th className="py-3 font-semibold">Body Fat</th>
                <th className="py-3 font-semibold">Muscle %</th>
                <th className="py-3 font-semibold">Water %</th>
                <th className="py-3 font-semibold">Visceral Fat</th>
                <th className="py-3 font-semibold">BMR</th>
                <th className="py-3 font-semibold">Source</th>
                <th className="py-3 font-semibold">Notes</th>
                <th className="py-3 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/[0.04]">
              {sortedRecords.slice().reverse().map((r) => (
                <tr key={r.id} className="hover:bg-neutral-50/80 transition-colors">
                  <td className="py-3 font-medium text-[#222222] flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-[#AD314D]" />
                    {r.date}
                  </td>
                  <td className="py-3 font-bold text-[#222222]">
                    {(r.weightKg * multiplier).toFixed(1)} {unitLabel}
                  </td>
                  <td className="py-3 text-[#4A4A4A]">
                    {r.bodyFatPercent ? `${r.bodyFatPercent}%` : "—"}
                  </td>
                  <td className="py-3 text-[#4A4A4A]">
                    {getRecordMusclePercent(r) !== undefined ? `${getRecordMusclePercent(r)}%` : "—"}
                  </td>
                  <td className="py-3 text-[#4A4A4A]">
                    {r.waterPercent ? `${r.waterPercent}%` : "—"}
                  </td>
                  <td className="py-3 text-[#4A4A4A]">
                    {r.visceralFat ? r.visceralFat : "—"}
                  </td>
                  <td className="py-3 text-[#4A4A4A]">
                    {r.bmrKcal ? `${r.bmrKcal} kcal` : "—"}
                  </td>
                  <td className="py-3">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                      r.source === "google_health" ? "bg-emerald-50 text-emerald-700" :
                      r.source === "smart_scale" ? "bg-indigo-50 text-indigo-700" :
                      "bg-neutral-100 text-[#4A4A4A]"
                    }`}>
                      {r.source === "google_health" ? "Google Health" : r.source === "smart_scale" ? "Smart Scale" : "Manual"}
                    </span>
                  </td>
                  <td className="py-3 text-[#4A4A4A] italic">
                    {r.notes || "—"}
                  </td>
                  <td className="py-3 text-right">
                    {onDeleteRecord && (
                      <button
                        type="button"
                        onClick={() => onDeleteRecord(r.id)}
                        className="text-rose-600 hover:text-rose-800 text-[11px] font-medium px-2 py-1 rounded bg-rose-50 hover:bg-rose-100 transition-colors"
                      >
                        Delete
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal for Logging New Body Comp Entry */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-[24px] border border-black/[0.08] p-6 sm:p-8 max-w-lg w-full shadow-[0_20px_50px_rgba(0,0,0,0.15)] animate-scaleUp">
            <div className="flex items-center justify-between pb-4 mb-4 border-b border-black/[0.06]">
              <div>
                <h3 className="text-base font-bold text-[#222222]">Log Body Composition Entry</h3>
                <p className="text-xs text-[#4A4A4A]">Record weigh-in and smart scale biometrics</p>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="w-8 h-8 rounded-full bg-neutral-100 flex items-center justify-center text-xs font-bold hover:bg-neutral-200"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmitNew} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-[#4A4A4A] mb-1">Date</label>
                  <input
                    type="date"
                    value={newDate}
                    onChange={(e) => setNewDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-black/[0.1] text-xs focus:outline-none focus:border-[#AD314D]"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-[#4A4A4A] mb-1">Weight ({unitLabel})</label>
                  <input
                    type="number"
                    step="0.1"
                    value={newWeight}
                    onChange={(e) => setNewWeight(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-black/[0.1] text-xs focus:outline-none focus:border-[#AD314D]"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-[#4A4A4A] mb-1">Body Fat %</label>
                  <input
                    type="number"
                    step="0.1"
                    value={newBodyFat}
                    onChange={(e) => setNewBodyFat(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-black/[0.1] text-xs focus:outline-none focus:border-[#AD314D]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-[#4A4A4A] mb-1">Muscle %</label>
                  <input
                    type="number"
                    step="0.1"
                    placeholder="e.g. 44.5"
                    value={newMuscle}
                    onChange={(e) => setNewMuscle(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-black/[0.1] text-xs focus:outline-none focus:border-[#AD314D]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-[#4A4A4A] mb-1">Water %</label>
                  <input
                    type="number"
                    step="0.1"
                    value={newWater}
                    onChange={(e) => setNewWater(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-black/[0.1] text-xs focus:outline-none focus:border-[#AD314D]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-[#4A4A4A] mb-1">Bone Mass</label>
                  <input
                    type="number"
                    step="0.1"
                    value={newBone}
                    onChange={(e) => setNewBone(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-black/[0.1] text-xs focus:outline-none focus:border-[#AD314D]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-[#4A4A4A] mb-1">Visceral Fat</label>
                  <input
                    type="number"
                    value={newVisceral}
                    onChange={(e) => setNewVisceral(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-black/[0.1] text-xs focus:outline-none focus:border-[#AD314D]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-[#4A4A4A] mb-1">BMR (kcal)</label>
                  <input
                    type="number"
                    value={newBmr}
                    onChange={(e) => setNewBmr(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-black/[0.1] text-xs focus:outline-none focus:border-[#AD314D]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[#4A4A4A] mb-1">Notes / Conditions</label>
                <input
                  type="text"
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                  placeholder="e.g., Morning weigh-in, post-workout"
                  className="w-full px-3 py-2 rounded-xl border border-black/[0.1] text-xs focus:outline-none focus:border-[#AD314D]"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-black/[0.08] text-xs font-semibold text-[#4A4A4A]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-[#222222] hover:bg-black text-white text-xs font-semibold shadow-sm"
                >
                  Save Entry
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
