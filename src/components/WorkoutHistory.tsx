import React, { useState, useMemo } from "react";
import {
  Search,
  Calendar,
  Clock,
  Dumbbell,
  Award,
  ChevronDown,
  ChevronUp,
  Trash2,
  Filter,
  CheckCircle2,
  CheckSquare,
  Square,
  RotateCcw,
  AlertTriangle,
  FileSpreadsheet
} from "lucide-react";
import { WorkoutSession, WeightUnit, MuscleGroup } from "../types";
import { calculateSessionVolume, calculateSessionSets, calculate1RM } from "../utils/calculations";
import { parseLocalDate, formatFriendlyDate } from "../utils/dateUtils";

interface WorkoutHistoryProps {
  workouts: WorkoutSession[];
  unit: WeightUnit;
  onDeleteWorkout: (id: string) => void;
  onBulkDeleteWorkouts?: (ids: string[]) => void;
  onOpenSync?: () => void;
  onClearImportedWorkouts?: () => void;
  onResetToSampleWorkouts?: () => void;
}

export const WorkoutHistory: React.FC<WorkoutHistoryProps> = ({
  workouts,
  unit,
  onDeleteWorkout,
  onBulkDeleteWorkouts,
  onOpenSync,
  onClearImportedWorkouts,
  onResetToSampleWorkouts
}) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedMuscle, setSelectedMuscle] = useState<string>("All");
  const [expandedId, setExpandedId] = useState<string | null>(workouts[0]?.id || null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const multiplier = unit === "lbs" ? 2.20462 : 1;

  // Filter workouts by search and muscle group
  const filteredWorkouts = useMemo(() => {
    return workouts
      .filter((w) => {
        const matchesSearch =
          w.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
          w.exercises.some((e) => e.exerciseName.toLowerCase().includes(searchTerm.toLowerCase()));

        const matchesMuscle =
          selectedMuscle === "All" ||
          w.exercises.some((e) => e.muscleGroup === selectedMuscle);

        return matchesSearch && matchesMuscle;
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [workouts, searchTerm, selectedMuscle]);

  const toggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  const toggleSelect = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedIds(next);
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredWorkouts.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredWorkouts.map((w) => w.id)));
    }
  };

  const handleBulkDelete = () => {
    if (selectedIds.size === 0) return;
    if (confirm(`Are you sure you want to delete ${selectedIds.size} selected workout session(s)?`)) {
      if (onBulkDeleteWorkouts) {
        onBulkDeleteWorkouts(Array.from(selectedIds));
      } else {
        selectedIds.forEach((id) => onDeleteWorkout(id));
      }
      setSelectedIds(new Set());
    }
  };

  return (
    <div className="w-full bg-white rounded-[18px] border border-black/[0.06] p-5 sm:p-7 shadow-[0_4px_24px_rgba(0,0,0,0.03)] transition-all">
      {/* Header and Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 mb-5 border-b border-black/[0.05]">
        <div>
          <h3 className="text-base font-bold text-[#222222] tracking-tight">
            Workout History &amp; Logs
          </h3>
          <p className="text-xs text-[#4A4A4A] mt-0.5">
            {filteredWorkouts.length} completed sessions logged on record
          </p>
        </div>

        {/* Search & Muscle Filters */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-[#4A4A4A] absolute left-3 top-3 pointer-events-none" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search exercise or session..."
              className="h-9 pl-8 pr-3 rounded-xl bg-[#F8F8F7] border border-black/[0.08] focus:border-[#AD314D] text-xs text-[#222222] outline-none w-full sm:w-48 transition-colors"
            />
          </div>

          <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0">
            {["All", "Chest", "Back", "Legs", "Shoulders"].map((group) => (
              <button
                key={group}
                type="button"
                onClick={() => setSelectedMuscle(group)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                  selectedMuscle === group
                    ? "bg-[#222222] text-white"
                    : "bg-[#F4F4F2] text-[#4A4A4A] hover:text-[#222222]"
                }`}
              >
                {group}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Bulk Action & Deletion Bar */}
      {filteredWorkouts.length > 0 && (
        <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-[#F8F8F7] border border-black/[0.04] mb-4 text-xs">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggleSelectAll}
              className="flex items-center gap-1.5 font-medium text-[#4A4A4A] hover:text-[#222222]"
            >
              {selectedIds.size === filteredWorkouts.length && filteredWorkouts.length > 0 ? (
                <CheckSquare className="w-4 h-4 text-[#AD314D]" />
              ) : (
                <Square className="w-4 h-4 text-[#4A4A4A]" />
              )}
              <span>
                {selectedIds.size === filteredWorkouts.length && filteredWorkouts.length > 0
                  ? "Deselect All"
                  : "Select All"}
              </span>
            </button>
            {selectedIds.size > 0 && (
              <span className="text-[#AD314D] font-bold">
                ({selectedIds.size} selected)
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {selectedIds.size > 0 && (
              <button
                type="button"
                onClick={handleBulkDelete}
                className="flex items-center gap-1 px-3 py-1 rounded-lg bg-red-600 hover:bg-red-700 text-white font-semibold text-xs transition-colors shadow-sm"
              >
                <Trash2 className="w-3 h-3" />
                <span>Delete Selected ({selectedIds.size})</span>
              </button>
            )}

            {onClearImportedWorkouts && (
              <button
                type="button"
                onClick={onClearImportedWorkouts}
                className="text-[11px] font-medium text-[#4A4A4A] hover:text-[#AD314D] transition-colors"
                title="Clear wrongly uploaded CSV workouts"
              >
                Clear Imported CSV
              </button>
            )}

            {onResetToSampleWorkouts && (
              <button
                type="button"
                onClick={onResetToSampleWorkouts}
                className="text-[11px] font-semibold text-[#AD314D] hover:underline transition-colors"
                title="Reset strictly to clean baseline sample data"
              >
                Reset to Sample Data
              </button>
            )}

            {onOpenSync && (
              <button
                type="button"
                onClick={onOpenSync}
                className="text-[11px] font-medium text-[#4A4A4A] hover:text-[#AD314D] transition-colors"
              >
                Spreadsheet Hub
              </button>
            )}
          </div>
        </div>
      )}

      {/* List of Workout Cards */}
      {filteredWorkouts.length === 0 ? (
        <div className="py-12 text-center text-sm text-[#4A4A4A]">
          No workouts match your search filters.
        </div>
      ) : (
        <div className="space-y-3.5">
          {filteredWorkouts.map((w) => {
            const isExpanded = expandedId === w.id;
            const isSelected = selectedIds.has(w.id);
            const volume = calculateSessionVolume(w);
            const setsCount = calculateSessionSets(w);
            const hasPr = w.exercises.some((e) => e.sets.some((s) => s.isPr));

            return (
              <div
                key={w.id}
                className={`rounded-[16px] border transition-all duration-200 ${
                  isSelected
                    ? "border-[#AD314D] bg-[#FDF8F9]"
                    : isExpanded
                    ? "bg-[#FAFAFA] border-black/[0.1] shadow-[0_4px_16px_rgba(0,0,0,0.03)]"
                    : "bg-[#FDFDFD] hover:bg-[#F9F9F8] border-black/[0.05]"
                }`}
              >
                {/* Collapsed Header Bar */}
                <div
                  onClick={() => toggleExpand(w.id)}
                  className="p-4 sm:p-4.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer select-none"
                >
                  <div className="flex items-start sm:items-center gap-3">
                    {/* Checkbox for batch removal */}
                    <div
                      onClick={(e) => toggleSelect(w.id, e)}
                      className="p-1 -ml-1 text-[#4A4A4A] hover:text-[#AD314D] cursor-pointer"
                    >
                      {isSelected ? (
                        <CheckSquare className="w-4 h-4 text-[#AD314D]" />
                      ) : (
                        <Square className="w-4 h-4 text-black/30" />
                      )}
                    </div>

                    <div className="w-10 h-10 rounded-xl bg-[#F0F0EE] flex flex-col items-center justify-center text-[#222222] border border-black/[0.04]">
                      <span className="text-[10px] uppercase font-bold text-[#4A4A4A] leading-tight">
                        {parseLocalDate(w.date).toLocaleString("en-US", { month: "short" })}
                      </span>
                      <span className="text-sm font-bold text-[#222222] leading-tight">
                        {parseLocalDate(w.date).getDate()}
                      </span>
                    </div>

                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="font-bold text-sm text-[#222222]">
                          {w.title}
                        </h4>
                        {w.weekNumber && (
                          <span className="text-[10px] font-bold text-neutral-700 bg-neutral-100 border border-black/[0.08] px-2 py-0.5 rounded-full">
                            Week {w.weekNumber}
                          </span>
                        )}
                        {hasPr && (
                          <span className="flex items-center gap-1 text-[10px] font-bold uppercase text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                            <Award className="w-3 h-3" />
                            <span>PR</span>
                          </span>
                        )}
                        {w.syncedToSheet && (
                          <span className="text-[10px] text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">
                            Synced
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-3 text-xs text-[#4A4A4A] mt-1">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {w.durationMinutes} min
                        </span>
                        <span>•</span>
                        <span>{setsCount} sets</span>
                        <span>•</span>
                        <span>{w.exercises.length} movements</span>
                      </div>
                    </div>
                  </div>

                  {/* Right side: Volume and toggle indicator */}
                  <div className="flex items-center justify-between sm:justify-end gap-4 pt-2 sm:pt-0 border-t sm:border-t-0 border-black/[0.04]">
                    <div className="text-left sm:text-right">
                      <div className="text-[10px] uppercase text-[#4A4A4A] font-semibold">
                        Total Load
                      </div>
                      <div className="text-sm font-bold text-[#AD314D]">
                        {Math.round(volume * multiplier).toLocaleString()} {unit}
                      </div>
                    </div>

                    <div className="w-8 h-8 rounded-full bg-[#EAEAE8] flex items-center justify-center text-[#4A4A4A]">
                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4" />
                      ) : (
                        <ChevronDown className="w-4 h-4" />
                      )}
                    </div>
                  </div>
                </div>

                {/* Expanded Details */}
                {isExpanded && (
                  <div className="px-4 pb-4 sm:px-5 sm:pb-5 pt-1 border-t border-black/[0.05] animate-fadeIn">
                    {w.notes && (
                      <div className="mb-4 p-3 rounded-xl bg-white border border-black/[0.05] text-xs text-[#4A4A4A] italic">
                        "{w.notes}"
                      </div>
                    )}

                    <div className="space-y-3">
                      {w.exercises.map((ex) => (
                        <div
                          key={ex.id}
                          className="bg-white p-3.5 rounded-xl border border-black/[0.04]"
                        >
                          <div className="flex items-center justify-between mb-2">
                            <span className="font-semibold text-xs text-[#222222]">
                              {ex.exerciseName}
                            </span>
                            <span className="text-[10px] font-semibold text-[#4A4A4A] uppercase bg-[#F0F0EE] px-2 py-0.5 rounded">
                              {ex.muscleGroup}
                            </span>
                          </div>

                          <div className="flex flex-wrap gap-2">
                            {ex.sets.map((s) => {
                              const e1rm = calculate1RM(s.weight, s.reps);
                              return (
                                <div
                                  key={s.id}
                                  className={`px-2.5 py-1.5 rounded-lg text-xs flex items-center gap-1.5 border ${
                                    s.isPr
                                      ? "bg-amber-50/70 border-amber-200 text-amber-900"
                                      : "bg-[#F8F8F7] border-black/[0.04] text-[#222222]"
                                  }`}
                                >
                                  <span className="text-[10px] text-[#4A4A4A] font-bold">
                                    #{s.setNumber}:
                                  </span>
                                  <span className="font-bold">
                                    {Math.round(s.weight * multiplier)} {unit}
                                  </span>
                                  <span className="text-[#4A4A4A]">× {s.reps}</span>
                                  {s.rpe && (
                                    <span className="text-[10px] text-[#4A4A4A]">
                                      @{s.rpe}
                                    </span>
                                  )}
                                  <span className="text-[10px] text-[#AD314D] font-medium ml-1">
                                    ({Math.round(e1rm * multiplier)} e1RM)
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Bottom Actions */}
                    <div className="mt-4 pt-3 flex items-center justify-end">
                      <button
                        type="button"
                        onClick={() => {
                          if (confirm("Are you sure you want to remove this workout session?")) {
                            onDeleteWorkout(w.id);
                          }
                        }}
                        className="flex items-center gap-1.5 text-xs text-[#4A4A4A] hover:text-rose-600 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Delete Session</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
