import React from "react";
import {
  Activity,
  PlusCircle,
  History,
  FileSpreadsheet,
  Dumbbell,
  CalendarRange,
  Sparkles,
  User,
  Pill,
  Play,
  Camera,
  Heart,
  BookOpen,
  Scale,
  Sun,
  Moon,
  HeartPulse,
  Cloud,
  CloudCheck,
  RefreshCw
} from "lucide-react";
import { WeightUnit, UserProfile } from "../types";

export type NavTab =
  | "dashboard"
  | "health"
  | "matrix"
  | "diary"
  | "coach"
  | "log"
  | "history"
  | "supplements"
  | "profile"
  | "sync"
  | "body_composition";

interface NavigationProps {
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  unit: WeightUnit;
  onToggleUnit: () => void;
  isSheetConnected: boolean;
  onOpenSync: () => void;
  onOpenHealthModal: () => void;
  onOpenVideoModal: () => void;
  onOpenPhotosModal: () => void;
  userProfile?: UserProfile;
  isDarkMode: boolean;
  onToggleDarkMode: () => void;
  cloudSyncStatus?: string;
  isCloudSyncing?: boolean;
  onForceCloudSync?: () => void;
  firebaseUser?: any;
  onSignOut?: () => void;
  onOpenAuth?: () => void;
}

