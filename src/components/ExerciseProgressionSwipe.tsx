import React, { useRef, useState, useEffect } from "react";
import {
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  Sparkles,
  Award,
  Layers,
  Dumbbell,
  ArrowUpRight,
  Filter,
  CheckCircle2,
  Building2
} from "lucide-react";
import { WorkoutSession, WeightUnit, MuscleGroup, ExerciseProgressionItem } from "../types";
import { calculateExerciseProgressions, calculateBodypartSets } from "../utils/calculations";
import { BodypartSetsModal } from "./BodypartSetsModal";

interface ExerciseProgressionSwipeProps {
  workouts: WorkoutSession[];
  unit: WeightUnit;
}

export const ExerciseProgressionSwipe: React.FC<ExerciseProgressionSwipeProps> = ({
  workouts,
  unit
}) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [selectedBodypart, setSelectedBodypart] = useState<MuscleGroup | "All">("All");
  const [activeCardIndex, setActiveCardIndex] = useState(0);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);
  const [isSetsModalOpen, setIsSetsModalOpen] = useState(false);

  const progressions = calculateExerciseProgressions(workouts);
  const bodypartSummaries = calculateBodypartSets(workouts);

  const filteredProgressions =
    selectedBodypart === "All"
      ? progressions
      : progressions.filter((item) => item.bodypart === selectedBodypart);

  // Check scroll positions
  const updateScrollButtons = () => {
    if (!scrollContainerRef.current) return;
    const { scrollLeft, scrollWidth, clientWidth } = scrollContainerRef.current;
    setCanScrollLeft(scrollLeft > 10);
    setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 10);

    // Calculate approximate active card index
    const cardWidth = 320; // approximate width + gap
    const idx = Math.min(
      filteredProgressions.length - 1,
      Math.max(0, Math.round(scrollLeft / cardWidth))
    );
    setActiveCardIndex(idx);
  };

  useEffect(() => {
    updateScrollButtons();
    const el = scrollContainerRef.current;
    if (el) {
      el.addEventListener("scroll", updateScrollButtons, { passive: true });
      return () => el.removeEventListener("scroll", updateScrollButtons);
    }
  }, [filteredProgressions.length]);

  const scroll = (direction: "left" | "right") => {
    if (!scrollContainerRef.current) return;
    const scrollAmount = 340;
    scrollContainerRef.current.scrollBy({
      left: direction === "left" ? -scrollAmount : scrollAmount,
      behavior: "smooth"
    });
  };

  // Unit conversion helpers
  const toDisplayWeight = (kgVal: number) => {
    if (unit === "lbs") {
      return Math.round(kgVal * 2.20462 * 10) / 10;
    }
    return Math.round(kgVal * 10) / 10;
  };

  const toDisplayChange = (kgVal: number) => {
    const converted = unit === "lbs" ? kgVal * 2.20462 : kgVal;
    const rounded = Math.round(converted * 10) / 10;
    return (rounded >= 0 ? "+" : "") + rounded;
  };

  return (
    <div className="w-full space-y-4">
      {/* SECTION HEADER & CONTROLS */}
      <div className="bg-white rounded-[20px] border border-black/[0.06] p-5 sm:p-6 shadow-[0_4px_24px_rgba(0,0,0,0.03)]">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-black/[0.06]">
          <div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-[#AD314D]/10 flex items-center justify-center text-[#AD314D]">
                <TrendingUp className="w-4 h-4" />
              </div>
              <h2 className="text-lg sm:text-xl font-bold text-[#222222] tracking-tight">
                Exercise Progression &amp; Bodypart Loading
              </h2>
              <span className="hidden sm:inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-[#AD314D]/10 text-[#AD314D]">
                <Sparkles className="w-3 h-3" /> AI Matched
              </span>
            </div>
            <p className="text-xs text-[#4A4A4A] mt-1">
              Swipe across movements to track % and {unit} progression. AI automatically matches exercises
              (e.g., Biceps Curl → Arms, Bench Press → Chest).
            </p>
          </div>

          {/* Quick Carousel Controls */}
          <div className="flex items-center gap-2 self-end md:self-auto">
            <button
              onClick={() => setIsSetsModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#ECECEB] hover:bg-black/10 text-xs font-semibold text-[#222222] transition-colors border border-black/[0.06]"
            >
              <Layers className="w-3.5 h-3.5 text-[#AD314D]" />
              <span>Full Sets Matrix</span>
            </button>

            <div className="flex items-center bg-[#ECECEB] p-1 rounded-xl border border-black/[0.06]">
              <button
                onClick={() => scroll("left")}
                disabled={!canScrollLeft}
                className="w-7 h-7 rounded-lg flex items-center justify-center text-[#222222] hover:bg-white disabled:opacity-30 disabled:hover:bg-transparent transition-all"
                title="Previous Exercise"
                aria-label="Previous Exercise"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="px-2 text-[11px] font-bold text-[#4A4A4A] min-w-[50px] text-center">
                {filteredProgressions.length > 0 ? `${activeCardIndex + 1}/${filteredProgressions.length}` : "0/0"}
              </span>
              <button
                onClick={() => scroll("right")}
                disabled={!canScrollRight}
                className="w-7 h-7 rounded-lg flex items-center justify-center text-[#222222] hover:bg-white disabled:opacity-30 disabled:hover:bg-transparent transition-all"
                title="Next Exercise"
                aria-label="Next Exercise"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* SETS PER BODYPART QUICK BAR */}
        <div className="pt-3 pb-1">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-[#4A4A4A]">
              <Layers className="w-3.5 h-3.5 text-[#AD314D]" />
              <span>Sets Per Bodypart (This Week):</span>
            </div>
            <span className="text-[11px] text-[#4A4A4A]/80">
              Click to filter swipable cards
            </span>
          </div>

          <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
            <button
              onClick={() => setSelectedBodypart("All")}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-1.5 ${
                selectedBodypart === "All"
                  ? "bg-[#222222] text-white shadow-sm"
                  : "bg-[#ECECEB] text-[#4A4A4A] hover:bg-black/10 border border-black/[0.04]"
              }`}
            >
              <span>All Exercises</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                selectedBodypart === "All" ? "bg-white/20 text-white" : "bg-black/5 text-[#4A4A4A]"
              }`}>
                {progressions.length}
              </span>
            </button>

            {bodypartSummaries.map((s) => (
              <button
                key={s.bodypart}
                onClick={() => setSelectedBodypart(s.bodypart)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-1.5 ${
                  selectedBodypart === s.bodypart
                    ? "bg-[#AD314D] text-white shadow-sm"
                    : "bg-[#ECECEB] text-[#4A4A4A] hover:bg-black/10 border border-black/[0.04]"
                }`}
              >
                <span>{s.bodypart}</span>
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                    selectedBodypart === s.bodypart
                      ? "bg-white/25 text-white"
                      : "bg-[#AD314D]/10 text-[#AD314D]"
                  }`}
                >
                  {s.setsThisWeek} sets
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* SWIPABLE EXERCISE PROGRESSION CAROUSEL */}
        <div className="relative mt-2">
          {filteredProgressions.length > 0 ? (
            <div
              ref={scrollContainerRef}
              className="flex gap-4 overflow-x-auto snap-x snap-mandatory py-2 px-0.5 scrollbar-none scroll-smooth"
            >
              {filteredProgressions.map((item, idx) => {
                const isPositive = item.percentChange >= 0;
                const changeKg = toDisplayChange(item.weightChange);
                const currentDisp = toDisplayWeight(item.currentWeight);
                const baselineDisp = toDisplayWeight(item.baselineWeight);
                const currentE1rmDisp = toDisplayWeight(item.currentE1RM);
                const baselineE1rmDisp = toDisplayWeight(item.baselineE1RM);

                return (
                  <div
                    key={`${item.exerciseName}_${item.gymName || "default"}`}
                    className="min-w-[280px] sm:min-w-[320px] max-w-[340px] flex-shrink-0 snap-center bg-white rounded-[18px] border border-black/[0.08] p-4 sm:p-5 shadow-sm hover:shadow-md transition-all duration-200 flex flex-col justify-between group hover:-translate-y-0.5"
                  >
                    <div>
                      {/* Card Header: AI Bodypart & Gym Badge & PR */}
                      <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-[#ECECEB] text-[#4A4A4A] border border-black/[0.04]">
                            <Sparkles className="w-3 h-3 text-[#AD314D]" />
                            <span>{item.bodypart}</span>
                            <span className="text-[9px] text-[#AD314D] font-bold uppercase tracking-wider">AI</span>
                          </span>

                          {item.gymName && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-100">
                              <Building2 className="w-3 h-3 text-indigo-500" />
                              <span>{item.gymName}</span>
                            </span>
                          )}
                        </div>

                        {item.isPr && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                            <Award className="w-3 h-3 text-amber-500" />
                            <span>PR Active</span>
                          </span>
                        )}
                      </div>

                      {/* Exercise Name */}
                      <h3 className="text-base sm:text-lg font-bold text-[#222222] tracking-tight leading-snug truncate" title={item.exerciseName}>
                        {item.exerciseName}
                      </h3>

                      {/* Overload Metrics Block */}
                      <div className="mt-3 p-3 rounded-xl bg-[#ECECEB]/70 border border-black/[0.04]">
                        <div className="flex items-baseline justify-between gap-2">
                          <div>
                            <div className="text-[10px] font-semibold uppercase tracking-wider text-[#4A4A4A]">
                              Progression ({unit})
                            </div>
                            <div className="flex items-baseline gap-1.5 mt-0.5">
                              <span className="text-2xl sm:text-3xl font-extrabold text-[#222222] tracking-tight">
                                {changeKg}
                              </span>
                              <span className="text-xs font-semibold text-[#4A4A4A]">
                                {unit}
                              </span>
                            </div>
                          </div>

                          <div
                            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold ${
                              isPositive
                                ? "bg-emerald-100/80 text-emerald-800"
                                : "bg-rose-100 text-rose-800"
                            }`}
                          >
                            <ArrowUpRight className={`w-3.5 h-3.5 ${!isPositive && "rotate-90"}`} />
                            <span>
                              {isPositive ? "+" : ""}
                              {item.percentChange.toFixed(1)}%
                            </span>
                          </div>
                        </div>

                        {/* Baseline to Current Track */}
                        <div className="mt-2.5 pt-2 border-t border-black/[0.06] flex items-center justify-between text-xs text-[#4A4A4A]">
                          <span>Baseline: <strong className="text-[#222222]">{baselineDisp} {unit}</strong></span>
                          <span className="text-black/30">→</span>
                          <span>Current: <strong className="text-[#AD314D]">{currentDisp} {unit}</strong></span>
                        </div>
                      </div>

                      {/* 1RM & Sets Secondary Details */}
                      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                        <div className="bg-[#ECECEB]/40 p-2 rounded-lg border border-black/[0.03]">
                          <div className="text-[10px] text-[#4A4A4A] uppercase font-medium">Est 1RM</div>
                          <div className="font-bold text-[#222222] mt-0.5">
                            {currentE1rmDisp} {unit}
                            <span className="text-[10px] text-emerald-700 font-semibold ml-1">
                              ({isPositive ? "+" : ""}{item.e1rmPercentChange.toFixed(0)}%)
                            </span>
                          </div>
                        </div>

                        <div className="bg-[#ECECEB]/40 p-2 rounded-lg border border-black/[0.03]">
                          <div className="text-[10px] text-[#4A4A4A] uppercase font-medium">Weekly Sets</div>
                          <div className="font-bold text-[#222222] mt-0.5">
                            {item.setsThisWeek} <span className="text-[10px] text-[#4A4A4A] font-normal">({item.totalSets} total)</span>
                          </div>
                        </div>
                      </div>

                      {/* Mini Sparkline Visualization */}
                      {item.history.length > 1 && (
                        <div className="mt-3 pt-2 border-t border-black/[0.04]">
                          <div className="flex items-center justify-between text-[10px] text-[#4A4A4A] mb-1">
                            <span>Trend ({item.history.length} logged sessions)</span>
                            <span className="font-medium text-emerald-700">Overload Trajectory</span>
                          </div>
                          <div className="h-6 flex items-end gap-1 px-1">
                            {item.history.map((hist, hIdx) => {
                              const minW = Math.min(...item.history.map((h) => h.weight));
                              const maxW = Math.max(...item.history.map((h) => h.weight));
                              const range = maxW - minW || 1;
                              const heightPct = Math.max(25, Math.round(((hist.weight - minW) / range) * 100));

                              return (
                                <div
                                  key={hIdx}
                                  className="flex-1 bg-[#ECECEB] rounded-t hover:bg-[#AD314D] transition-colors relative group/bar"
                                  style={{ height: `${heightPct}%` }}
                                  title={`${hist.date}: ${hist.weight} kg`}
                                />
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Footer Date & Status */}
                    <div className="mt-4 pt-3 border-t border-black/[0.06] flex items-center justify-between text-[11px] text-[#4A4A4A]">
                      <span>Last Session: {item.latestDate}</span>
                      <span className="font-semibold text-[#222222]">
                        {item.sessionsCount} {item.sessionsCount === 1 ? "Session" : "Sessions"}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="py-8 text-center text-sm text-[#4A4A4A] bg-[#ECECEB]/50 rounded-2xl border border-dashed border-black/10">
              No exercises found for {selectedBodypart}. Log sessions or import data to view progression.
            </div>
          )}
        </div>

        {/* Carousel indicator dots */}
        {filteredProgressions.length > 1 && (
          <div className="flex items-center justify-center gap-1.5 mt-3 pt-2">
            {filteredProgressions.slice(0, 10).map((_, dotIdx) => (
              <button
                key={dotIdx}
                onClick={() => {
                  if (scrollContainerRef.current) {
                    scrollContainerRef.current.scrollTo({
                      left: dotIdx * 320,
                      behavior: "smooth"
                    });
                  }
                }}
                className={`h-1.5 rounded-full transition-all ${
                  activeCardIndex === dotIdx
                    ? "w-6 bg-[#AD314D]"
                    : "w-1.5 bg-black/15 hover:bg-black/30"
                }`}
                aria-label={`Go to slide ${dotIdx + 1}`}
              />
            ))}
            {filteredProgressions.length > 10 && (
              <span className="text-[10px] text-[#4A4A4A] font-medium ml-1">
                +{filteredProgressions.length - 10} more
              </span>
            )}
          </div>
        )}
      </div>

      {/* Bodypart Sets Detailed Breakdown Modal */}
      <BodypartSetsModal
        isOpen={isSetsModalOpen}
        onClose={() => setIsSetsModalOpen(false)}
        workouts={workouts}
        unit={unit}
      />
    </div>
  );
};
