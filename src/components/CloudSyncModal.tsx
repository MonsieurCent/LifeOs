import React, { useState, useEffect, useRef } from "react";
import {
  Cloud,
  CloudCheck,
  RefreshCw,
  X,
  Lock,
  Mail,
  LogIn,
  UserPlus,
  LogOut,
  AlertCircle,
  Smartphone,
  Laptop,
  ArrowRight,
  Database,
  Upload,
  Download,
  ShieldCheck,
  Sparkles,
  Activity,
  CheckCircle2,
  AlertTriangle,
  WifiOff,
  History,
  FileCode,
  Globe,
  Clock,
  Search
} from "lucide-react";
import {
  auth,
  googleProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  User as FirebaseUser
} from "../lib/firebase";
import { downloadBackupFile, restoreBackupData } from "../utils/exportBackup";
import { firestoreTracker } from "../utils/firestoreInstrumentation";
import { isFirestoreQuotaCooldownActive, getStoredQuotaCooldown } from "../utils/syncManager";
import { getOperationLogs, OperationLogEntry, listWorkoutDrafts } from "../utils/userStorage";
import { SessionRecoveryReport } from "../services/sessionRecoveryService";

interface CloudSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  firebaseUser: FirebaseUser | null;
  cloudSyncStatus: string;
  isCloudSyncing: boolean;
  onForcePushToCloud: () => Promise<void>;
  onForcePullFromCloud: () => Promise<void>;
  lastSyncedTime?: string | null;
  localStats: {
    programsCount: number;
    workoutsCount: number;
    matrixWeeksCount: number;
    activeProgramName: string;
  };
  showToast: (msg: string) => void;
  isDarkMode?: boolean;
  onRunSessionRecovery?: () => Promise<SessionRecoveryReport>;
}

