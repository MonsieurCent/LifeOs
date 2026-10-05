import React, { useState } from "react";
import { 
  MapPin, 
  CheckCircle2, 
  AlertTriangle, 
  RefreshCw, 
  Building2, 
  Navigation, 
  ExternalLink,
  Sparkles,
  XCircle,
  ChevronRight,
  ShieldCheck
} from "lucide-react";
import { Gym, WorkoutSession } from "../types";
import { 
  detectCurrentGym, 
  getCurrentPosition, 
  NearbyGymResult, 
  convertResultToGym 
} from "../utils/googleMapsService";

interface GymCheckInWidgetProps {
  currentGymId?: string;
  currentGymName?: string;
  gyms: Gym[];
  activeWorkout?: WorkoutSession | null;
  onCheckInSuccess: (checkInData: {
    gym: Gym;
    checkInTime: string;
    checkInLocation?: { lat: number; lng: number };
    distanceKm?: number;
  }) => void;
  onUpdateGym: (gym: Gym) => void;
  isDarkMode?: boolean;
}

export const GymCheckInWidget: React.FC<GymCheckInWidgetProps> = ({
  currentGymId,
  currentGymName,
  gyms,
  activeWorkout,
  onCheckInSuccess,
  onUpdateGym,
  isDarkMode = false
}) => {
  const [isCheckingIn, setIsCheckingIn] = useState(false);
  const [detectedGym, setDetectedGym] = useState<NearbyGymResult | null>(null);
  const [mismatchPrompt, setMismatchPrompt] = useState<{
    selectedGymName: string;
    detectedGym: NearbyGymResult;
  } | null>(null);
  const [checkInError, setCheckInError] = useState<string | null>(null);
  const [gpsCoords, setGpsCoords] = useState<{ lat: number; lng: number } | null>(null);

  const selectedGym = gyms.find((g) => g.id === currentGymId) ||
    (currentGymName ? { id: "temp", name: currentGymName, location: "" } : null);

  const isAlreadyCheckedIn = activeWorkout?.isCheckedIn || false;

  const handlePerformCheckIn = async () => {
    setIsCheckingIn(true);
    setCheckInError(null);
    setMismatchPrompt(null);

    try {
      // 1. Capture exact GPS coordinates via Browser Geolocation API
      const coords = await getCurrentPosition();
      setGpsCoords(coords);

      // 2. Call backend location detection service
      const res = await detectCurrentGym(coords);
      const recognized = res.recognizedGym;

      if (!recognized) {
        // No gym detected nearby
        setCheckInError("No gym facility detected within range of your GPS location. Please select your gym manually.");
        setIsCheckingIn(false);
        return;
      }

      setDetectedGym(recognized);

      // 3. Compare detected gym with selected gym name
      const targetSelectedName = (selectedGym?.name || currentGymName || "").trim().toLowerCase();
      const detectedName = recognized.name.trim().toLowerCase();

      const namesMatch = targetSelectedName && (
        detectedName.includes(targetSelectedName) ||
        targetSelectedName.includes(detectedName) ||
        recognized.distanceKm <= 0.2 // within 200m
      );

      if (!selectedGym?.name || namesMatch) {
        // Match confirmed or no gym selected yet -> Auto Check In!
        const matchedGymEntity = convertResultToGym(recognized);
        const nowFormatted = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        
        onUpdateGym(matchedGymEntity);
        onCheckInSuccess({
          gym: matchedGymEntity,
          checkInTime: nowFormatted,
          checkInLocation: coords,
          distanceKm: recognized.distanceKm
        });
      } else {
        // Mismatch identified! Prompt user to confirm or switch
        setMismatchPrompt({
          selectedGymName: selectedGym.name,
          detectedGym: recognized
        });
      }
    } catch (err: any) {
      console.error("Check-in error:", err);
      setCheckInError(err?.message || "Failed to capture GPS location. Please check browser permissions.");
    } finally {
      setIsCheckingIn(false);
    }
  };

  const handleAcceptSwitchGym = () => {
    if (!mismatchPrompt) return;
    const switched = convertResultToGym(mismatchPrompt.detectedGym);
    const nowFormatted = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    onUpdateGym(switched);
    onCheckInSuccess({
      gym: switched,
      checkInTime: nowFormatted,
      checkInLocation: gpsCoords || undefined,
      distanceKm: mismatchPrompt.detectedGym.distanceKm
    });
    setMismatchPrompt(null);
  };

  const handleForceKeepSelectedGym = () => {
    if (!mismatchPrompt) return;
    const fallbackGym: Gym = selectedGym
      ? { ...selectedGym }
      : {
          id: `gym-${Date.now()}`,
          name: mismatchPrompt.selectedGymName,
          location: "Manual Location",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };

    const nowFormatted = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    onCheckInSuccess({
      gym: fallbackGym,
      checkInTime: nowFormatted,
      checkInLocation: gpsCoords || undefined,
      distanceKm: mismatchPrompt.detectedGym.distanceKm
    });
    setMismatchPrompt(null);
  };

  return (
    <div className={`p-4 rounded-3xl border transition-all ${
      isDarkMode
        ? "bg-zinc-900 border-zinc-800 text-slate-100"
        : "bg-white border-black/[0.08] shadow-xs"
    }`}>
      
      {/* State 1: Already Checked-In Badge */}
      {isAlreadyCheckedIn ? (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0 shadow-2xs">
              <CheckCircle2 className="w-6 h-6 text-emerald-600" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-900 border border-emerald-200">
                  Checked-In
                </span>
                {activeWorkout?.checkInTime && (
                  <span className="text-xs font-bold text-neutral-600 dark:text-slate-400">
                    At {activeWorkout.checkInTime}
                  </span>
                )}
              </div>
              <h4 className="text-sm font-extrabold text-[#222222] dark:text-white mt-0.5 flex items-center gap-1.5">
                <span>{activeWorkout?.checkInGymName || selectedGym?.name || "Training Facility"}</span>
                {activeWorkout?.checkInDistanceKm !== undefined && (
                  <span className="text-xs font-bold text-emerald-700">
                    ({activeWorkout.checkInDistanceKm < 1 
                      ? `${Math.round(activeWorkout.checkInDistanceKm * 1000)}m` 
                      : `${activeWorkout.checkInDistanceKm.toFixed(1)}km`} away)
                  </span>
                )}
              </h4>
              {activeWorkout?.checkInAddress && (
                <p className="text-xs text-neutral-600 dark:text-slate-400 truncate max-w-md">
                  {activeWorkout.checkInAddress}
                </p>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={handlePerformCheckIn}
            disabled={isCheckingIn}
            className="px-3.5 py-2 rounded-2xl bg-neutral-100 hover:bg-neutral-200 dark:bg-zinc-800 text-[#222222] dark:text-white text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-emerald-600 ${isCheckingIn ? "animate-spin" : ""}`} />
            <span>Re-Check Location</span>
          </button>
        </div>
      ) : (
        /* State 2: Check-In Trigger Button & Workflow */
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-[#AD314D] to-[#68172C] text-white flex items-center justify-center shrink-0 shadow-md">
                <MapPin className="w-5 h-5 text-white animate-pulse" />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] uppercase font-black tracking-wider text-neutral-600 dark:text-slate-400">
                    GPS Gym Check-In
                  </span>
                  <span className="text-[9px] font-extrabold px-1.5 py-0.2 rounded bg-amber-100 text-amber-900 border border-amber-200">
                    Browser Geolocation
                  </span>
                </div>
                <h4 className="text-sm font-extrabold text-[#222222] dark:text-white">
                  {selectedGym?.name ? `Training at ${selectedGym.name}` : "Check in to record workout facility"}
                </h4>
                <p className="text-xs text-neutral-600 dark:text-slate-400">
                  Verifies your location via Google Maps to auto-match equipment and log session entry.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={handlePerformCheckIn}
              disabled={isCheckingIn}
              className="px-5 py-2.5 rounded-2xl bg-gradient-to-r from-[#AD314D] to-[#8C1E37] hover:brightness-110 active:scale-95 text-white text-xs font-extrabold shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 shrink-0"
            >
              {isCheckingIn ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin text-white" />
                  <span>Acquiring GPS...</span>
                </>
              ) : (
                <>
                  <Navigation className="w-4 h-4 text-white" />
                  <span>📍 Check In Now</span>
                </>
              )}
            </button>
          </div>

          {/* Error notice */}
          {checkInError && (
            <div className="p-3 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-medium flex items-center gap-2 animate-in fade-in">
              <XCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{checkInError}</span>
            </div>
          )}

          {/* State 3: MISMATCH PROMPT MODAL / ALERT */}
          {mismatchPrompt && (
            <div className="p-4 rounded-2xl bg-amber-50 border border-amber-300 text-amber-900 space-y-3 animate-in fade-in slide-in-from-top-2">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <h5 className="text-xs font-black uppercase tracking-wider text-amber-900">
                    Location Mismatch Detected
                  </h5>
                  <p className="text-xs mt-0.5 text-amber-900/90">
                    Your workout is assigned to <strong className="font-extrabold">&quot;{mismatchPrompt.selectedGymName}&quot;</strong>, but GPS places you at <strong className="font-extrabold">&quot;{mismatchPrompt.detectedGym.name}&quot;</strong> ({mismatchPrompt.detectedGym.distanceKm < 1 ? `${Math.round(mismatchPrompt.detectedGym.distanceKm * 1000)}m` : `${mismatchPrompt.detectedGym.distanceKm.toFixed(1)}km`} away).
                  </p>
                  <p className="text-[11px] text-amber-800 mt-0.5 italic">
                    Address: {mismatchPrompt.detectedGym.address}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-amber-200/80">
                <button
                  type="button"
                  onClick={handleAcceptSwitchGym}
                  className="px-3.5 py-1.5 rounded-xl bg-amber-800 hover:bg-amber-900 text-white text-xs font-bold shadow-2xs transition-all cursor-pointer flex items-center gap-1"
                >
                  <CheckCircle2 className="w-3.5 h-3.5 text-amber-300" />
                  <span>Switch to &quot;{mismatchPrompt.detectedGym.name}&quot; &amp; Check In</span>
                </button>
                <button
                  type="button"
                  onClick={handleForceKeepSelectedGym}
                  className="px-3.5 py-1.5 rounded-xl bg-white hover:bg-amber-100 text-amber-900 border border-amber-300 text-xs font-bold transition-all cursor-pointer"
                >
                  Keep &quot;{mismatchPrompt.selectedGymName}&quot; Anyway
                </button>
              </div>
            </div>
          )}

        </div>
      )}

    </div>
  );
};
