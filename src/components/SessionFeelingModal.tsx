import React, { useState } from "react";
import { SessionFeeling } from "../types";
import {
  Smile,
  Frown,
  Meh,
  Flame,
  Zap,
  CheckCircle2,
  X,
  Sparkles
} from "lucide-react";

interface SessionFeelingModalProps {
  isOpen: boolean;
  onClose: () => void;
  workoutTitle?: string;
  workoutId?: string;
  initialRpe?: number;
  onSaveFeeling: (feeling: SessionFeeling) => void;
}

export const SessionFeelingModal: React.FC<SessionFeelingModalProps> = ({
  isOpen,
  onClose,
  workoutTitle = "Recent Workout",
  workoutId = "workout-recent",
  initialRpe,
  onSaveFeeling
}) => {
  const [rating, setRating] = useState<number>(4);
  const [soreness, setSoreness] = useState<number>(2);
  const [energyLevel, setEnergyLevel] = useState<"low" | "medium" | "high">("high");
  const [rpe, setRpe] = useState<number>(initialRpe ?? 9);
  const [notes, setNotes] = useState("");

  React.useEffect(() => {
    if (initialRpe !== undefined && initialRpe > 0) {
      setRpe(initialRpe);
    }
  }, [initialRpe, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const feeling: SessionFeeling = {
      workoutId,
      rating,
      soreness,
      rpeAverage: rpe,
      energyLevel,
      notes: notes.trim() || undefined,
      loggedAt: new Date().toISOString().split("T")[0]
    };
    onSaveFeeling(feeling);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
      <div className="w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-black/[0.08] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-5 border-b border-black/[0.06] bg-[#F7F7F6] flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[#AD314D]" />
              <h2 className="text-base font-bold text-[#222222]">
                How did this session feel?
              </h2>
            </div>
            <p className="text-xs text-[#4A4A4A] mt-0.5">
              Logging feelings enables AI Coach to detect overtraining and stagnation.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full text-[#777777] hover:bg-black/[0.05]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Question 1: Overall Session Rating (1-5) */}
          <div>
            <label className="block text-xs font-bold text-[#222222] mb-1.5">
              Overall Session Rating: {rating} / 5
            </label>
            <div className="grid grid-cols-5 gap-2">
              {[
                { val: 1, label: "Exhausted" },
                { val: 2, label: "Fatigued" },
                { val: 3, label: "Moderate" },
                { val: 4, label: "Strong" },
                { val: 5, label: "Peak Power" }
              ].map((item) => (
                <button
                  key={item.val}
                  type="button"
                  onClick={() => setRating(item.val)}
                  className={`py-2.5 px-1 rounded-2xl border text-center transition-all ${
                    rating === item.val
                      ? "border-[#AD314D] bg-rose-50 text-[#AD314D] font-bold shadow-sm ring-1 ring-[#AD314D]"
                      : "border-black/[0.08] hover:border-black/[0.2] bg-white text-[#4A4A4A]"
                  }`}
                >
                  <div className="text-sm">{item.val}</div>
                  <div className="text-[9px] truncate">{item.label}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Question 2: Soreness Level (1-5) */}
          <div>
            <label className="block text-xs font-bold text-[#222222] mb-1.5">
              Muscle Soreness & Joint Strain: {soreness} / 5
            </label>
            <div className="grid grid-cols-5 gap-2">
              {[
                { val: 1, label: "None" },
                { val: 2, label: "Mild" },
                { val: 3, label: "Moderate" },
                { val: 4, label: "High" },
                { val: 5, label: "Severe" }
              ].map((item) => (
                <button
                  key={item.val}
                  type="button"
                  onClick={() => setSoreness(item.val)}
                  className={`py-2.5 px-1 rounded-2xl border text-center transition-all ${
                    soreness === item.val
                      ? "border-[#AD314D] bg-rose-50 text-[#AD314D] font-bold shadow-sm ring-1 ring-[#AD314D]"
                      : "border-black/[0.08] hover:border-black/[0.2] bg-white text-[#4A4A4A]"
                  }`}
                >
                  <div className="text-sm">{item.val}</div>
                  <div className="text-[9px] truncate">{item.label}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Energy & RPE Row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-[#222222] mb-1">
                Energy Level
              </label>
              <select
                value={energyLevel}
                onChange={(e) => setEnergyLevel(e.target.value as any)}
                className="w-full px-3 py-2 rounded-xl border border-black/[0.1] text-xs bg-[#FBFBFA]"
              >
                <option value="low">Low Energy / Sluggish</option>
                <option value="medium">Medium / Normal</option>
                <option value="high">High Energy / Fired Up</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-[#222222] mb-1">
                Average RPE ({rpe})
              </label>
              <input
                type="range"
                min={5}
                max={10}
                step={0.5}
                value={rpe}
                onChange={(e) => setRpe(Number(e.target.value))}
                className="w-full accent-[#AD314D] mt-2"
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-bold text-[#222222] mb-1">
              Personal Reflection & Pump Notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Great shoulder pump, but triceps felt pre-exhausted on the 3rd set of dips."
              rows={3}
              className="w-full p-3 rounded-2xl border border-black/[0.1] text-xs bg-[#FBFBFA] focus:outline-none focus:ring-2 focus:ring-[#AD314D]/20"
            />
          </div>

          <div className="pt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-full border border-black/[0.08] text-xs font-semibold text-[#4A4A4A] hover:bg-neutral-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-full bg-[#AD314D] hover:bg-[#92263F] text-white text-xs font-semibold shadow-sm transition-all"
            >
              Save Session Feeling
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