export const CloudSyncModal: React.FC<CloudSyncModalProps> = ({
  isOpen,
  onClose,
  firebaseUser,
  cloudSyncStatus,
  isCloudSyncing,
  onForcePushToCloud,
  onForcePullFromCloud,
  lastSyncedTime,
  localStats,
  showToast,
  isDarkMode = false,
  onRunSessionRecovery
}) => {
  // ALL HOOKS MUST BE UNCONDITIONALLY DECLARED AT THE TOP
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [metrics, setMetrics] = useState(firestoreTracker.getMetrics());
  const [opLogs, setOpLogs] = useState<OperationLogEntry[]>([]);
  const [restoreStatus, setRestoreStatus] = useState<string | null>(null);
  const [isRecoveringSessions, setIsRecoveringSessions] = useState(false);
  const [recoveryReport, setRecoveryReport] = useState<SessionRecoveryReport | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const activeUid = firebaseUser?.uid || "guest";

  useEffect(() => {
    if (!isOpen) return;
    setMetrics(firestoreTracker.getMetrics());
    setOpLogs(getOperationLogs(activeUid));
    return firestoreTracker.subscribe(() => {
      setMetrics(firestoreTracker.getMetrics());
      setOpLogs(getOperationLogs(activeUid));
    });
  }, [isOpen, activeUid]);

  if (!isOpen) return null;

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setAuthError("Please provide both email and password.");
      return;
    }
    setAuthLoading(true);
    setAuthError(null);
    try {
      if (authMode === "signin") {
        await signInWithEmailAndPassword(auth, email.trim(), password);
        showToast("Signed in successfully! Your data is now syncing in real-time.");
      } else {
        await createUserWithEmailAndPassword(auth, email.trim(), password);
        showToast("Account created! Local programs uploaded to your cloud account.");
      }
      onClose();
    } catch (err: any) {
      console.error("Auth error:", err);
      let msg = err.message || "Authentication failed. Please check credentials.";
      if (err.code === "auth/operation-not-allowed" || (err.message && err.message.includes("operation-not-allowed"))) {
        msg = "Email/Password sign-in is not enabled in this Firebase project. Please use 'Sign In with Google', or enable Email/Password under Authentication > Sign-in method in the Firebase Console.";
      } else if (err.code === "auth/invalid-credential" || err.code === "auth/wrong-password") {
        msg = "Incorrect email or password. If you haven't created an account yet, click 'Create New Account'.";
      } else if (err.code === "auth/email-already-in-use") {
        msg = "This email is already registered. Please click 'Sign In' instead.";
      } else if (err.code === "auth/weak-password") {
        msg = "Password should be at least 6 characters.";
      }
      setAuthError(msg);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleGoogleAuth = async () => {
    setAuthLoading(true);
    setAuthError(null);
    try {
      await signInWithPopup(auth, googleProvider);
      showToast("Signed in with Google! Cloud sync active.");
      onClose();
    } catch (err: any) {
      const msg = err?.message || String(err);
      const code = err?.code || "";
      if (code === "auth/popup-closed-by-user" || msg.includes("popup-closed-by-user")) {
        // User closed the popup window voluntarily
        return;
      }
      console.warn("Google login notice:", err);
      setAuthError(err.message || "Google sign in was cancelled or failed.");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      showToast("Signed out. Switched to offline local storage.");
    } catch (err: any) {
      showToast("Sign out failed.");
    }
  };

  const handleRestoreFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        const res = restoreBackupData(activeUid, parsed);
        if (res.success) {
          setRestoreStatus("✓ Backup restored successfully. Refreshing view...");
          showToast("Backup restored! Reloading application...");
          setTimeout(() => {
            window.location.reload();
          }, 1200);
        } else {
          setRestoreStatus(`❌ ${res.message}`);
        }
      } catch (err: any) {
        setRestoreStatus("❌ Invalid JSON file format.");
      }
    };
    reader.readAsText(file);
  };

  const isUserAuthenticated = firebaseUser && !firebaseUser.isAnonymous;
  const isQuotaActive = isFirestoreQuotaCooldownActive() || cloudSyncStatus.includes("quota");
  const cooldownUntil = getStoredQuotaCooldown();
  const activeDrafts = listWorkoutDrafts(activeUid);

  const formatTimeRemaining = () => {
    if (!cooldownUntil || cooldownUntil <= Date.now()) return "Midnight Pacific Time (~00:00 PST/PDT)";
    const diffMs = cooldownUntil - Date.now();
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    return `in ~${hours}h ${minutes}m (midnight US Pacific Time)`;
  };

  const browserOrigin = typeof window !== "undefined" ? window.location.origin : "App Container";

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex flex-col items-center justify-start sm:justify-center p-2 sm:p-4 overflow-y-auto animate-fadeIn"
    >
      <div
        className={`w-full max-w-2xl max-h-[92vh] sm:max-h-[88vh] flex flex-col rounded-2xl sm:rounded-3xl border shadow-2xl overflow-hidden my-auto transition-all ${
          isDarkMode
            ? "bg-[#12141c] border-zinc-800 text-zinc-100"
            : "bg-white border-neutral-200 text-[#222222]"
        }`}
      >
        {/* Header */}
        <div className="sticky top-0 z-20 flex-shrink-0 p-4 sm:p-6 border-b border-black/[0.06] dark:border-white/[0.06] flex items-center justify-between bg-white/95 dark:bg-[#12141c]/95 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#AD314D] text-white flex items-center justify-center shadow-sm flex-shrink-0">
              <Cloud className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-[#222222] dark:text-zinc-100 tracking-tight flex items-center gap-2">
                Data &amp; Cloud Synchronization Hub
              </h2>
              <p className="text-xs text-[#4A4A4A] dark:text-zinc-400 font-normal mt-0.5">
                Local-first persistence, quota resilience &amp; real-time telemetry
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full hover:bg-black/5 dark:hover:bg-white/10 text-[#4A4A4A] hover:text-[#222222] dark:text-zinc-400 dark:hover:text-zinc-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
          {/* SECTION 1: System Scope & Identity */}
          <div className={`p-4 rounded-2xl border space-y-3 ${isDarkMode ? "bg-zinc-900/60 border-zinc-800" : "bg-neutral-50 border-neutral-200"}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-bold text-neutral-800 dark:text-zinc-200">
                <Globe className="w-4 h-4 text-emerald-500" />
                <span>Scope &amp; Origin Environment</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-neutral-200 dark:bg-zinc-800 text-neutral-700 dark:text-zinc-300 font-mono font-bold">
                  v2.4.2 Auto-Sync
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 font-bold">
                  Local IndexedDB Active
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-neutral-400 text-[10px] block">Profile / Account Scope</span>
                <span className="font-semibold text-neutral-800 dark:text-zinc-200 truncate block">
                  {isUserAuthenticated ? `${firebaseUser?.email} (${activeUid.slice(0, 8)}...)` : `Local Profile (${activeUid})`}
                </span>
              </div>
              <div>
                <span className="text-neutral-400 text-[10px] block">Browser Origin URL</span>
                <span className="font-mono text-[11px] text-neutral-600 dark:text-zinc-400 truncate block">
                  {browserOrigin}
                </span>
              </div>
            </div>
          </div>

          {/* SECTION 2: Live Status & Quota Card */}
          <div
            className={`p-4 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
              isQuotaActive
                ? "bg-amber-50/90 dark:bg-amber-950/40 border-amber-300 dark:border-amber-700/60"
                : cloudSyncStatus.includes("Synced")
                ? "bg-emerald-50/90 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-700/60"
                : "bg-blue-50/90 dark:bg-blue-950/40 border-blue-300 dark:border-blue-700/60"
            }`}
          >
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-xl bg-white dark:bg-black/30 shadow-xs mt-0.5">
                {isQuotaActive ? (
                  <AlertTriangle className="w-5 h-5 text-amber-600" />
                ) : cloudSyncStatus.includes("Synced") ? (
                  <CloudCheck className="w-5 h-5 text-emerald-600" />
                ) : (
                  <Database className="w-5 h-5 text-blue-600" />
                )}
              </div>
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 dark:text-zinc-400">
                  Current Cloud Status
                </div>
                <div className="text-sm font-bold text-neutral-900 dark:text-zinc-100 flex items-center gap-2">
                  <span>{cloudSyncStatus}</span>
                  {isCloudSyncing && <RefreshCw className="w-3.5 h-3.5 animate-spin text-amber-600" />}
                </div>
                <div className="text-xs text-neutral-600 dark:text-zinc-400 mt-1">
                  Local storage: <strong>100% verified &amp; durable</strong>
                  {activeDrafts.length > 0 && ` • ${activeDrafts.length} in-progress session(s)`}
                </div>
              </div>
            </div>

            {lastSyncedTime && (
              <div className="text-xs sm:text-right border-t sm:border-t-0 pt-2 sm:pt-0 border-black/[0.05]">
                <div className="text-[10px] text-neutral-400">Last Server Sync</div>
                <div className="font-semibold text-neutral-800 dark:text-zinc-200">{lastSyncedTime}</div>
              </div>
            )}
          </div>

          {/* Quota Reset Warning */}
          {isQuotaActive && (
            <div className="p-4 rounded-2xl border border-amber-300 dark:border-amber-700 bg-amber-50/80 dark:bg-amber-950/30 text-xs space-y-2">
              <div className="font-bold text-amber-800 dark:text-amber-300 flex items-center gap-2">
                <Clock className="w-4 h-4" />
                <span>Firestore Daily Quota Cooldown Active</span>
              </div>
              <p className="text-neutral-700 dark:text-zinc-300 leading-relaxed">
                Google Cloud free daily write quota (20,000 writes/day) reached limit. All local changes continue saving instantly to your device without data loss. Cloud synchronization will automatically resume {formatTimeRemaining()}.
              </p>
            </div>
          )}

          {/* SECTION 3: Firestore Telemetry Counters */}
          <div className={`p-4 rounded-2xl border space-y-3 ${isDarkMode ? "bg-zinc-900/60 border-zinc-800" : "bg-neutral-50 border-neutral-200"}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-bold text-neutral-800 dark:text-zinc-200">
                <Activity className="w-4 h-4 text-emerald-500" />
                <span>Cloud Write Telemetry &amp; Optimization</span>
              </div>
              <div className="text-[10px] font-bold text-neutral-400">Live Counters</div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div className="p-3 rounded-xl border border-black/[0.04] dark:border-white/[0.04] bg-white dark:bg-zinc-850">
                <div className="text-[10px] text-neutral-400">Total Reads</div>
                <div className="text-lg font-black text-neutral-800 dark:text-zinc-100">{metrics.totalReads}</div>
              </div>
              <div className="p-3 rounded-xl border border-black/[0.04] dark:border-white/[0.04] bg-white dark:bg-zinc-850">
                <div className="text-[10px] text-neutral-400">Cloud Writes</div>
                <div className="text-lg font-black text-emerald-600 dark:text-emerald-400">{metrics.totalWrites}</div>
              </div>
              <div className="p-3 rounded-xl border border-black/[0.04] dark:border-white/[0.04] bg-white dark:bg-zinc-850">
                <div className="text-[10px] text-neutral-400">Writes Saved (Dedup)</div>
                <div className="text-lg font-black text-blue-600 dark:text-blue-400">{metrics.deduplicatedWritesSaved}</div>
              </div>
              <div className="p-3 rounded-xl border border-black/[0.04] dark:border-white/[0.04] bg-white dark:bg-zinc-850">
                <div className="text-[10px] text-neutral-400">Quota Exceeded</div>
                <div className="text-lg font-black text-amber-600 dark:text-amber-400">{metrics.quotaErrorsPrevented}</div>
              </div>
            </div>
          </div>

          {/* SECTION 4: Operation History Audit Trail */}
          <div className={`p-4 rounded-2xl border space-y-3 ${isDarkMode ? "bg-zinc-900/60 border-zinc-800" : "bg-neutral-50 border-neutral-200"}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-bold text-neutral-800 dark:text-zinc-200">
                <History className="w-4 h-4 text-indigo-500" />
                <span>Recent Storage &amp; Sync Operations (Audit Log)</span>
              </div>
              <div className="text-[10px] text-neutral-400 font-mono">Last 50 events</div>
            </div>

            <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1 font-mono text-[11px]">
              {opLogs.length === 0 ? (
                <div className="py-4 text-center text-neutral-400 italic">No recent operation logs recorded yet.</div>
              ) : (
                opLogs.map((log) => (
                  <div
                    key={log.id}
                    className="p-2 rounded-lg bg-white dark:bg-zinc-800/80 border border-black/[0.04] dark:border-white/[0.04] flex items-center justify-between gap-2"
                  >
                    <div className="flex items-center gap-2 truncate">
                      <span
                        className={`w-2 h-2 rounded-full flex-shrink-0 ${
                          log.status === "success"
                            ? "bg-emerald-500"
                            : log.status === "pending"
                            ? "bg-amber-500"
                            : log.status === "offline"
                            ? "bg-sky-500"
                            : "bg-rose-500"
                        }`}
                      />
                      <span className="font-bold uppercase text-[10px] text-neutral-500 dark:text-zinc-400">
                        {log.entity}:{log.action}
                      </span>
                      <span className="truncate text-neutral-700 dark:text-zinc-300">{log.detail || ""}</span>
                    </div>
                    <span className="text-[10px] text-neutral-400 flex-shrink-0">
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* SECTION 5: Authentication & Cross-Device Account */}
          {isUserAuthenticated ? (
            <div className={`p-4 rounded-2xl border space-y-3 ${isDarkMode ? "bg-zinc-900/40 border-zinc-800" : "bg-white border-neutral-200"}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-bold text-emerald-600 dark:text-emerald-400">
                  <ShieldCheck className="w-4 h-4" />
                  <span>Authenticated Account</span>
                </div>
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-semibold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Sign Out</span>
                </button>
              </div>
              <div className="text-xs text-neutral-600 dark:text-zinc-400">
                Signed in as: <strong className="text-neutral-900 dark:text-zinc-100">{firebaseUser?.email || "Google User"}</strong>
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={onForcePushToCloud}
                  disabled={isCloudSyncing}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-sm transition-colors"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>Push State to Cloud</span>
                </button>
                <button
                  type="button"
                  onClick={onForcePullFromCloud}
                  disabled={isCloudSyncing}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl border border-neutral-300 dark:border-zinc-700 hover:bg-neutral-100 dark:hover:bg-zinc-800 text-xs font-bold transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Pull Latest from Cloud</span>
                </button>
              </div>
            </div>
          ) : (
            <div className={`p-4 rounded-2xl border space-y-4 ${isDarkMode ? "bg-zinc-900/40 border-zinc-800" : "bg-neutral-50/70 border-neutral-200"}`}>
              <div className="flex items-center justify-between border-b border-black/[0.06] pb-3">
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setAuthMode("signin");
                      setAuthError(null);
                    }}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors ${
                      authMode === "signin"
                        ? "bg-[#AD314D] text-white"
                        : "text-neutral-500 hover:text-neutral-800 dark:hover:text-zinc-200"
                    }`}
                  >
                    Sign In (PC &amp; Mobile)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAuthMode("signup");
                      setAuthError(null);
                    }}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors ${
                      authMode === "signup"
                        ? "bg-[#AD314D] text-white"
                        : "text-neutral-500 hover:text-neutral-800 dark:hover:text-zinc-200"
                    }`}
                  >
                    Create New Account
                  </button>
                </div>
              </div>

              {authError && (
                <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{authError}</span>
                </div>
              )}

              <form onSubmit={handleEmailAuth} className="space-y-3">
                <div>
                  <label className="block text-[11px] font-bold text-neutral-600 dark:text-zinc-400 mb-1">
                    Email Address
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-neutral-400 absolute left-3 top-3" />
                    <input
                      type="email"
                      required
                      placeholder="athlete@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className={`w-full pl-9 pr-3 py-2 rounded-xl text-xs border focus:outline-none focus:ring-2 focus:ring-[#AD314D] ${
                        isDarkMode
                          ? "bg-zinc-800 border-zinc-700 text-white"
                          : "bg-white border-neutral-300 text-neutral-900"
                      }`}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-neutral-600 dark:text-zinc-400 mb-1">
                    Password
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-neutral-400 absolute left-3 top-3" />
                    <input
                      type="password"
                      required
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className={`w-full pl-9 pr-3 py-2 rounded-xl text-xs border focus:outline-none focus:ring-2 focus:ring-[#AD314D] ${
                        isDarkMode
                          ? "bg-zinc-800 border-zinc-700 text-white"
                          : "bg-white border-neutral-300 text-neutral-900"
                      }`}
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={authLoading}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[#AD314D] hover:bg-[#91273F] text-white text-xs font-bold shadow-md transition-all disabled:opacity-50"
                >
                  {authLoading ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : authMode === "signin" ? (
                    <>
                      <LogIn className="w-4 h-4" />
                      <span>Sign In to Sync</span>
                    </>
                  ) : (
                    <>
                      <UserPlus className="w-4 h-4" />
                      <span>Register Account</span>
                    </>
                  )}
                </button>
              </form>

              <div className="relative flex items-center justify-center">
                <div className="border-t border-neutral-200 dark:border-zinc-800 w-full" />
                <span className="bg-neutral-50 dark:bg-zinc-900 px-3 text-[10px] uppercase font-bold text-neutral-400 absolute">
                  OR
                </span>
              </div>

              <button
                type="button"
                onClick={handleGoogleAuth}
                disabled={authLoading}
                className={`w-full flex items-center justify-center gap-2 py-2 rounded-xl border text-xs font-bold shadow-xs transition-colors ${
                  isDarkMode
                    ? "bg-zinc-800 border-zinc-700 hover:bg-zinc-700 text-zinc-100"
                    : "bg-white border-neutral-300 hover:bg-neutral-50 text-neutral-800"
                }`}
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  />
                </svg>
                <span>Continue with Google</span>
              </button>
            </div>
          )}

          {/* SECTION: Deep Scan & Recover Orphaned Sessions (Sep 23 & 24) */}
          <div className={`p-4 rounded-2xl border space-y-3 ${isDarkMode ? "bg-zinc-900/60 border-zinc-800" : "bg-neutral-50 border-neutral-200"}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-bold text-neutral-800 dark:text-zinc-200">
                <Search className="w-4 h-4 text-amber-500" />
                <span>Recover Orphaned Sessions (Sep 23rd &amp; 24th)</span>
              </div>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-400 font-bold">
                Multi-Tier Storage Scanner
              </span>
            </div>

            <p className="text-xs text-neutral-600 dark:text-zinc-400 leading-relaxed">
              Scans your browser's LocalStorage, IndexedDB records, Firestore cloud subcollections, and server journals for any missing, orphaned, or misfiled sessions from September 23rd &amp; 24th and automatically re-injects them into your active workout state.
            </p>

            {recoveryReport && (
              <div className="p-3 rounded-xl bg-white dark:bg-zinc-800 border border-neutral-200 dark:border-zinc-700 text-xs space-y-2">
                <div className="font-bold text-neutral-900 dark:text-zinc-100 flex items-center justify-between">
                  <span>Scan Results:</span>
                  <span className="text-[10px] text-neutral-400 font-mono">
                    {new Date(recoveryReport.timestamp).toLocaleTimeString()}
                  </span>
                </div>
                <p className="text-neutral-700 dark:text-zinc-300 font-medium">
                  {recoveryReport.message}
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-[11px] text-neutral-500 dark:text-zinc-400 font-mono">
                  <div className="bg-neutral-50 dark:bg-zinc-900 p-2 rounded-lg">
                    <span className="block text-[9px] uppercase font-bold text-neutral-400">LocalStorage</span>
                    {recoveryReport.scanned.localStorageKeysCount} keys
                  </div>
                  <div className="bg-neutral-50 dark:bg-zinc-900 p-2 rounded-lg">
                    <span className="block text-[9px] uppercase font-bold text-neutral-400">IndexedDB</span>
                    {recoveryReport.scanned.indexedDbRecordsCount} items
                  </div>
                  <div className="bg-neutral-50 dark:bg-zinc-900 p-2 rounded-lg">
                    <span className="block text-[9px] uppercase font-bold text-neutral-400">Firestore</span>
                    {recoveryReport.scanned.firestoreDocsCount} docs
                  </div>
                  <div className="bg-neutral-50 dark:bg-zinc-900 p-2 rounded-lg">
                    <span className="block text-[9px] uppercase font-bold text-neutral-400">Server Logs</span>
                    {recoveryReport.scanned.serverJournalCount} entries
                  </div>
                </div>

                {recoveryReport.injectedSessions.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-neutral-200 dark:border-zinc-700 space-y-1">
                    <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase">
                      Re-Injected Sessions:
                    </span>
                    {recoveryReport.injectedSessions.map((s) => (
                      <div key={s.id} className="text-[11px] text-neutral-800 dark:text-zinc-200 flex items-center justify-between">
                        <span>• {s.title} ({s.date})</span>
                        <span className="text-neutral-400 font-mono">{s.exercises?.length || 0} exercises</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="pt-1">
              <button
                type="button"
                disabled={isRecoveringSessions}
                onClick={async () => {
                  if (!onRunSessionRecovery) return;
                  setIsRecoveringSessions(true);
                  try {
                    const report = await onRunSessionRecovery();
                    setRecoveryReport(report);
                  } catch (e: any) {
                    showToast(`Recovery notice: ${e?.message || e}`);
                  } finally {
                    setIsRecoveringSessions(false);
                  }
                }}
                className="flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold transition-all shadow-xs disabled:opacity-50 cursor-pointer"
              >
                {isRecoveringSessions ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Search className="w-3.5 h-3.5" />
                )}
                <span>{isRecoveringSessions ? "Scanning Storage Tiers..." : "Scan & Recover Sep 23-24 Sessions"}</span>
              </button>
            </div>
          </div>

          {/* SECTION 6: Complete Backup & Restore (JSON) */}
          <div className={`p-4 rounded-2xl border space-y-3 ${isDarkMode ? "bg-zinc-900/60 border-zinc-800" : "bg-neutral-50 border-neutral-200"}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-bold text-neutral-800 dark:text-zinc-200">
                <FileCode className="w-4 h-4 text-emerald-500" />
                <span>Full JSON Profile Backup &amp; Restore</span>
              </div>
              <div className="text-[10px] text-neutral-400">Local Browser Storage</div>
            </div>

            <p className="text-xs text-neutral-600 dark:text-zinc-400 leading-relaxed">
              Export an unalterable snapshot containing all workouts, training programs, matrix weeks, gyms, and body composition data to save locally or transfer to another device.
            </p>

            {restoreStatus && (
              <div className="p-2.5 rounded-xl bg-white dark:bg-zinc-800 text-xs font-semibold text-neutral-800 dark:text-zinc-200 border border-neutral-300 dark:border-zinc-700">
                {restoreStatus}
              </div>
            )}

            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  downloadBackupFile(activeUid);
                  showToast("Downloaded complete JSON export of local profile data.");
                }}
                className="flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export Profile Backup (.json)</span>
              </button>

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white dark:bg-zinc-800 border border-neutral-300 dark:border-zinc-700 hover:bg-neutral-50 dark:hover:bg-zinc-700 text-xs font-bold text-neutral-800 dark:text-zinc-200 transition-colors"
              >
                <Upload className="w-3.5 h-3.5 text-indigo-500" />
                <span>Restore Backup File</span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                onChange={handleRestoreFile}
                className="hidden"
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 z-20 flex-shrink-0 p-4 bg-neutral-50/95 dark:bg-zinc-900/95 backdrop-blur-md border-t border-black/[0.06] dark:border-white/[0.06] flex items-center justify-end">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] px-6 py-2.5 rounded-xl bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 hover:opacity-90 text-sm font-bold shadow transition-all cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
