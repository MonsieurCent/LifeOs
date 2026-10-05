import React, { useState, useEffect } from "react";
import { 
  MapPin, 
  Search, 
  CheckCircle2, 
  RefreshCw, 
  ExternalLink, 
  Star, 
  Navigation2, 
  X, 
  Plus, 
  Dumbbell, 
  ChevronRight,
  AlertCircle,
  Building2,
  Sparkles
} from "lucide-react";
import { Gym } from "../types";
import { 
  detectCurrentGym, 
  searchNearbyGyms, 
  convertResultToGym, 
  NearbyGymResult, 
  getStaticMapThumbnailUrl 
} from "../utils/googleMapsService";

interface GymLocationSelectorProps {
  selectedGymId?: string;
  selectedGymName?: string;
  gyms: Gym[];
  onSelectGym: (gym: Gym) => void;
  compact?: boolean;
  isDarkMode?: boolean;
}

export const GymLocationSelector: React.FC<GymLocationSelectorProps> = ({
  selectedGymId,
  selectedGymName,
  gyms,
  onSelectGym,
  compact = false,
  isDarkMode = false
}) => {
  const [isDetecting, setIsDetecting] = useState(false);
  const [detectedGym, setDetectedGym] = useState<NearbyGymResult | null>(null);
  const [confidence, setConfidence] = useState<"high" | "medium" | "low" | "none">("none");
  const [detectionError, setDetectionError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  // Modal search & list state
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [nearbyResults, setNearbyResults] = useState<NearbyGymResult[]>([]);
  const [customName, setCustomName] = useState("");
  const [customLocation, setCustomLocation] = useState("");
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(null);

  const activeGym = gyms.find((g) => g.id === selectedGymId) || 
    (selectedGymName ? { id: "temp", name: selectedGymName, location: "" } : null);

  // Auto-detect nearby gym on mount if no gym is explicitly selected yet
  useEffect(() => {
    if (!selectedGymId && !selectedGymName && !detectedGym) {
      handleDetectGym();
    }
  }, []);

  const handleDetectGym = async () => {
    setIsDetecting(true);
    setDetectionError(null);
    try {
      const res = await detectCurrentGym();
      if (res.userLocation) {
        setUserCoords(res.userLocation);
      }
      if (res.recognizedGym) {
        setDetectedGym(res.recognizedGym);
        setConfidence(res.confidence);
      }
      if (res.alternatives && res.alternatives.length > 0) {
        setNearbyResults(res.alternatives);
      }
      if (res.error) {
        setDetectionError(res.error);
      }
    } catch (err: any) {
      setDetectionError(err?.message || "Failed to detect location.");
    } finally {
      setIsDetecting(false);
    }
  };

  const handleConfirmDetected = (result: NearbyGymResult) => {
    const gymObj = convertResultToGym(result);
    onSelectGym(gymObj);
    setDetectedGym(null);
  };

  const handleSearchNearby = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setIsSearching(true);
    try {
      const results = await searchNearbyGyms({
        lat: userCoords?.lat,
        lng: userCoords?.lng,
        query: searchQuery.trim() || undefined
      });
      setNearbyResults(results);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSearching(false);
    }
  };

  const handleCreateCustomGym = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customName.trim()) return;
    const newGym: Gym = {
      id: `gym-${Date.now()}`,
      name: customName.trim(),
      location: customLocation.trim() || "Private Facility",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    onSelectGym(newGym);
    setCustomName("");
    setCustomLocation("");
    setIsModalOpen(false);
  };

  const currentGymName = activeGym?.name || selectedGymName || "No Gym Selected";

  return (
    <div className="space-y-3">
      {/* 1. AUTO-DETECTED GYM SUGGESTION BANNER (when unconfirmed detected gym is present) */}
      {detectedGym && !activeGym && (
        <div className="p-4 rounded-2xl bg-gradient-to-r from-amber-50 via-rose-50 to-indigo-50 border border-amber-300/80 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-in fade-in slide-in-from-top-2">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center shrink-0 mt-0.5 shadow-2xs">
              <MapPin className="w-5 h-5 text-amber-600 animate-bounce" />
            </div>
            <div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[10px] uppercase font-black px-2 py-0.5 rounded-full bg-amber-200/80 text-amber-900 border border-amber-300">
                  Google Maps Location Recognized
                </span>
                {detectedGym.distanceKm !== undefined && (
                  <span className="text-[10px] font-bold text-neutral-600">
                    ({detectedGym.distanceKm < 1 
                      ? `${Math.round(detectedGym.distanceKm * 1000)}m` 
                      : `${detectedGym.distanceKm.toFixed(1)}km`} away)
                  </span>
                )}
              </div>

              <h4 className="text-sm font-extrabold text-[#222222] mt-0.5 flex items-center gap-1.5">
                <span>{detectedGym.name}</span>
                {detectedGym.rating && (
                  <span className="text-xs font-bold text-amber-700 flex items-center gap-0.5">
                    <Star className="w-3 h-3 fill-amber-500 text-amber-500" />
                    <span>{detectedGym.rating}</span>
                  </span>
                )}
              </h4>
              <p className="text-xs text-neutral-600 truncate max-w-md">
                {detectedGym.address}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => handleConfirmDetected(detectedGym)}
              className="px-3.5 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold shadow-2xs transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
            >
              <CheckCircle2 className="w-4 h-4 text-white" />
              <span>Confirm This Gym</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setIsModalOpen(true);
                handleSearchNearby();
              }}
              className="px-3 py-2 rounded-xl bg-white hover:bg-neutral-100 text-[#222222] text-xs font-bold border border-black/[0.1] transition-all cursor-pointer"
            >
              Change / Search
            </button>
          </div>
        </div>
      )}

      {/* 2. COMPACT GYM DISPLAY BADGE & CHANGE TRIGGER */}
      <div className={`p-3.5 rounded-2xl border transition-all ${
        isDarkMode 
          ? "bg-zinc-900 border-zinc-800 text-slate-200" 
          : "bg-white border-black/[0.08] shadow-2xs"
      }`}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
              activeGym 
                ? "bg-indigo-50 text-indigo-700 border border-indigo-200/80" 
                : "bg-neutral-100 text-neutral-500"
            }`}>
              <Building2 className="w-4 h-4" />
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] uppercase font-bold text-neutral-600 tracking-wider">
                  Training Location
                </span>
                {activeGym?.googlePlaceId && (
                  <span className="text-[9px] font-extrabold px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800 flex items-center gap-0.5">
                    <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600" /> Google Verified
                  </span>
                )}
              </div>
              <div className="text-xs font-extrabold text-[#222222] dark:text-white truncate">
                {currentGymName}
              </div>
              {activeGym?.location && (
                <div className="text-[11px] text-neutral-600 dark:text-slate-400 truncate">
                  {activeGym.location}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {/* Detect button */}
            <button
              type="button"
              onClick={handleDetectGym}
              disabled={isDetecting}
              className="p-2 rounded-xl bg-neutral-100 hover:bg-neutral-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-[#222222] dark:text-white text-xs font-bold transition-all cursor-pointer flex items-center gap-1"
              title="Recognize gym location via Google Maps GPS"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-amber-600 ${isDetecting ? "animate-spin" : ""}`} />
              <span className="hidden sm:inline text-[11px]">Auto-Detect</span>
            </button>

            {/* Change button */}
            <button
              type="button"
              onClick={() => {
                setIsModalOpen(true);
                if (nearbyResults.length === 0) handleSearchNearby();
              }}
              className="px-3 py-1.5 rounded-xl bg-[#AD314D] hover:bg-[#8C1E37] text-white text-xs font-bold transition-all shadow-2xs flex items-center gap-1 cursor-pointer"
            >
              <MapPin className="w-3.5 h-3.5 text-white" />
              <span>Change Gym</span>
            </button>
          </div>
        </div>
      </div>

      {/* 3. GOOGLE MAPS INTERACTIVE SEARCH & SELECTION MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-2xl bg-white dark:bg-zinc-900 rounded-3xl shadow-2xl border border-black/[0.08] dark:border-zinc-800 overflow-hidden flex flex-col max-h-[90vh]">
            
            {/* Modal Header */}
            <div className="p-5 border-b border-black/[0.08] dark:border-zinc-800 flex items-center justify-between bg-neutral-50 dark:bg-zinc-950">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#AD314D] to-[#68172C] flex items-center justify-center text-white shadow-xs">
                  <MapPin className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-[#222222] dark:text-white flex items-center gap-1.5">
                    <span>Google Maps Gym Location Finder</span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                      Live Grounding
                    </span>
                  </h3>
                  <p className="text-xs text-neutral-600 dark:text-slate-400">
                    Find and confirm your current training facility using real-time Google Maps Places
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-2 rounded-xl hover:bg-neutral-200 dark:hover:bg-zinc-800 text-neutral-500 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Search Input Bar */}
            <div className="p-4 border-b border-black/[0.06] dark:border-zinc-800 bg-white dark:bg-zinc-900 space-y-3">
              <form onSubmit={handleSearchNearby} className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-neutral-400 absolute left-3.5 top-3" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search gym by name or location (e.g. SATS, Gold's Gym, Oslo)..."
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-black/[0.1] dark:border-zinc-700 bg-transparent text-xs font-semibold text-[#222222] dark:text-white placeholder:text-neutral-400 focus:outline-none focus:border-[#AD314D]"
                  />
                </div>
                <button
                  type="submit"
                  disabled={isSearching}
                  className="px-4 py-2.5 rounded-xl bg-[#AD314D] hover:bg-[#8C1E37] text-white text-xs font-bold transition-all shadow-2xs flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
                >
                  {isSearching ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                  <span>Search Maps</span>
                </button>
              </form>

              {/* Quick GPS Refresh Button */}
              <div className="flex items-center justify-between text-xs text-neutral-600">
                <button
                  type="button"
                  onClick={handleDetectGym}
                  disabled={isDetecting}
                  className="text-xs font-bold text-[#AD314D] hover:underline flex items-center gap-1"
                >
                  <Navigation2 className="w-3.5 h-3.5" />
                  <span>{isDetecting ? "Detecting GPS location..." : "Re-detect closest gym from GPS"}</span>
                </button>
                <span className="text-[11px] text-neutral-600">
                  {nearbyResults.length} Google Places found
                </span>
              </div>
            </div>

            {/* Modal Body / Results List */}
            <div className="p-4 overflow-y-auto space-y-4 flex-1">
              
              {/* Error message if any */}
              {detectionError && (
                <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs font-medium flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>{detectionError}</span>
                </div>
              )}

              {/* Saved User Gyms Section */}
              {gyms.length > 0 && (
                <div className="space-y-2">
                  <div className="text-[11px] uppercase font-black tracking-wider text-neutral-600 dark:text-slate-400 flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5 text-[#AD314D]" />
                    <span>Your Saved Gyms ({gyms.length})</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {gyms.map((g) => {
                      const isCurrent = g.id === selectedGymId;
                      return (
                        <div
                          key={g.id}
                          className={`p-3 rounded-2xl border transition-all flex items-center justify-between gap-2 ${
                            isCurrent
                              ? "bg-rose-50/80 border-[#AD314D] text-[#222222]"
                              : "bg-neutral-50 dark:bg-zinc-800 border-black/[0.06] dark:border-zinc-700 hover:border-neutral-300"
                          }`}
                        >
                          <div className="min-w-0">
                            <div className="text-xs font-extrabold truncate">{g.name}</div>
                            {g.location && (
                              <div className="text-[11px] text-neutral-600 dark:text-slate-400 truncate">
                                {g.location}
                              </div>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              onSelectGym(g);
                              setIsModalOpen(false);
                            }}
                            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                              isCurrent
                                ? "bg-[#AD314D] text-white"
                                : "bg-white dark:bg-zinc-900 border border-black/[0.1] text-[#222222] dark:text-white hover:bg-neutral-100"
                            }`}
                          >
                            {isCurrent ? "Selected" : "Select"}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Nearby Google Maps Results */}
              <div className="space-y-2">
                <div className="text-[11px] uppercase font-black tracking-wider text-neutral-600 dark:text-slate-400 flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Google Maps Places Nearby</span>
                </div>

                {isSearching ? (
                  <div className="p-8 text-center space-y-2 text-neutral-600">
                    <RefreshCw className="w-6 h-6 animate-spin text-[#AD314D] mx-auto" />
                    <p className="text-xs font-bold">Querying Google Maps Places API...</p>
                  </div>
                ) : nearbyResults.length === 0 ? (
                  <div className="p-6 rounded-2xl bg-neutral-50 dark:bg-zinc-800 text-center space-y-2 border border-black/[0.05]">
                    <Dumbbell className="w-8 h-8 text-neutral-400 mx-auto" />
                    <p className="text-xs font-bold text-neutral-600 dark:text-slate-300">
                      No nearby gyms loaded yet. Click &quot;Search Maps&quot; or type a gym name above.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {nearbyResults.map((res) => {
                      const gymObj = convertResultToGym(res);
                      const isCurrent = activeGym?.name?.toLowerCase() === res.name.toLowerCase();

                      return (
                        <div
                          key={res.id}
                          className="p-3.5 rounded-2xl border border-black/[0.06] dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:border-neutral-300 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs"
                        >
                          <div className="space-y-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs font-extrabold text-[#222222] dark:text-white">
                                {res.name}
                              </span>
                              {res.rating && (
                                <span className="text-[11px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.2 rounded border border-amber-200 flex items-center gap-0.5">
                                  <Star className="w-3 h-3 fill-amber-500 text-amber-500" />
                                  <span>{res.rating}</span>
                                  {res.userRatingsTotal && (
                                    <span className="text-neutral-600">({res.userRatingsTotal})</span>
                                  )}
                                </span>
                              )}
                              {res.distanceKm !== undefined && (
                                <span className="text-[10px] font-extrabold px-2 py-0.2 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">
                                  {res.distanceKm < 1 
                                    ? `${Math.round(res.distanceKm * 1000)}m away` 
                                    : `${res.distanceKm.toFixed(1)} km away`}
                                </span>
                              )}
                            </div>

                            <p className="text-xs text-neutral-600 dark:text-slate-400 truncate">
                              {res.address}
                            </p>

                            {res.mapsUrl && (
                              <a
                                href={res.mapsUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="text-[10px] font-bold text-[#AD314D] hover:underline inline-flex items-center gap-0.5 mt-0.5"
                              >
                                <span>Open in Google Maps</span>
                                <ExternalLink className="w-2.5 h-2.5" />
                              </a>
                            )}
                          </div>

                          <button
                            type="button"
                            onClick={() => {
                              onSelectGym(gymObj);
                              setIsModalOpen(false);
                            }}
                            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer ${
                              isCurrent
                                ? "bg-emerald-700 text-white shadow-2xs"
                                : "bg-[#222222] hover:bg-black text-white"
                            }`}
                          >
                            {isCurrent ? "Confirmed" : "Confirm Gym"}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Add Custom / Private Gym Accordion */}
              <div className="pt-3 border-t border-black/[0.08] dark:border-zinc-800 space-y-2">
                <div className="text-[11px] uppercase font-black tracking-wider text-neutral-600 dark:text-slate-400 flex items-center gap-1.5">
                  <Plus className="w-3.5 h-3.5 text-neutral-500" />
                  <span>Unlisted or Private Facility</span>
                </div>
                <form onSubmit={handleCreateCustomGym} className="p-3 rounded-2xl bg-neutral-50 dark:bg-zinc-800 border border-black/[0.06] space-y-2">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input
                      type="text"
                      placeholder="Custom Gym Name (e.g. Home Gym)"
                      value={customName}
                      onChange={(e) => setCustomName(e.target.value)}
                      className="px-3 py-2 rounded-xl border border-black/[0.1] text-xs font-semibold bg-white dark:bg-zinc-900 text-[#222222] dark:text-white"
                    />
                    <input
                      type="text"
                      placeholder="Location / Notes (e.g. Basement)"
                      value={customLocation}
                      onChange={(e) => setCustomLocation(e.target.value)}
                      className="px-3 py-2 rounded-xl border border-black/[0.1] text-xs font-semibold bg-white dark:bg-zinc-900 text-[#222222] dark:text-white"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={!customName.trim()}
                    className="w-full py-2 rounded-xl bg-neutral-800 hover:bg-black text-white text-xs font-bold transition-all disabled:opacity-50"
                  >
                    Add Custom Facility
                  </button>
                </form>
              </div>

            </div>

            {/* Footer */}
            <div className="p-4 bg-neutral-50 dark:bg-zinc-950 border-t border-black/[0.08] dark:border-zinc-800 flex items-center justify-between text-xs">
              <span className="text-neutral-500 font-medium">
                Powered by Google Maps Places API &amp; Grounding
              </span>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-neutral-200 dark:bg-zinc-800 font-bold text-[#222222] dark:text-white hover:bg-neutral-300"
              >
                Close
              </button>
            </div>

          </div>
        </div>
      )}
    </div>
  );
};
