import React, { useState, useMemo } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid
} from "recharts";
import { WorkoutSession, WeightUnit } from "../types";
import { calculateSessionVolume, calculate1RM, aiMatchBodypart } from "../utils/calculations";
import { formatShortDate, formatFriendlyDate } from "../utils/dateUtils";
import { LineChart as LineChartIcon, BarChart2, Layers, Flame } from "lucide-react";
import { ReferenceLine } from "recharts";

interface ProgressionChartsProps {
  workouts: WorkoutSession[];
  unit: WeightUnit;
  isDarkMode?: boolean;
}

export const ProgressionCharts: React.FC<ProgressionChartsProps> = ({
  workouts,
  unit,
  isDarkMode = false
}) => {
  const [activeChart, setActiveChart] = useState<"volume" | "lifts" | "muscles">("volume");
  const multiplier = unit === "lbs" ? 2.20462 : 1;

  // 1. Prepare Volume Over Time Data
  const volumeData = useMemo(() => {
    const sorted = [...workouts].sort((a, b) => a.date.localeCompare(b.date));
    return sorted.map((session) => {
      const vol = calculateSessionVolume(session);
      const shortDate = formatShortDate(session.date);
      return {
        date: shortDate,
        fullDate: formatFriendlyDate(session.date),
        title: session.title,
        volume: Math.round(vol * multiplier),
        duration: session.durationMinutes
      };
    });
  }, [workouts, multiplier]);

  // 2. Prepare Estimated 1RM Progression for Key Lifts
  const liftProgressData = useMemo(() => {
    const sorted = [...workouts].sort((a, b) => a.date.localeCompare(b.date));
    const benchHistory: { date: string; fullDate: string; bench?: number; squat?: number; deadlift?: number }[] = [];

    sorted.forEach((s) => {
      let bench = 0;
      let squat = 0;
      let deadlift = 0;

      s.exercises.forEach((ex) => {
        ex.sets.forEach((set) => {
          const e1rm = calculate1RM(set.weight, set.reps);
          if (ex.exerciseName.toLowerCase().includes("bench")) {
            if (e1rm > bench) bench = e1rm;
          } else if (ex.exerciseName.toLowerCase().includes("squat")) {
            if (e1rm > squat) squat = e1rm;
          } else if (ex.exerciseName.toLowerCase().includes("deadlift") && !ex.exerciseName.toLowerCase().includes("romanian")) {
            if (e1rm > deadlift) deadlift = e1rm;
          }
        });
      });

      if (bench > 0 || squat > 0 || deadlift > 0) {
        benchHistory.push({
          date: formatShortDate(s.date),
          fullDate: formatFriendlyDate(s.date),
          ...(bench > 0 ? { bench: Math.round(bench * multiplier) } : {}),
          ...(squat > 0 ? { squat: Math.round(squat * multiplier) } : {}),
          ...(deadlift > 0 ? { deadlift: Math.round(deadlift * multiplier) } : {})
        });
      }
    });

    return benchHistory;
  }, [workouts, multiplier]);

  // 3. Prepare RPE Trends over the last 10 completed workouts
  const rpeTrendData = useMemo(() => {
    const sorted = [...workouts]
      .filter((w) => w.exercises && w.exercises.length > 0)
      .sort((a, b) => a.date.localeCompare(b.date));

    const last10 = sorted.slice(-10);

    return last10.map((session) => {
      const allRpes: number[] = [];
      session.exercises.forEach((e) => {
        e.sets.forEach((s) => {
          if (s.rpe && s.rpe > 0 && s.rpe <= 10) allRpes.push(s.rpe);
        });
      });

      let avgRpe = (session as any).rpe || (session as any).sessionRpe || 0;
      if (!avgRpe && allRpes.length > 0) {
        avgRpe = allRpes.reduce((a, b) => a + b, 0) / allRpes.length;
      }
      if (!avgRpe) avgRpe = 8.0;

      avgRpe = Math.round(avgRpe * 10) / 10;
      const maxRpe = allRpes.length > 0 ? Math.max(...allRpes) : Math.min(10, avgRpe + 0.5);

      return {
        date: formatShortDate(session.date),
        fullDate: formatFriendlyDate(session.date),
        title: session.title || "Workout Session",
        rpe: avgRpe,
        maxRpe,
        totalSets: allRpes.length || session.exercises.reduce((a, e) => a + e.sets.length, 0)
      };
    });
  }, [workouts]);

  // 4. Prepare Muscle Group Distribution
  const muscleDistribution = useMemo(() => {
    const groupMap: Record<string, number> = {
      Chest: 0,
      Back: 0,
      Legs: 0,
      Shoulders: 0,
      Arms: 0,
      Core: 0
    };

    workouts.forEach((s) => {
      s.exercises.forEach((ex) => {
        const setVol = ex.sets.reduce((sum, set) => sum + set.weight * set.reps, 0);
        const group = aiMatchBodypart(ex.exerciseName, ex.muscleGroup);
        if (groupMap[group] !== undefined) {
          groupMap[group] += setVol;
        }
      });
    });

    return Object.entries(groupMap).map(([group, vol]) => ({
      group,
      volume: Math.round(vol * multiplier)
    }));
  }, [workouts, multiplier]);

  // Custom Light & Dark Tooltip
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className={`px-3.5 py-2.5 rounded-[12px] border text-xs shadow-xl backdrop-blur-md ${
          isDarkMode
            ? "bg-zinc-900/95 border-zinc-700 text-slate-100"
            : "bg-white/95 border-black/[0.08] text-[#222222]"
        }`}>
          <p className="font-semibold mb-1">
            {payload[0]?.payload?.fullDate || label}
          </p>
          {payload[0]?.payload?.title && (
            <p className={`text-[11px] mb-1 italic ${isDarkMode ? "text-slate-400" : "text-[#4A4A4A]"}`}>
              {payload[0].payload.title}
            </p>
          )}
          {payload.map((entry: any, index: number) => (
            <div key={index} className="flex items-center justify-between gap-4 text-[11px]">
              <span className="flex items-center gap-1.5" style={{ color: entry.color }}>
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
                {entry.name === "volume" ? "Volume Load" : entry.name === "rpe" ? "Avg RPE" : entry.name}:
              </span>
              <span className="font-bold">
                {entry.name === "rpe" || entry.name === "Average RPE" || entry.name === "Session RPE"
                  ? `@${entry.value}`
                  : `${entry.value.toLocaleString()} ${unit}`}
              </span>
            </div>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div className={`w-full rounded-[18px] border p-5 sm:p-6 shadow-xs transition-all duration-300 ${
      isDarkMode
        ? "bg-zinc-900 border-zinc-800 text-slate-100"
        : "bg-white border-black/[0.06] text-[#222222]"
    }`}>
      {/* Header with Switcher Tabs */}
      <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 mb-4 border-b ${
        isDarkMode ? "border-zinc-800" : "border-black/[0.04]"
      }`}>
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wider">
            Progression Analytics
          </h3>
          <p className={`text-xs ${isDarkMode ? "text-slate-400" : "text-[#4A4A4A]"}`}>
            Verified strength adaptation curves, intensity RPE trends, and loading
          </p>
        </div>

        {/* Tab Controls with calm neutral surfaces */}
        <div className={`flex items-center gap-1 p-1 rounded-full border flex-wrap ${
          isDarkMode ? "bg-zinc-950 border-zinc-800" : "bg-[#F0F0EE] border-black/[0.04]"
        }`}>
          <button
            type="button"
            onClick={() => setActiveChart("volume")}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-all ${
              activeChart === "volume"
                ? "bg-white text-[#222222] shadow-[0_1px_4px_rgba(0,0,0,0.06)]"
                : "text-[#4A4A4A] hover:text-[#222222]"
            }`}
          >
            <LineChartIcon className="w-3.5 h-3.5 text-[#AD314D]" />
            <span>Volume Trend</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveChart("lifts")}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-all ${
              activeChart === "lifts"
                ? "bg-white text-[#222222] shadow-[0_1px_4px_rgba(0,0,0,0.06)]"
                : "text-[#4A4A4A] hover:text-[#222222]"
            }`}
          >
            <BarChart2 className="w-3.5 h-3.5 text-[#AD314D]" />
            <span>1RM Overload</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveChart("muscles")}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-all ${
              activeChart === "muscles"
                ? "bg-white text-[#222222] shadow-[0_1px_4px_rgba(0,0,0,0.06)]"
                : "text-[#4A4A4A] hover:text-[#222222]"
            }`}
          >
            <Layers className="w-3.5 h-3.5 text-[#AD314D]" />
            <span>Muscle Split</span>
          </button>
        </div>
      </div>

      {/* Chart Canvas */}
      <div className="w-full h-64 sm:h-72">
        {activeChart === "volume" && (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={volumeData} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
              <defs>
                <linearGradient id="berryGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#AD314D" stopOpacity={0.28} />
                  <stop offset="95%" stopColor="#AD314D" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={isDarkMode ? "#27272A" : "#EBEBEA"} />
              <XAxis
                dataKey="date"
                stroke={isDarkMode ? "#A1A1AA" : "#6B6B6B"}
                fontSize={11}
                tickLine={false}
                axisLine={{ stroke: isDarkMode ? "#3F3F46" : "#E0E0DE" }}
              />
              <YAxis
                stroke={isDarkMode ? "#A1A1AA" : "#6B6B6B"}
                fontSize={11}
                tickLine={false}
                axisLine={false}
                tickFormatter={(val) => `${val >= 1000 ? Math.round(val / 1000) + "k" : val}`}
              />
              <Tooltip content={<CustomTooltip />} />
              <Area
                type="monotone"
                dataKey="volume"
                name="volume"
                stroke="#AD314D"
                strokeWidth={2.5}
                fillOpacity={1}
                fill="url(#berryGradient)"
                activeDot={{ r: 6, fill: "#AD314D", stroke: "#FFFFFF", strokeWidth: 2 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}

        {activeChart === "lifts" && (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={liftProgressData} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#EBEBEA" />
              <XAxis
                dataKey="date"
                stroke="#6B6B6B"
                fontSize={11}
                tickLine={false}
                axisLine={{ stroke: "#E0E0DE" }}
              />
              <YAxis
                stroke="#6B6B6B"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                domain={['auto', 'auto']}
              />
              <Tooltip content={<CustomTooltip />} />
              <Line
                type="monotone"
                dataKey="bench"
                name="Bench Press"
                stroke="#AD314D"
                strokeWidth={2.5}
                dot={{ r: 4, fill: "#AD314D", stroke: "#FFFFFF", strokeWidth: 1.5 }}
                connectNulls
              />
              <Line
                type="monotone"
                dataKey="squat"
                name="Back Squat"
                stroke="#654382"
                strokeWidth={2.5}
                dot={{ r: 4, fill: "#654382", stroke: "#FFFFFF", strokeWidth: 1.5 }}
                connectNulls
              />
              <Line
                type="monotone"
                dataKey="deadlift"
                name="Deadlift"
                stroke="#BD472B"
                strokeWidth={2.5}
                dot={{ r: 4, fill: "#BD472B", stroke: "#FFFFFF", strokeWidth: 1.5 }}
                connectNulls
              />
            </LineChart>
          </ResponsiveContainer>
        )}

        {activeChart === "muscles" && (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={muscleDistribution} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#EBEBEA" />
              <XAxis
                dataKey="group"
                stroke="#6B6B6B"
                fontSize={11}
                tickLine={false}
                axisLine={{ stroke: "#E0E0DE" }}
              />
              <YAxis
                stroke="#6B6B6B"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                tickFormatter={(val) => `${val >= 1000 ? Math.round(val / 1000) + "k" : val}`}
              />
              <Tooltip content={<CustomTooltip />} />
              <Bar
                dataKey="volume"
                name="volume"
                fill="#AD314D"
                radius={[6, 6, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Legend / Info bar */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-[#4A4A4A] pt-3 border-t border-black/[0.04]">
        {activeChart === "volume" && (
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#AD314D]" />
            Session Tonnage Over Time ({unit})
          </span>
        )}
        {activeChart === "lifts" && (
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[#AD314D]" />
              Bench Press
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[#654382]" />
              Back Squat
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[#BD472B]" />
              Deadlift
            </span>
          </div>
        )}
        {activeChart === "muscles" && (
          <span>Volume distributed across primary muscle groups ({unit})</span>
        )}

        <span className="text-[11px] text-[#4A4A4A]">
          Auto-synchronized with historical sets
        </span>
      </div>
    </div>
  );
};
