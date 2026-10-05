import React, { useState } from "react";
import { ProgressPhoto, WeightUnit } from "../types";
import {
  Camera,
  Image as ImageIcon,
  Plus,
  Calendar,
  Scale,
  Trash2,
  X,
  Sparkles,
  Columns
} from "lucide-react";

interface ProgressPhotosModalProps {
  isOpen: boolean;
  onClose: () => void;
  photos: ProgressPhoto[];
  onUpdatePhotos: (photos: ProgressPhoto[]) => void;
  unit: WeightUnit;
}

export const ProgressPhotosModal: React.FC<ProgressPhotosModalProps> = ({
  isOpen,
  onClose,
  photos,
  onUpdatePhotos,
  unit
}) => {
  const [isAdding, setIsAdding] = useState(false);
  const [photoUrl, setPhotoUrl] = useState("");
  const [phase, setPhase] = useState<ProgressPhoto["phase"]>("check-in");
  const [weightKg, setWeightKg] = useState<number>(() => photos[0]?.weightKg || 78.1);
  const [bodyFatPercent, setBodyFatPercent] = useState<number>(14.2);
  const [notes, setNotes] = useState("");
  const [comparisonMode, setComparisonMode] = useState<"grid" | "side-by-side">("side-by-side");

  if (!isOpen) return null;

  const handleAddPhoto = (e: React.FormEvent) => {
    e.preventDefault();
    if (!photoUrl.trim()) return;

    const newPhoto: ProgressPhoto = {
      id: `photo-${Date.now()}`,
      date: new Date().toISOString().split("T")[0],
      phase,
      weightKg,
      bodyFatPercent: bodyFatPercent || undefined,
      photoUrl: photoUrl.trim(),
      notes: notes.trim() || undefined
    };

    onUpdatePhotos([newPhoto, ...photos]);
    setIsAdding(false);
    setPhotoUrl("");
    setNotes("");
  };

  const handleDelete = (id: string) => {
    onUpdatePhotos(photos.filter((p) => p.id !== id));
  };

  const beforePhoto = photos.find((p) => p.phase === "before") || photos[photos.length - 1];
  const afterPhoto = photos.find((p) => p.phase === "after") || photos[0];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
      <div className="w-full max-w-4xl bg-white rounded-3xl shadow-2xl border border-black/[0.08] overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-6 py-5 border-b border-black/[0.06] bg-[#F7F7F6] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-[#AD314D] to-[#601427] text-white flex items-center justify-center shadow-sm">
              <Camera className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#222222]">
                Physique Progress & Comparison
              </h2>
              <p className="text-xs text-[#4A4A4A]">
                Side-by-side transformation gallery with weight & body fat tags
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center p-1 rounded-2xl bg-[#EFEFED]">
              <button
                type="button"
                onClick={() => setComparisonMode("side-by-side")}
                className={`px-3 py-1 rounded-xl text-xs font-semibold transition-all ${
                  comparisonMode === "side-by-side"
                    ? "bg-white text-[#222222] shadow-sm"
                    : "text-[#4A4A4A]"
                }`}
              >
                Side-by-Side
              </button>
              <button
                type="button"
                onClick={() => setComparisonMode("grid")}
                className={`px-3 py-1 rounded-xl text-xs font-semibold transition-all ${
                  comparisonMode === "grid"
                    ? "bg-white text-[#222222] shadow-sm"
                    : "text-[#4A4A4A]"
                }`}
              >
                All Photos ({photos.length})
              </button>
            </div>

            <button
              type="button"
              onClick={() => setIsAdding(!isAdding)}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[#AD314D] hover:bg-[#92263F] text-white text-xs font-semibold shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Photo</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-full text-[#777777] hover:bg-black/[0.05]"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Add Photo Form */}
        {isAdding && (
          <form
            onSubmit={handleAddPhoto}
            className="p-6 border-b border-black/[0.06] bg-[#FBFBFA] space-y-3"
          >
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#222222]">
              Upload New Progress Picture
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-[#222222] mb-1">
                  Image URL
                </label>
                <input
                  type="url"
                  placeholder="https://images.unsplash.com/..."
                  value={photoUrl}
                  onChange={(e) => setPhotoUrl(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-black/[0.1] text-xs bg-white"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#222222] mb-1">
                  Stage / Phase
                </label>
                <select
                  value={phase}
                  onChange={(e) => setPhase(e.target.value as any)}
                  className="w-full px-3 py-2 rounded-xl border border-black/[0.1] text-xs bg-white"
                >
                  <option value="before">Before / Baseline</option>
                  <option value="check-in">Monthly Check-In</option>
                  <option value="after">Current / Peak After</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#222222] mb-1">
                  Scale Weight ({unit})
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={weightKg}
                  onChange={(e) => setWeightKg(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-xl border border-black/[0.1] text-xs bg-white"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#222222] mb-1">
                Progress Notes (e.g. Deltoid definition, lat spread, bulk milestone)
              </label>
              <input
                type="text"
                placeholder="Notes..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-black/[0.1] text-xs bg-white"
              />
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setIsAdding(false)}
                className="px-4 py-1.5 rounded-full border text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-5 py-1.5 rounded-full bg-[#AD314D] text-white text-xs font-semibold shadow-sm"
              >
                Save Photo
              </button>
            </div>
          </form>
        )}

        {/* Content View */}
        <div className="p-6 overflow-y-auto flex-1">
          {comparisonMode === "side-by-side" && beforePhoto && afterPhoto ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Before Photo Card */}
                <div className="rounded-3xl border border-black/[0.08] overflow-hidden bg-white shadow-sm flex flex-col">
                  <div className="px-5 py-3 border-b border-black/[0.06] bg-[#F7F7F6] flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-[#AD314D]">
                      Baseline / Before ({beforePhoto.date})
                    </span>
                    <span className="text-xs font-bold text-[#222222]">
                      {beforePhoto.weightKg} {unit}
                      {beforePhoto.bodyFatPercent ? ` • ${beforePhoto.bodyFatPercent}% BF` : ""}
                    </span>
                  </div>
                  <div className="aspect-[3/4] bg-neutral-100 overflow-hidden relative">
                    <img
                      src={beforePhoto.photoUrl}
                      alt="Before"
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  {beforePhoto.notes && (
                    <div className="p-4 text-xs text-[#4A4A4A] italic">
                      "{beforePhoto.notes}"
                    </div>
                  )}
                </div>

                {/* After Photo Card */}
                <div className="rounded-3xl border border-emerald-300 overflow-hidden bg-white shadow-sm flex flex-col ring-2 ring-emerald-500/20">
                  <div className="px-5 py-3 border-b border-emerald-100 bg-emerald-50/50 flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-emerald-800">
                      Current / After ({afterPhoto.date})
                    </span>
                    <span className="text-xs font-bold text-emerald-900">
                      {afterPhoto.weightKg} {unit}
                      {afterPhoto.bodyFatPercent ? ` • ${afterPhoto.bodyFatPercent}% BF` : ""}
                    </span>
                  </div>
                  <div className="aspect-[3/4] bg-neutral-100 overflow-hidden relative">
                    <img
                      src={afterPhoto.photoUrl}
                      alt="After"
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  {afterPhoto.notes && (
                    <div className="p-4 text-xs text-[#4A4A4A] italic">
                      "{afterPhoto.notes}"
                    </div>
                  )}
                </div>
              </div>

              {/* Transformation Delta Banner */}
              <div className="p-4 rounded-2xl bg-[#F8F8F7] border border-black/[0.06] flex items-center justify-between text-xs">
                <span className="font-semibold text-[#222222]">
                  Net Delta: +{(afterPhoto.weightKg - beforePhoto.weightKg).toFixed(1)} {unit} muscle mass gained
                </span>
                {beforePhoto.bodyFatPercent && afterPhoto.bodyFatPercent && (
                  <span className="font-semibold text-emerald-700">
                    -{(beforePhoto.bodyFatPercent - afterPhoto.bodyFatPercent).toFixed(1)}% body fat reduction
                  </span>
                )}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {photos.map((photo) => (
                <div
                  key={photo.id}
                  className="rounded-3xl border border-black/[0.08] overflow-hidden bg-white shadow-sm flex flex-col"
                >
                  <div className="px-4 py-2.5 border-b border-black/[0.06] bg-[#F7F7F6] flex items-center justify-between text-xs">
                    <span className="font-bold text-[#AD314D] uppercase text-[10px]">
                      {photo.phase}
                    </span>
                    <span className="text-[11px] text-[#777777]">{photo.date}</span>
                  </div>
                  <div className="aspect-square bg-neutral-100 overflow-hidden">
                    <img
                      src={photo.photoUrl}
                      alt="Physique"
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="p-3.5 space-y-1 flex-1 flex flex-col justify-between">
                    <div>
                      <div className="font-bold text-xs text-[#222222]">
                        {photo.weightKg} {unit}
                        {photo.bodyFatPercent ? ` • ${photo.bodyFatPercent}% BF` : ""}
                      </div>
                      {photo.notes && (
                        <p className="text-[11px] text-[#777777] line-clamp-2 mt-1">
                          {photo.notes}
                        </p>
                      )}
                    </div>
                    <div className="pt-2 flex justify-end">
                      <button
                        type="button"
                        onClick={() => handleDelete(photo.id)}
                        className="text-[#777777] hover:text-rose-600 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