export const Navigation: React.FC<NavigationProps> = ({
  activeTab,
  onSelectTab,
  unit,
  onToggleUnit,
  isSheetConnected,
  onOpenSync,
  onOpenHealthModal,
  onOpenVideoModal,
  onOpenPhotosModal,
  userProfile,
  isDarkMode,
  onToggleDarkMode,
  cloudSyncStatus = "Cloud Synced",
  isCloudSyncing = false,
  onForceCloudSync,
  firebaseUser,
  onSignOut,
  onOpenAuth
}) => {
  return (
    <header className="w-full border-b border-black/[0.06] bg-[#ECECEB]/90 backdrop-blur-md sticky top-0 z-30 transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex flex-col md:flex-row items-center justify-between gap-3">
        {/* Brand identity */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-[14px] bg-gradient-to-br from-[#AD314D] to-[#68172C] flex items-center justify-center text-white shadow-sm">
            <Dumbbell className="w-5 h-5 text-white/90" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-base text-[#222222] tracking-tight">
                PULSE
              </span>
              <span className="text-[11px] font-medium tracking-wider uppercase px-2 py-0.5 rounded-full bg-black/[0.05] text-[#4A4A4A]">
                Fitness Intelligence
              </span>
            </div>
            <p className="text-xs text-[#4A4A4A]">
              Calm strength tracking &amp; kinesiology coach
            </p>
          </div>
        </div>

        {/* Navigation Tabs */}
        <nav className="flex items-center gap-1 p-1 rounded-full bg-[#E3E3E0] border border-black/[0.04] shadow-inner flex-wrap justify-center">
          <button
            type="button"
            onClick={() => onSelectTab("dashboard")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200 ${
              activeTab === "dashboard"
                ? "bg-white text-[#222222] shadow-[0_2px_8px_rgba(0,0,0,0.06)]"
                : "text-[#4A4A4A] hover:text-[#222222]"
            }`}
          >
            <Activity className="w-3.5 h-3.5 text-[#AD314D]" />
            <span>Dashboard</span>
          </button>

          <button
            type="button"
            onClick={() => onSelectTab("health")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200 ${
              activeTab === "health"
                ? "bg-white text-[#222222] shadow-[0_2px_8px_rgba(0,0,0,0.06)]"
                : "text-[#4A4A4A] hover:text-[#222222]"
            }`}
          >
            <HeartPulse className="w-3.5 h-3.5 text-emerald-600" />
            <span>Health Hub</span>
          </button>

          <button
            type="button"
            onClick={() => onSelectTab("body_composition")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200 ${
              activeTab === "body_composition"
                ? "bg-white text-[#222222] shadow-[0_2px_8px_rgba(0,0,0,0.06)]"
                : "text-[#4A4A4A] hover:text-[#222222]"
            }`}
          >
            <Scale className="w-3.5 h-3.5 text-indigo-600" />
            <span>Body Comp</span>
          </button>

          <button
            type="button"
            onClick={() => onSelectTab("matrix")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200 ${
              activeTab === "matrix"
                ? "bg-white text-[#222222] shadow-[0_2px_8px_rgba(0,0,0,0.06)]"
                : "text-[#4A4A4A] hover:text-[#222222]"
            }`}
          >
            <CalendarRange className="w-3.5 h-3.5 text-[#AD314D]" />
            <span>Planner</span>
          </button>

          <button
            type="button"
            onClick={() => onSelectTab("diary")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200 ${
              activeTab === "diary"
                ? "bg-white text-[#222222] shadow-[0_2px_8px_rgba(0,0,0,0.06)]"
                : "text-[#4A4A4A] hover:text-[#222222]"
            }`}
          >
            <BookOpen className="w-3.5 h-3.5 text-[#AD314D]" />
            <span>Today&apos;s Session</span>
          </button>

          <button
            type="button"
            onClick={() => onSelectTab("coach")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200 ${
              activeTab === "coach"
                ? "bg-white text-[#222222] shadow-[0_2px_8px_rgba(0,0,0,0.06)]"
                : "text-[#4A4A4A] hover:text-[#222222]"
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            <span>AI Coach</span>
          </button>

          <button
            type="button"
            onClick={() => onSelectTab("supplements")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200 ${
              activeTab === "supplements"
                ? "bg-white text-[#222222] shadow-[0_2px_8px_rgba(0,0,0,0.06)]"
                : "text-[#4A4A4A] hover:text-[#222222]"
            }`}
          >
            <Pill className="w-3.5 h-3.5 text-indigo-600" />
            <span>Supplements</span>
          </button>

          <button
            type="button"
            onClick={() => onSelectTab("profile")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200 ${
              activeTab === "profile"
                ? "bg-white text-[#222222] shadow-[0_2px_8px_rgba(0,0,0,0.06)]"
                : "text-[#4A4A4A] hover:text-[#222222]"
            }`}
          >
            <User className="w-3.5 h-3.5 text-[#AD314D]" />
            <span>Profile</span>
          </button>

          <button
            type="button"
            onClick={() => onSelectTab("history")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200 ${
              activeTab === "history"
                ? "bg-white text-[#222222] shadow-[0_2px_8px_rgba(0,0,0,0.06)]"
                : "text-[#4A4A4A] hover:text-[#222222]"
            }`}
          >
            <History className="w-3.5 h-3.5 text-[#AD314D]" />
            <span>History</span>
          </button>
        </nav>

        {/* Right utilities */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Smooth Dark Mode Toggle Switch */}
          <button
            type="button"
            onClick={onToggleDarkMode}
            title={isDarkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
            aria-label="Toggle theme mode"
            className={`relative flex items-center w-14 h-7 p-1 rounded-full border transition-all duration-300 cursor-pointer ${
              isDarkMode
                ? "bg-zinc-900 border-zinc-700 shadow-inner"
                : "bg-[#E3E3E0] border-black/[0.08] shadow-inner"
            }`}
          >
            {/* Sliding Thumb Pill */}
            <div
              className={`w-5 h-5 rounded-full flex items-center justify-center transition-transform duration-300 ease-out shadow-xs ${
                isDarkMode
                  ? "translate-x-7 bg-amber-400 text-zinc-900"
                  : "translate-x-0 bg-white text-neutral-800"
              }`}
            >
              {isDarkMode ? (
                <Moon className="w-3.5 h-3.5 fill-zinc-900 text-zinc-900" />
              ) : (
                <Sun className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
              )}
            </div>

            {/* Subtle Mode Labels */}
            <span className={`absolute left-1.5 text-[8px] font-black uppercase tracking-wider transition-opacity duration-200 ${
              isDarkMode ? "opacity-50 text-slate-400" : "opacity-0"
            }`}>
              L
            </span>
            <span className={`absolute right-1.5 text-[8px] font-black uppercase tracking-wider transition-opacity duration-200 ${
              isDarkMode ? "opacity-0" : "opacity-50 text-neutral-600"
            }`}>
              D
            </span>
          </button>

          {/* Health Hub Button */}
          <button
            type="button"
            onClick={onOpenHealthModal}
            title="Google Health Sync"
            className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${isDarkMode ? 'bg-emerald-950/40 hover:bg-emerald-900/50 text-emerald-300 border-emerald-800/60' : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-200'}`}
          >
            <Activity className="w-3.5 h-3.5 text-emerald-500" />
            <span className="hidden sm:inline">Google Health</span>
          </button>

          {/* Videos Modal */}
          <button
            type="button"
            onClick={onOpenVideoModal}
            title="Exercise Video & Form Guides"
            className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${isDarkMode ? 'bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border-zinc-800' : 'bg-white hover:bg-neutral-50 text-[#4A4A4A] border-black/[0.08] shadow-sm'}`}
          >
            <Play className="w-3 h-3 text-[#AD314D] fill-[#AD314D]" />
            <span className="hidden sm:inline">Videos</span>
          </button>

          {/* Progress Photos */}
          <button
            type="button"
            onClick={onOpenPhotosModal}
            title="Progress Photos & Transformations"
            className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${isDarkMode ? 'bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border-zinc-800' : 'bg-white hover:bg-neutral-50 text-[#4A4A4A] border-black/[0.08] shadow-sm'}`}
          >
            <Camera className="w-3 h-3 text-indigo-400" />
            <span className="hidden sm:inline">Photos</span>
          </button>

          {/* Unit selector */}
          <button
            type="button"
            onClick={onToggleUnit}
            title={`Switch to ${unit === "kg" ? "lbs" : "kg"}`}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${isDarkMode ? 'bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border-zinc-800' : 'bg-[#E3E3E0] hover:bg-[#DCDCD8] text-[#222222] border-black/[0.04]'}`}
          >
            <span className={isDarkMode ? 'text-zinc-400 text-[10px]' : 'text-[#4A4A4A] text-[10px]'}>UNIT:</span>
            <span className="font-bold text-[#AD314D] uppercase">{unit}</span>
          </button>

          {/* Account / Firebase User Badge */}
          {firebaseUser && !firebaseUser.isAnonymous ? (
            <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${isDarkMode ? 'bg-zinc-900 border-zinc-800 text-zinc-200' : 'bg-white border-black/[0.08] text-[#222222] shadow-xs'}`}>
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="truncate max-w-[110px]" title={firebaseUser.email || firebaseUser.displayName}>
                {firebaseUser.displayName?.split(" ")[0] || firebaseUser.email?.split("@")[0] || "Account"}
              </span>
              {onSignOut && (
                <button
                  type="button"
                  onClick={onSignOut}
                  className="text-[10px] font-bold text-[#AD314D] hover:underline ml-1"
                  title="Sign out of Firebase"
                >
                  Sign Out
                </button>
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={onOpenAuth}
              className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-[#AD314D] hover:bg-[#92263F] text-white shadow-xs transition-all cursor-pointer"
            >
              <span>Sign In / Join</span>
            </button>
          )}

          {/* Cloud Sync Button (Hidden as requested: saving occurs silently in background) */}
          <button
            id="cloud-sync-header-btn"
            type="button"
            onClick={onOpenSync}
            title={`${cloudSyncStatus} - Click to open Data & Sync Hub`}
            className="hidden"
          >
            {isCloudSyncing || cloudSyncStatus === "Syncing" ? (
              <RefreshCw className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 animate-spin" />
            ) : cloudSyncStatus.includes("failed") || cloudSyncStatus.includes("error") ? (
              <Cloud className="w-3.5 h-3.5 text-rose-500 dark:text-rose-400" />
            ) : cloudSyncStatus.includes("Synced") || cloudSyncStatus.includes("Saved to cloud") ? (
              <CloudCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <CloudCheck className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
            )}
            <span className="font-semibold truncate max-w-[180px]">
              {cloudSyncStatus}
            </span>
          </button>
        </div>
      </div>
    </header>
  );
};
