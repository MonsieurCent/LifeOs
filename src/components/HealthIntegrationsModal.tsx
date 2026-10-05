import React, { useState, useEffect } from "react";
import { SyncedHealthMetrics, WeightUnit } from "../types";
import { User } from "firebase/auth";
import {
  Activity,
  Heart,
  Moon,
  Footprints,
  Flame,
  RefreshCw,
  CheckCircle2,
  X,
  AlertCircle,
  CloudCheck,
  Cloud,
  LogOut,
  ExternalLink,
  Shield,
  Clock,
  Sparkles
} from "lucide-react";

interface HealthIntegrationsModalProps {
  isOpen: boolean;
  onClose: () => void;
  healthMetrics: SyncedHealthMetrics;
  onRefreshData: () => Promise<void>;
  unit: WeightUnit;
  firebaseUser?: User | null;
  cloudSyncStatus?: string;
  onSignInWithGoogle?: () => Promise<void>;
  onSignOut?: () => Promise<void>;
}

export const HealthIntegrationsModal: React.FC<HealthIntegrationsModalProps> = ({
  isOpen,
  onClose,
  healthMetrics,
  onRefreshData,
  unit,
  firebaseUser,
  cloudSyncStatus = "Cloud Synced",
  onSignInWithGoogle,
  onSignOut
}) => {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [serverOAuthStatus, setServerOAuthStatus] = useState<{
    authenticated: boolean;
    hasRefreshToken: boolean;
    user?: { name?: string; email?: string; picture?: string } | null;
    scope?: string;
  } | null>(null);

  // Poll server OAuth status on modal open
  const checkStatus = async () => {
    try {
      const res = await fetch("/api/oauth/status");
      if (res.ok) {
        const data = await res.json();
        setServerOAuthStatus(data);
      }
    } catch {
      // Fallback gracefully
    }
  };

  useEffect(() => {
    if (isOpen) {
      checkStatus();
    }
  }, [isOpen]);

  // Listen for popup OAuth completion
  useEffect(() => {
    const handleMessage = async (event: MessageEvent) => {
      if (event.data?.type === "GOOGLE_OAUTH_SUCCESS") {
        setIsConnecting(false);
        setConnectionError(null);
        await checkStatus();
        await onRefreshData();
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [onRefreshData]);

  if (!isOpen) return null;

  const handleRefresh = async () => {
    setIsRefreshing(true);
    setConnectionError(null);
    try {
      await onRefreshData();
      await checkStatus();
    } catch (err: any) {
      setConnectionError(err.message || "Failed to refresh health data.");
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleConnect = async () => {
    setIsConnecting(true);
    setConnectionError(null);
    try {
      const res = await fetch("/api/oauth/authorize-url?provider=google");
      const data = await res.json();
      if (data.authUrl) {
        const width = 520;
        const height = 640;
        const left = Math.max(0, (window.innerWidth - width) / 2 + window.screenX);
        const top = Math.max(0, (window.innerHeight - height) / 2 + window.screenY);
        window.open(
          data.authUrl,
          "google_health_oauth_popup",
          `width=${width},height=${height},left=${left},top=${top},status=no,toolbar=no,menubar=no`
        );
      } else {
        throw new Error(data.error || "Could not generate authorization URL.");
      }
    } catch (err: any) {
      setIsConnecting(false);
      setConnectionError(err.message || "Failed to start Google Health connection.");
    }
  };

  const gh = healthMetrics.googleHealth;
  const isHealthConnected = Boolean(serverOAuthStatus?.authenticated || gh.connected);
  const syncDiag = gh.syncDiagnostics;
  const isAuthExpired = syncDiag?.syncStatus === "auth_expired" || (isHealthConnected && serverOAuthStatus?.authenticated === false);

  const lastSyncText = gh.lastSynced || "Not synced yet";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-150">
      <div
        className="w-full max-w-xl bg-white rounded-3xl shadow-xl border border-black/[0.08] p-6 space-y-6 max-h-[92vh] overflow-y-auto"
        role="dialog"
        aria-modal="true"
        aria-labelledby="health-modal-title"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-black/[0.06] pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-[#AD314D] to-[#68172C] flex items-center justify-center text-white shadow-xs">
              <Activity className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 id="health-modal-title" className="text-lg font-bold text-[#222222] tracking-tight">
                Google Health &amp; Account
              </h2>
              <p className="text-xs text-[#666666]">
                Sync wearable activity, recovery metrics, and cloud storage
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="p-2 rounded-full text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Section 1: Signed-in Account */}
        <div className="p-4 rounded-2xl bg-[#F8F9FA] border border-black/[0.06] space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-[#666666] uppercase tracking-wider">
              Signed-In Account
            </span>
            <span className="text-[11px] px-2.5 py-0.5 rounded-full font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
              {firebaseUser && !firebaseUser.isAnonymous ? "Google Account" : "Guest Mode"}
            </span>
          </div>

          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              {firebaseUser?.photoURL ? (
                <img
                  src={firebaseUser.photoURL}
                  alt={firebaseUser.displayName || "User"}
                  className="w-10 h-10 rounded-full border border-black/[0.08] object-cover shrink-0"
                />
              ) : (
                <div className="w-10 h-10 rounded-full bg-neutral-200 flex items-center justify-center text-[#4A4A4A] font-bold text-sm shrink-0">
                  {firebaseUser?.displayName?.charAt(0) || firebaseUser?.email?.charAt(0) || "U"}
                </div>
              )}
              <div className="min-w-0">
                <div className="text-xs font-bold text-[#222222] truncate">
                  {firebaseUser?.displayName || (firebaseUser && !firebaseUser.isAnonymous ? "Google User" : "Guest Athlete")}
                </div>
                <div className="text-[11px] text-[#666666] truncate">
                  {firebaseUser?.email || "Local device profile"}
                </div>
              </div>
            </div>

            {firebaseUser && !firebaseUser.isAnonymous ? (
              onSignOut && (
                <button
                  type="button"
                  onClick={onSignOut}
                  className="px-3 py-1.5 rounded-full text-[11px] font-semibold text-neutral-600 hover:text-neutral-900 bg-white hover:bg-neutral-100 border border-black/[0.08] transition-colors shrink-0"
                >
                  Sign Out
                </button>
              )
            ) : (
              onSignInWithGoogle && (
                <button
                  type="button"
                  onClick={onSignInWithGoogle}
                  className="px-3.5 py-1.5 rounded-full text-xs font-semibold text-white bg-[#AD314D] hover:bg-[#8C1E37] shadow-xs transition-colors shrink-0"
                >
                  Continue with Google
                </button>
              )
            )}
          </div>
        </div>

        {/* Section 2: Health Connection Status & Actions */}
        <div className="p-4 rounded-2xl bg-white border border-black/[0.08] space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span
                className={`w-2.5 h-2.5 rounded-full ${
                  isHealthConnected && !isAuthExpired ? "bg-emerald-500 animate-pulse" : isAuthExpired ? "bg-amber-500" : "bg-neutral-300"
                }`}
              />
              <span className="text-xs font-bold text-[#222222]">
                Google Health:{" "}
                {isHealthConnected && !isAuthExpired
                  ? "Connected"
                  : isAuthExpired
                  ? "Access Expired"
                  : "Not Connected"}
              </span>
            </div>

            {/* Last successful update */}
            <div className="flex items-center gap-1.5 text-[11px] text-[#666666]">
              <Clock className="w-3 h-3 text-neutral-400" />
              <span>{lastSyncText}</span>
            </div>
          </div>

          {/* Action buttons: Connect / Refresh / Reconnect */}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {!isHealthConnected ? (
              <button
                type="button"
                onClick={handleConnect}
                disabled={isConnecting}
                className="flex-1 py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs flex items-center justify-center gap-2 shadow-xs transition-colors disabled:opacity-50"
              >
                {isConnecting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Opening Google Consent...</span>
                  </>
                ) : (
                  <>
                    <Shield className="w-3.5 h-3.5" />
                    <span>Connect Google Health</span>
                  </>
                )}
              </button>
            ) : isAuthExpired ? (
              <button
                type="button"
                onClick={handleConnect}
                disabled={isConnecting}
                className="flex-1 py-2.5 px-4 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-semibold text-xs flex items-center justify-center gap-2 shadow-xs transition-colors disabled:opacity-50"
              >
                {isConnecting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Re-authenticating...</span>
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Reconnect Google Health</span>
                  </>
                )}
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={handleRefresh}
                  disabled={isRefreshing}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-neutral-900 hover:bg-black text-white font-semibold text-xs flex items-center justify-center gap-2 shadow-xs transition-colors disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
                  <span>{isRefreshing ? "Syncing..." : "Refresh Health Data"}</span>
                </button>
                <button
                  type="button"
                  onClick={handleConnect}
                  disabled={isConnecting}
                  title="Re-open consent if permissions need updating"
                  className="py-2.5 px-3 rounded-xl bg-neutral-100 hover:bg-neutral-200 text-[#222222] font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors"
                >
                  <RefreshCw className="w-3 h-3 text-neutral-500" />
                  <span>Reconnect</span>
                </button>
              </>
            )}
          </div>

          {connectionError && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div>{connectionError}</div>
            </div>
          )}

          {isAuthExpired && (
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
              <div>
                Your Google Health access has expired. Click <strong>Reconnect Google Health</strong> to approve access.
              </div>
            </div>
          )}
        </div>

        {/* Section 3: Cloud Save Status (Separate from health data) */}
        <div className="p-4 rounded-2xl bg-[#F8F9FA] border border-black/[0.06] flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            {cloudSyncStatus.includes("Saved") || cloudSyncStatus.includes("Synced") ? (
              <CloudCheck className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <Cloud className="w-4 h-4 text-amber-600 shrink-0" />
            )}
            <div>
              <div className="text-xs font-bold text-[#222222]">
                Cloud Save: {cloudSyncStatus}
              </div>
              <div className="text-[11px] text-[#666666]">
                Workouts and body composition are saved to your account independently of health sync.
              </div>
            </div>
          </div>
        </div>

        {/* Section 4: Current Health Telemetry & Status of Categories */}
        <div className="space-y-2">
          <h3 className="text-xs font-bold text-[#222222] uppercase tracking-wider">
            Health Data Categories
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
            {/* Steps & Activity */}
            <div className="p-3 rounded-xl bg-white border border-black/[0.06] space-y-1">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 font-semibold text-[#222222]">
                  <Footprints className="w-3.5 h-3.5 text-[#AD314D]" />
                  <span>Daily Steps</span>
                </div>
                <span className="font-bold text-[#222222]">
                  {gh.dailySteps ? gh.dailySteps.toLocaleString() : "—"}
                </span>
              </div>
              <p className="text-[11px] text-[#666666]">
                {gh.dailySteps
                  ? `${gh.dailySteps.toLocaleString()} steps recorded today`
                  : isHealthConnected
                  ? "No steps recorded for today yet on your connected device."
                  : "Connect Google Health to sync steps from your watch or phone."}
              </p>
            </div>

            {/* Resting Heart Rate */}
            <div className="p-3 rounded-xl bg-white border border-black/[0.06] space-y-1">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 font-semibold text-[#222222]">
                  <Heart className="w-3.5 h-3.5 text-rose-500" />
                  <span>Resting Heart Rate</span>
                </div>
                <span className="font-bold text-[#222222]">
                  {gh.restingHeartRate ? `${gh.restingHeartRate} bpm` : "—"}
                </span>
              </div>
              <p className="text-[11px] text-[#666666]">
                {gh.restingHeartRate
                  ? `Resting heart rate: ${gh.restingHeartRate} bpm`
                  : isHealthConnected
                  ? "No heart rate telemetry reported for today."
                  : "Requires health metrics permission."}
              </p>
            </div>

            {/* Sleep Architecture */}
            <div className="p-3 rounded-xl bg-white border border-black/[0.06] space-y-1">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 font-semibold text-[#222222]">
                  <Moon className="w-3.5 h-3.5 text-indigo-500" />
                  <span>Sleep Duration</span>
                </div>
                <span className="font-bold text-[#222222]">
                  {gh.sleepHours ? `${gh.sleepHours}h` : "—"}
                </span>
              </div>
              <p className="text-[11px] text-[#666666]">
                {gh.sleepHours
                  ? `${gh.sleepHours}h sleep (Score: ${gh.sleepScore || "—"})`
                  : isHealthConnected
                  ? "No sleep session recorded last night."
                  : "Requires Google Health sleep scope."}
              </p>
            </div>

            {/* Active Energy */}
            <div className="p-3 rounded-xl bg-white border border-black/[0.06] space-y-1">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 font-semibold text-[#222222]">
                  <Flame className="w-3.5 h-3.5 text-amber-500" />
                  <span>Active Calories</span>
                </div>
                <span className="font-bold text-[#222222]">
                  {gh.activeCalories ? `${gh.activeCalories} kcal` : "—"}
                </span>
              </div>
              <p className="text-[11px] text-[#666666]">
                {gh.activeCalories
                  ? `${gh.activeCalories} kcal active energy burned`
                  : isHealthConnected
                  ? "No discrete active energy records for today."
                  : "Requires activity permission."}
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="pt-2 border-t border-black/[0.06] flex items-center justify-between text-xs">
          <span className="text-[#666666] text-[11px]">
            Saved workouts &amp; measurements are always available offline.
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-full border border-black/[0.1] hover:bg-neutral-100 font-semibold text-[#222222] transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
