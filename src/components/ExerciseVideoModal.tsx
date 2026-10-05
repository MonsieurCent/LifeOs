import React, { useState } from "react";
import { EXERCISE_VIDEOS } from "../utils/fitnessData";
import { ExerciseVideo, MuscleGroup } from "../types";
import {
  Play,
  CheckCircle2,
  AlertOctagon,
  Dumbbell,
  X,
  Sparkles,
  ExternalLink
} from "lucide-react";

interface ExerciseVideoModalProps {
  isOpen: boolean;
  onClose: () => void;
  preSelectedExerciseName?: string;
}

export const ExerciseVideoModal: React.FC<ExerciseVideoModalProps> = ({
  isOpen,
  onClose,
  preSelectedExerciseName
}) => {
  const [selectedVideo, setSelectedVideo] = useState<ExerciseVideo>(() => {
    if (preSelectedExerciseName) {
      const match = EXERCISE_VIDEOS.find((v) =>
        v.name.toLowerCase().includes(preSelectedExerciseName.toLowerCase())
      );
      if (match) return match;
    }
    return EXERCISE_VIDEOS[0];
  });

  const [activeFilter, setActiveFilter] = useState<MuscleGroup | "All">("All");

  if (!isOpen) return null;

  const filteredVideos =
    activeFilter === "All"
      ? EXERCISE_VIDEOS
      : EXERCISE_VIDEOS.filter((v) => v.muscleGroup === activeFilter);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
      <div className="w-full max-w-4xl bg-white rounded-3xl shadow-2xl border border-black/[0.08] overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-6 py-5 border-b border-black/[0.06] bg-[#F7F7F6] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-[#AD314D] to-[#68172C] text-white flex items-center justify-center shadow-sm">
              <Play className="w-4 h-4 fill-white ml-0.5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#222222]">
                Exercise Video & Form Guide
              </h2>
              <p className="text-xs text-[#4A4A4A]">
                Video demonstrations, biomechanical execution cues, and injury prevention
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

        {/* Filter Pills */}
        <div className="px-6 py-3 border-b border-black/[0.04] bg-[#FAFAF9] flex items-center gap-1.5 overflow-x-auto">
          {(["All", "Chest", "Back", "Legs", "Shoulders"] as const).map((group) => (
            <button
              key={group}
              type="button"
              onClick={() => setActiveFilter(group)}
              className={`px-3 py-1 rounded-full text-xs font-semibold transition-all ${
                activeFilter === group
                  ? "bg-[#AD314D] text-white shadow-sm"
                  : "bg-white border border-black/[0.06] text-[#4A4A4A] hover:text-[#222222]"
              }`}
            >
              {group}
            </button>
          ))}
        </div>

        {/* Main Grid: Left Video Player & Right Library */}
        <div className="p-6 overflow-y-auto grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1">
          {/* Left Column: Active Video & Cues (7 cols) */}
          <div className="lg:col-span-7 space-y-4">
            {/* Embedded Responsive Video Container */}
            <div className="relative w-full aspect-video rounded-2xl overflow-hidden bg-black shadow-md">
              <iframe
                src={selectedVideo.videoUrl}
                title={selectedVideo.name}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                className="w-full h-full border-0"
              />
            </div>

            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-rose-50 text-[#AD314D] border border-rose-100">
                  {selectedVideo.muscleGroup}
                </span>
                <h3 className="text-lg font-bold text-[#222222]">
                  {selectedVideo.name}
                </h3>
              </div>
            </div>

            {/* Biomechanical Cues */}
            <div className="p-4 rounded-2xl bg-[#F8F8F7] border border-black/[0.04] space-y-2">
              <div className="text-xs font-bold text-[#222222] flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>Form Execution Cues</span>
              </div>
              <ul className="space-y-1.5">
                {selectedVideo.cues.map((cue, idx) => (
                  <li key={idx} className="text-xs text-[#4A4A4A] flex items-start gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-1.5 shrink-0" />
                    <span>{cue}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Common Mistakes */}
            <div className="p-4 rounded-2xl bg-amber-50/50 border border-amber-200/60 space-y-2">
              <div className="text-xs font-bold text-amber-900 flex items-center gap-1.5">
                <AlertOctagon className="w-4 h-4 text-amber-600" />
                <span>Common Form Mistakes to Avoid</span>
              </div>
              <ul className="space-y-1.5">
                {selectedVideo.commonMistakes.map((mistake, idx) => (
                  <li key={idx} className="text-xs text-amber-950/80 flex items-start gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 mt-1.5 shrink-0" />
                    <span>{mistake}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Right Column: Library List (5 cols) */}
          <div className="lg:col-span-5 space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-[#4A4A4A]">
              Exercise Library ({filteredVideos.length})
            </h4>
            <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
              {filteredVideos.map((video) => (
                <button
                  key={video.id}
                  type="button"
                  onClick={() => setSelectedVideo(video)}
                  className={`w-full p-3 rounded-2xl border text-left transition-all flex items-center gap-3 ${
                    selectedVideo.id === video.id
                      ? "border-[#AD314D] bg-rose-50/50 shadow-sm ring-1 ring-[#AD314D]/30"
                      : "border-black/[0.06] hover:border-black/[0.15] bg-white"
                  }`}
                >
                  <img
                    src={video.thumbnailUrl}
                    alt={video.name}
                    referrerPolicy="no-referrer"
                    className="w-16 h-12 rounded-xl object-cover shrink-0 bg-neutral-100"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="font-bold text-xs text-[#222222] truncate">
                      {video.name}
                    </div>
                    <div className="text-[11px] text-[#777777] mt-0.5">
                      Target: {video.muscleGroup}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
