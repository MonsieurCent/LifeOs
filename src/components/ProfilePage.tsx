import React, { useState, useRef, useEffect } from "react";
import {
  UserProfile,
  UserGender,
  ExperienceLevel,
  FitnessGoal,
  SyncedHealthMetrics,
  WeightUnit,
  TrainingProgram,
  WeeklyMatrixPlan
} from "../types";
import {
  User,
  Mail,
  Instagram,
  Shield,
  Dumbbell,
  Scale,
  Calendar,
  Sparkles,
  Heart,
  RefreshCw,
  ExternalLink,
  CheckCircle2,
  Clock,
  Settings,
  Flame,
  Activity,
  Award,
  Camera,
  Upload,
  Trash2,
  Info,
  Moon,
  Footprints,
  Check,
  Copy,
  AlertCircle,
  X,
  Key,
  ShieldCheck,
  Smartphone,
  Cloud,
  SlidersHorizontal,
  Layers,
  Pencil
} from "lucide-react";
import { calculateHormoneAndMacroPlan } from "../utils/fitnessData";

const PRESET_AVATARS = [
  { id: "av-1", label: "Powerlifter", url: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&auto=format&fit=crop&q=80" },
  { id: "av-2", label: "Athletic", url: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&auto=format&fit=crop&q=80" },
  { id: "av-3", label: "Hypertrophy", url: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=200&auto=format&fit=crop&q=80" },
  { id: "av-4", label: "Runner", url: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=200&auto=format&fit=crop&q=80" },
  { id: "av-5", label: "CrossFit", url: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=200&auto=format&fit=crop&q=80" },
  { id: "av-6", label: "Calisthenics", url: "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=200&auto=format&fit=crop&q=80" }
];

interface ProfilePageProps {
  userProfile: UserProfile;
  healthMetrics: SyncedHealthMetrics;
  unit: WeightUnit;
  onUpdateProfile: (updated: Partial<UserProfile>) => void;
  onOpenOnboarding: () => void;
  onOpenHealthModal: () => void;
  activeProgram?: TrainingProgram;
  programs?: TrainingProgram[];
  matrixPlans?: WeeklyMatrixPlan[];
  cloudSyncStatus?: string;
  isCloudSyncing?: boolean;
  onForceSyncCloud?: () => void;
  onNavigateToPlanner?: () => void;
  onNavigateToDiary?: () => void;
  onUpdateProgram?: (program: TrainingProgram) => void;
  firebaseUser?: any;
  onSignOut?: () => void;
  onOpenAuth?: () => void;
}

export const ProfilePage: React.FC<ProfilePageProps> = ({
  userProfile,
  healthMetrics,
  unit,
  onUpdateProfile,
  onOpenOnboarding,
  onOpenHealthModal,
  activeProgram,
  programs = [],
  matrixPlans = [],
  cloudSyncStatus,
  isCloudSyncing,
  onForceSyncCloud,
  onNavigateToPlanner,
  onNavigateToDiary,
  onUpdateProgram,
  firebaseUser,
  onSignOut,
  onOpenAuth
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(userProfile.name);
  const [editEmail, setEditEmail] = useState(userProfile.email);
  const [editGender, setEditGender] = useState<UserGender>(userProfile.gender);
  const [editGoal, setEditGoal] = useState<FitnessGoal>(userProfile.goal);
  const [editLevel, setEditLevel] = useState<ExperienceLevel>(userProfile.level);
  const [editDaysPerWeek, setEditDaysPerWeek] = useState(userProfile.daysPerWeek);
  const [editWeightKg, setEditWeightKg] = useState(userProfile.weightKg);
  const [editHeightCm, setEditHeightCm] = useState(userProfile.heightCm);
  const [editInstagram, setEditInstagram] = useState(userProfile.instagramHandle || "");
  const [editBio, setEditBio] = useState(userProfile.bio || "");
  const [editTimezone, setEditTimezone] = useState(userProfile.timezone || "Europe/Oslo");
  const [showAvatarModal, setShowAvatarModal] = useState(false);
  const [oauthToast, setOAuthToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [showModelInfo, setShowModelInfo] = useState(false);
  const [saveToast, setSaveToast] = useState(false);
  const editFormRef = useRef<HTMLFormElement | null>(null);

  // Sync internal editing fields whenever userProfile changes externally (and not actively editing)
  useEffect(() => {
    if (!isEditing) {
      setEditName(userProfile.name);
      setEditEmail(userProfile.email);
      setEditGender(userProfile.gender);
      setEditGoal(userProfile.goal);
      setEditLevel(userProfile.level);
      setEditDaysPerWeek(userProfile.daysPerWeek);
      setEditWeightKg(userProfile.weightKg);
      setEditHeightCm(userProfile.heightCm);
      setEditInstagram(userProfile.instagramHandle || "");
      setEditBio(userProfile.bio || "");
      setEditTimezone(userProfile.timezone || "Europe/Oslo");
    }
  }, [userProfile, isEditing]);

  const openAndFocusEditForm = (fieldToFocus?: string) => {
    setIsEditing(true);
    setTimeout(() => {
      editFormRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      if (fieldToFocus) {
        const input = document.getElementById(fieldToFocus);
        input?.focus();
      }
    }, 100);
  };

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Check existing OAuth server status on component mount
  useEffect(() => {
    fetch("/api/oauth/status")
      .then((res) => res.json())
      .then((data) => {
        if (data.authenticated && !userProfile.connectedApps?.googleHealth) {
          onUpdateProfile({
            connectedApps: {
              ...userProfile.connectedApps,
              googleHealth: true
            }
          });
        }
      })
      .catch(() => {});
  }, []);

  // Listen for Google Health OAuth popup completion
  useEffect(() => {
    const handleOAuthMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) {
        return;
      }
      if (event.data?.type === "GOOGLE_OAUTH_SUCCESS") {
        const googleUser = event.data.user;
        const updates: Partial<UserProfile> = {
          connectedApps: {
            ...userProfile.connectedApps,
            googleHealth: true
          }
        };
        if (googleUser?.displayName) {
          updates.name = googleUser.displayName;
          setEditName(googleUser.displayName);
        }
        if (googleUser?.email) {
          updates.email = googleUser.email;
          setEditEmail(googleUser.email);
        }
        if (googleUser?.avatar && !userProfile.avatarUrl) {
          updates.avatarUrl = googleUser.avatar;
        }
        onUpdateProfile(updates);
        setOAuthToast({
          message: `Google Health connected successfully!`,
          type: "success"
        });
        setTimeout(() => setOAuthToast(null), 5000);
      }
    };
    window.addEventListener("message", handleOAuthMessage);
    return () => window.removeEventListener("message", handleOAuthMessage);
  }, [userProfile, onUpdateProfile]);

  const macroPlan = calculateHormoneAndMacroPlan(
    userProfile.gender,
    userProfile.goal,
    userProfile.weightKg
  );

  const handleImageFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      if (dataUrl) {
        onUpdateProfile({ avatarUrl: dataUrl });
        setShowAvatarModal(false);
        setSaveToast(true);
        setTimeout(() => setSaveToast(false), 3000);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSelectPresetAvatar = (url: string) => {
    onUpdateProfile({ avatarUrl: url });
    setShowAvatarModal(false);
    setSaveToast(true);
    setTimeout(() => setSaveToast(false), 3000);
  };

  const handleRemoveAvatar = () => {
    onUpdateProfile({ avatarUrl: "" });
    setShowAvatarModal(false);
    setSaveToast(true);
    setTimeout(() => setSaveToast(false), 3000);
  };

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    const updatedMacros = calculateHormoneAndMacroPlan(editGender, editGoal, editWeightKg);
    const cleanInstagram = editInstagram
      .replace(/^https?:\/\/(www\.)?instagram\.com\//i, "")
      .replace(/^@/, "")
      .trim();

    onUpdateProfile({
      name: editName.trim(),
      email: editEmail.trim(),
      gender: editGender,
      goal: editGoal,
      level: editLevel,
      daysPerWeek: editDaysPerWeek,
      weightKg: Number(editWeightKg),
      heightCm: Number(editHeightCm),
      instagramHandle: cleanInstagram,
      bio: editBio.trim(),
      timezone: editTimezone || "Europe/Oslo",
      targetCalories: updatedMacros.totalCalories,
      macroSplit: {
        proteinG: updatedMacros.proteinGrams,
        carbsG: updatedMacros.carbsGrams,
        fatsG: updatedMacros.fatGrams
      }
    });

    setIsEditing(false);
    setSaveToast(true);
    setTimeout(() => setSaveToast(false), 3000);
  };

  const handleToggleAppSync = (appKey: "googleHealth" | "fitbit") => {
    onUpdateProfile({
      connectedApps: {
        ...userProfile.connectedApps,
        [appKey]: !userProfile.connectedApps[appKey]
      }
    });
  };

  // Quick switch between male & female athlete presets for fast testing
  const handleQuickSwitchGender = (g: UserGender) => {
    const defaultWeight = g === "male" ? 78.1 : 63.5;
    const defaultGoal = g === "male" ? "bulk" : "shred";
    const macros = calculateHormoneAndMacroPlan(g, defaultGoal, defaultWeight);

    onUpdateProfile({
      gender: g,
      goal: defaultGoal,
      name: g === "male" ? "David Rootwelt" : "Astrid Rootwelt",
      weightKg: defaultWeight,
      targetCalories: macros.totalCalories,
      macroSplit: {
        proteinG: macros.proteinGrams,
        carbsG: macros.carbsGrams,
        fatsG: macros.fatGrams
      }
    });
  };

  return (
    <div className="space-y-6 animate-fadeIn max-w-5xl mx-auto">
      {/* Hidden file input for avatar upload */}
      <input
        type="file"
        ref={fileInputRef}
        accept="image/*"
        onChange={handleImageFileChange}
        className="hidden"
      />

      {/* OAuth Toast Notification */}
      {oauthToast && (
        <div
          className={`p-3.5 rounded-2xl border text-xs font-semibold flex items-center justify-between shadow-sm animate-in fade-in ${
            oauthToast.type === "success"
              ? "bg-emerald-50 border-emerald-200 text-emerald-800"
              : "bg-rose-50 border-rose-200 text-rose-800"
          }`}
        >
          <div className="flex items-center gap-2">
            {oauthToast.type === "success" ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span>{oauthToast.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setOAuthToast(null)}
            className="p-1 rounded text-neutral-400 hover:text-neutral-700"
          >
            ✕
          </button>
        </div>
      )}

      {/* Save Feedback Banner */}
      {saveToast && (
        <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center justify-between shadow-sm animate-in fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>Profile and training preferences successfully updated!</span>
          </div>
        </div>
      )}

      {/* Profile Header Hero Card */}
      <div className="p-6 sm:p-8 rounded-3xl bg-white border border-black/[0.08] shadow-sm">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            {/* Avatar with Click to Change */}
            <div className="relative group shrink-0">
              <div
                onClick={() => setShowAvatarModal(true)}
                className="w-20 h-20 rounded-3xl bg-gradient-to-br from-[#AD314D] to-[#601427] text-white flex items-center justify-center text-2xl font-bold shadow-md ring-4 ring-rose-50 overflow-hidden cursor-pointer transition-transform group-hover:scale-[1.02]"
                title="Click to upload picture or choose avatar"
              >
                {userProfile.avatarUrl ? (
                  <img
                    src={userProfile.avatarUrl}
                    alt={userProfile.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span>{userProfile.name ? userProfile.name.charAt(0).toUpperCase() : "U"}</span>
                )}
              </div>
              <button
                type="button"
                onClick={() => setShowAvatarModal(true)}
                className="absolute -bottom-1 -right-1 p-1.5 rounded-full bg-white text-[#222222] shadow-md border border-black/[0.08] hover:bg-neutral-50 transition-colors"
                title="Change Avatar or Photo"
              >
                <Camera className="w-3.5 h-3.5 text-[#AD314D]" />
              </button>
            </div>

            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-extrabold text-[#222222] tracking-tight">
                  {userProfile.name}
                </h1>
                <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-rose-50 text-[#AD314D] border border-rose-100 uppercase">
                  {userProfile.goal}
                </span>
                <span className="text-[11px] font-medium px-2.5 py-0.5 rounded-full bg-black/[0.05] text-[#4A4A4A] capitalize">
                  {userProfile.gender}
                </span>
                <span className="text-[11px] font-medium px-2.5 py-0.5 rounded-full bg-black/[0.05] text-[#4A4A4A] capitalize">
                  {userProfile.level}
                </span>
                <span className="text-[11px] font-medium px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100 flex items-center gap-1">
                  <Clock className="w-3 h-3 text-indigo-600" />
                  <span>{userProfile.timezone || "Europe/Oslo"}</span>
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-3 text-xs text-[#4A4A4A] mt-1.5">
                <span className="flex items-center gap-1">
                  <Mail className="w-3.5 h-3.5 text-[#777777]" />
                  {userProfile.email}
                </span>
                <span>•</span>
                {userProfile.instagramHandle ? (
                  <div className="flex items-center gap-1">
                    <a
                      href={`https://instagram.com/${userProfile.instagramHandle}`}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1 text-[#AD314D] hover:underline font-semibold"
                    >
                      <Instagram className="w-3.5 h-3.5" />
                      @{userProfile.instagramHandle}
                    </a>
                    <button
                      type="button"
                      onClick={() => openAndFocusEditForm("edit-instagram")}
                      className="p-1 rounded-md hover:bg-neutral-100 text-[#777777] hover:text-[#AD314D]"
                      title="Edit Instagram Handle"
                    >
                      <Pencil className="w-3 h-3" />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => openAndFocusEditForm("edit-instagram")}
                    className="flex items-center gap-1 text-[#AD314D] hover:underline font-semibold text-xs"
                  >
                    <Instagram className="w-3.5 h-3.5" />
                    <span>+ Add Instagram</span>
                  </button>
                )}
                <span>•</span>
                <span className="font-semibold text-[#222222]">{userProfile.daysPerWeek} days / week</span>
                <span>•</span>
                <div className="flex items-center gap-1">
                  <span className="font-medium text-[#222222]">
                    {userProfile.weightKg} {unit} ({userProfile.heightCm || 185} cm
                    {userProfile.heightCm ? ` • ${Math.floor(userProfile.heightCm / 30.48)}'${Math.round((userProfile.heightCm % 30.48) / 2.54)}"` : ""})
                  </span>
                  <button
                    type="button"
                    onClick={() => openAndFocusEditForm("edit-height")}
                    className="p-1 rounded-md hover:bg-neutral-100 text-[#777777] hover:text-[#AD314D]"
                    title="Edit Height & Weight"
                  >
                    <Pencil className="w-3 h-3" />
                  </button>
                </div>
              </div>

              {/* Bio & Target Focus Display Card */}
              <div className="mt-3 p-3 rounded-2xl bg-[#FBFBFA] border border-black/[0.05] max-w-2xl flex items-start justify-between gap-3">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-[#777777] flex items-center gap-1.5 mb-1">
                    <Sparkles className="w-3 h-3 text-[#AD314D]" />
                    <span>Target Focus &amp; Bio</span>
                  </div>
                  <p className="text-xs text-[#222222] italic leading-relaxed">
                    {userProfile.bio ? `"${userProfile.bio}"` : "No bio or targets entered yet. Click to add your personal targets."}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => openAndFocusEditForm("edit-bio")}
                  className="shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold text-[#AD314D] hover:bg-rose-50 border border-rose-200 transition-colors"
                  title="Edit your bio and target goals"
                >
                  <Pencil className="w-3 h-3" />
                  <span>Edit Target</span>
                </button>
              </div>
            </div>
          </div>

          {/* Edit & Avatar & Onboarding Actions */}
          <div className="flex flex-wrap items-center gap-2 self-start md:self-auto">
            <button
              type="button"
              onClick={onOpenHealthModal}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-semibold shadow-sm transition-all ${
                userProfile.connectedApps?.googleHealth
                  ? "bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300"
                  : "bg-indigo-600 hover:bg-indigo-700 text-white"
              }`}
              title={
                userProfile.connectedApps?.googleHealth
                  ? "Google Account & Health connected. Click to view status or manage."
                  : "Sign in with Google & connect Google Health"
              }
            >
              {userProfile.connectedApps?.googleHealth ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Google Connected</span>
                </>
              ) : (
                <>
                  <Shield className="w-3.5 h-3.5" />
                  <span>Sign in with Google</span>
                </>
              )}
            </button>
            <button
              type="button"
              onClick={() => setShowAvatarModal(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-full border border-black/[0.08] hover:bg-neutral-50 text-xs font-semibold text-[#222222] transition-colors"
            >
              <Camera className="w-3.5 h-3.5 text-[#AD314D]" />
              <span>Change Photo</span>
            </button>
            <button
              type="button"
              onClick={() => {
                if (!isEditing) {
                  openAndFocusEditForm();
                } else {
                  setIsEditing(false);
                }
              }}
              className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#AD314D] hover:bg-[#92263F] text-white text-xs font-semibold shadow-sm transition-all"
            >
              <Pencil className="w-3.5 h-3.5" />
              <span>{isEditing ? "Close Editor" : "Edit Profile"}</span>
            </button>
            <button
              type="button"
              onClick={onOpenOnboarding}
              className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-neutral-100 hover:bg-neutral-200 text-[#222222] text-xs font-semibold border border-black/[0.06] transition-all"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              <span>Retake Onboarding (5 Qs)</span>
            </button>
          </div>
        </div>

        {/* Active Physiological Model Section & Explanation */}
        <div className="mt-5 pt-4 border-t border-black/[0.06] space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2 text-xs">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-[#222222]">Active Physiological Model:</span>
              <span className="px-2.5 py-0.5 rounded-full bg-neutral-100 text-[#222222] font-semibold border border-black/[0.04]">
                {userProfile.gender === "male"
                  ? "Male Endocrine Model (>0.85g/kg Fat, Testosterone Support)"
                  : "Female Endocrine Model (>1.0g/kg Fat, Progesterone & Thyroid Stability)"}
              </span>
              <button
                type="button"
                onClick={() => setShowModelInfo(!showModelInfo)}
                className="text-[11px] text-[#AD314D] hover:underline font-semibold flex items-center gap-1"
                title="Click to learn where this is decided"
              >
                <Info className="w-3.5 h-3.5" />
                <span>{showModelInfo ? "Hide Details" : "Where is this decided?"}</span>
              </button>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[11px] text-[#777777]">Quick Biological Model:</span>
              <button
                type="button"
                onClick={() => handleQuickSwitchGender("male")}
                className={`px-3 py-1 rounded-full text-xs font-semibold transition-all ${
                  userProfile.gender === "male"
                    ? "bg-[#AD314D] text-white shadow-sm"
                    : "bg-neutral-100 hover:bg-neutral-200 text-[#4A4A4A]"
                }`}
              >
                Male
              </button>
              <button
                type="button"
                onClick={() => handleQuickSwitchGender("female")}
                className={`px-3 py-1 rounded-full text-xs font-semibold transition-all ${
                  userProfile.gender === "female"
                    ? "bg-[#AD314D] text-white shadow-sm"
                    : "bg-neutral-100 hover:bg-neutral-200 text-[#4A4A4A]"
                }`}
              >
                Female
              </button>
            </div>
          </div>

          {/* Educational Callout explaining where Active Physiological Model is decided */}
          {showModelInfo && (
            <div className="p-4 rounded-2xl bg-amber-50/70 border border-amber-200 text-xs text-[#4A4A4A] space-y-2 animate-in fade-in">
              <div className="flex items-center gap-1.5 font-bold text-amber-900">
                <Info className="w-4 h-4 text-amber-700" />
                <span>Where is the "Active Physiological Model" decided?</span>
              </div>
              <p className="leading-relaxed">
                This model is decided by your <strong>Biological Sex / Gender</strong> setting (set in Onboarding Question #1 or in "Edit Profile" below). It configures the foundational physiology formulas across the application:
              </p>
              <ul className="list-disc list-inside space-y-1 text-[11px] text-amber-950 pl-1">
                <li>
                  <strong>Hormone Synthesis & Minimum Fat Floor:</strong> Dietary lipids are the essential cholesterol precursor to steroid hormones. The <em>Male Model</em> enforces a strict floor of &ge;0.85g/kg to sustain luteinizing hormone and testosterone synthesis. The <em>Female Model</em> enforces &ge;1.0g/kg to safeguard progesterone synthesis, thyroid axis (T3/T4 conversion), and ovulatory stability during training stress.
                </li>
                <li>
                  <strong>Metabolic Rate Equations:</strong> Caloric expenditure formulas (Mifflin-St Jeor) apply gender-specific coefficients (+5 for male vs. -161 for female) to calculate basal metabolic rate (BMR) from height, weight, and age.
                </li>
                <li>
                  <strong>Recovery & Fatigue Auto-Regulation:</strong> Recovery algorithms adjust neuromuscular fatigue dissipation curves and volume recovery rates based on sex-specific muscle fiber composition and substrate utilization.
                </li>
              </ul>
              <div className="text-[11px] text-amber-800 pt-1">
                You can toggle between Male and Female models at any time using the quick buttons above or by editing your Biological Sex in the form below.
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Avatar Selection & Upload Modal */}
      {showAvatarModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl border border-black/[0.08] p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-black/[0.06] pb-3">
              <div className="flex items-center gap-2">
                <Camera className="w-5 h-5 text-[#AD314D]" />
                <h3 className="font-bold text-base text-[#222222]">Profile Picture & Avatar</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowAvatarModal(false)}
                className="p-1 rounded-full text-[#777777] hover:bg-black/[0.05]"
              >
                ✕
              </button>
            </div>

            {/* Current Preview */}
            <div className="flex items-center gap-4 p-3.5 rounded-2xl bg-[#FBFBFA] border border-black/[0.06]">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#AD314D] to-[#601427] text-white flex items-center justify-center text-xl font-bold overflow-hidden shadow-inner shrink-0">
                {userProfile.avatarUrl ? (
                  <img src={userProfile.avatarUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  userProfile.name ? userProfile.name.charAt(0).toUpperCase() : "U"
                )}
              </div>
              <div>
                <div className="font-semibold text-xs text-[#222222]">{userProfile.name}</div>
                <div className="text-[11px] text-[#777777]">
                  {userProfile.avatarUrl ? "Custom avatar active" : "Using initials fallback"}
                </div>
                {userProfile.avatarUrl && (
                  <button
                    type="button"
                    onClick={handleRemoveAvatar}
                    className="flex items-center gap-1 text-[11px] text-rose-600 hover:underline font-semibold mt-1"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>Remove Photo (Reset to Initials)</span>
                  </button>
                )}
              </div>
            </div>

            {/* Upload from Device */}
            <div>
              <label className="block text-xs font-semibold text-[#222222] mb-1.5">
                Upload from your device:
              </label>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full py-3 px-4 rounded-2xl border-2 border-dashed border-black/[0.15] hover:border-[#AD314D] bg-[#FBFBFA] hover:bg-rose-50/40 text-xs font-semibold text-[#222222] flex items-center justify-center gap-2 transition-all"
              >
                <Upload className="w-4 h-4 text-[#AD314D]" />
                <span>Upload JPG, PNG, or WebP Photo</span>
              </button>
            </div>

            {/* Choose from Preset Athletic Avatars */}
            <div>
              <label className="block text-xs font-semibold text-[#222222] mb-2">
                Or choose an athletic avatar:
              </label>
              <div className="grid grid-cols-3 gap-2.5">
                {PRESET_AVATARS.map((av) => (
                  <button
                    key={av.id}
                    type="button"
                    onClick={() => handleSelectPresetAvatar(av.url)}
                    className="group p-1.5 rounded-2xl border border-black/[0.08] hover:border-[#AD314D] hover:bg-rose-50/50 flex flex-col items-center gap-1.5 transition-all text-center"
                  >
                    <img
                      src={av.url}
                      alt={av.label}
                      className="w-12 h-12 rounded-xl object-cover group-hover:scale-105 transition-transform"
                    />
                    <span className="text-[10px] font-medium text-[#4A4A4A] group-hover:text-[#AD314D]">
                      {av.label}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="pt-2 border-t border-black/[0.06] flex justify-end">
              <button
                type="button"
                onClick={() => setShowAvatarModal(false)}
                className="px-4 py-2 rounded-full border border-black/[0.1] hover:bg-neutral-100 text-xs font-semibold text-[#222222]"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* ACTIVE TRAINING PROGRAM & GYM MOBILE LOGGING SYNC STATUS (User Requested) */}
      {/* ========================================================================= */}
      <div className="p-6 sm:p-7 rounded-3xl bg-white border border-black/[0.08] shadow-sm space-y-4 transition-none">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-black/[0.06] pb-4">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-[#AD314D] to-[#8C1E37] text-white flex items-center justify-center shadow-sm shrink-0">
              <Dumbbell className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base font-bold text-[#222222] whitespace-nowrap">
                  Training Program &amp; Gym Mobile Sync
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200/80 flex items-center gap-1 shrink-0 whitespace-nowrap">
                  <Cloud className="w-3 h-3" />
                  <span>Synced to Profile</span>
                </span>
              </div>
              <p className="text-xs text-[#777777] mt-0.5 truncate">
                Active routine saved to {userProfile.email || "your account"} &bull; Ready to open and log on your phone at the gym
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {onForceSyncCloud && (
              <button
                type="button"
                onClick={onForceSyncCloud}
                disabled={isCloudSyncing}
                className="w-[124px] justify-center px-3.5 py-1.5 rounded-full border border-black/[0.1] hover:bg-neutral-50 text-xs font-semibold text-[#222222] transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shadow-2xs shrink-0 whitespace-nowrap"
                title="Force cloud push to ensure mobile session is 100% up to date"
              >
                <RefreshCw className={`w-3.5 h-3.5 text-[#AD314D] shrink-0 ${isCloudSyncing ? "animate-spin" : ""}`} />
                <span>{isCloudSyncing ? "Syncing..." : "Push to Cloud"}</span>
              </button>
            )}
            {onNavigateToDiary && (
              <button
                type="button"
                onClick={onNavigateToDiary}
                className="px-4 py-1.5 rounded-full bg-[#AD314D] hover:bg-[#92263F] text-white text-xs font-bold shadow-sm transition-all flex items-center gap-1.5 cursor-pointer shrink-0 whitespace-nowrap"
              >
                <Smartphone className="w-3.5 h-3.5 shrink-0" />
                <span>Open Today's Session</span>
              </button>
            )}
          </div>
        </div>

        {/* Program Details Overview */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
          <div className="p-3.5 rounded-2xl bg-[#FBFBFA] border border-black/[0.04]">
            <span className="text-[10px] font-bold uppercase text-[#777777] block">
              Active Program &amp; Split
            </span>
            <p className="font-bold text-sm text-[#222222] mt-1">
              {activeProgram?.name || "Single Muscle Split"}
            </p>
            <p className="text-[#666666] font-medium mt-0.5">
              {activeProgram?.daysPerWeek || activeProgram?.splitDaysPerWeek || userProfile.daysPerWeek || 6} Days / Week Setup &bull; {activeProgram?.totalWeeks || 8} Wks
            </p>
          </div>

          <div className="p-3.5 rounded-2xl bg-[#FBFBFA] border border-black/[0.04]">
            <span className="text-[10px] font-bold uppercase text-[#777777] block">
              Primary Progression Target
            </span>
            <p className="font-semibold text-xs text-[#222222] mt-1 line-clamp-2">
              {activeProgram?.primaryObjective || "Maximize hypertrophy with dedicated single-muscle workouts and overload."}
            </p>
          </div>

          <div className="p-3.5 rounded-2xl bg-[#FBFBFA] border border-black/[0.04]">
            <span className="text-[10px] font-bold uppercase text-[#777777] block">
              Mobile Gym Ready
            </span>
            <div className="mt-1 flex items-center gap-1.5 text-emerald-700 font-semibold text-xs">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>Offline-capable &amp; auto-syncing on phone</span>
            </div>
            <p className="text-[11px] text-[#777777] mt-0.5">
              Open app on your phone &rarr; Tap "Today's Session" tab to start logging sets.
            </p>
          </div>
        </div>

        {/* Quick actions row */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 text-xs min-h-[32px]">
          <div className="flex items-center gap-2 text-[#777777] shrink-0 whitespace-nowrap">
            <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
            <span>Cloud Database: <strong className="text-[#222222]">Synced</strong></span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {onNavigateToPlanner && (
              <button
                type="button"
                onClick={onNavigateToPlanner}
                className="text-xs font-semibold text-[#AD314D] hover:underline flex items-center gap-1 cursor-pointer whitespace-nowrap"
              >
                <Layers className="w-3.5 h-3.5 shrink-0" />
                <span>Go to Planner</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Edit Profile Form */}
      {isEditing && (
        <form
          ref={editFormRef}
          onSubmit={handleSaveProfile}
          className="p-6 sm:p-8 rounded-3xl bg-white border-2 border-[#AD314D]/20 shadow-md space-y-5 animate-in fade-in"
        >
          <div className="flex items-center justify-between border-b border-black/[0.06] pb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-rose-50 text-[#AD314D] flex items-center justify-center">
                <Settings className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-[#222222]">
                  Edit Profile &amp; Athlete Details
                </h3>
                <p className="text-[11px] text-[#777777]">
                  Update your Instagram, height, personal targets, and training preferences
                </p>
              </div>
            </div>
            <span className="text-[11px] font-medium text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-100 hidden sm:inline-block">
              Auto-recalibrates calorie targets
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-[#222222] mb-1">
                Full Name
              </label>
              <input
                id="edit-name"
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-black/[0.1] text-xs bg-[#FBFBFA] focus:bg-white focus:border-[#AD314D] outline-hidden font-medium"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#222222] mb-1">
                Email Address
              </label>
              <input
                id="edit-email"
                type="email"
                value={editEmail}
                onChange={(e) => setEditEmail(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-black/[0.1] text-xs bg-[#FBFBFA] focus:bg-white focus:border-[#AD314D] outline-hidden font-medium"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#222222] mb-1">
                Instagram Profile / Handle
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-[#777777] text-xs font-bold">
                  @
                </span>
                <input
                  id="edit-instagram"
                  type="text"
                  placeholder="e.g. david_lifts or instagram.com/david"
                  value={editInstagram}
                  onChange={(e) => {
                    const clean = e.target.value
                      .replace(/^https?:\/\/(www\.)?instagram\.com\//i, "")
                      .replace(/^@/, "");
                    setEditInstagram(clean);
                  }}
                  className="w-full pl-7 pr-3.5 py-2.5 rounded-xl border border-black/[0.1] text-xs bg-[#FBFBFA] focus:bg-white focus:border-[#AD314D] outline-hidden font-medium"
                />
              </div>
              <p className="text-[10px] text-[#777777] mt-0.5">
                Saved link: instagram.com/{editInstagram || "yourhandle"}
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#222222] mb-1">
                Height (cm)
              </label>
              <input
                id="edit-height"
                type="number"
                min={100}
                max={250}
                value={editHeightCm}
                onChange={(e) => setEditHeightCm(Number(e.target.value))}
                className="w-full px-3.5 py-2.5 rounded-xl border border-black/[0.1] text-xs bg-[#FBFBFA] focus:bg-white focus:border-[#AD314D] outline-hidden font-medium"
                placeholder="e.g. 185"
                required
              />
              <p className="text-[10px] text-[#777777] mt-0.5">
                {editHeightCm > 0
                  ? `Equivalent: ~${Math.floor(editHeightCm / 30.48)}' ${Math.round((editHeightCm % 30.48) / 2.54)}" (imperial)`
                  : "Enter height in centimeters"}
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#222222] mb-1">
                Body Weight ({unit})
              </label>
              <input
                id="edit-weight"
                type="number"
                step="0.1"
                value={editWeightKg}
                onChange={(e) => setEditWeightKg(Number(e.target.value))}
                className="w-full px-3.5 py-2.5 rounded-xl border border-black/[0.1] text-xs bg-[#FBFBFA] focus:bg-white focus:border-[#AD314D] outline-hidden font-medium"
                required
              />
              <p className="text-[10px] text-[#777777] mt-0.5">
                Updates current weight &amp; recalculates macro ratios.
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#222222] mb-1">
                Biological Sex (Physiological Model)
              </label>
              <select
                value={editGender}
                onChange={(e) => setEditGender(e.target.value as UserGender)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-black/[0.1] text-xs bg-[#FBFBFA] focus:bg-white focus:border-[#AD314D] outline-hidden font-medium"
              >
                <option value="male">Male (Testosterone &amp; Endocrine Model)</option>
                <option value="female">Female (Progesterone &amp; Thyroid Stability Model)</option>
                <option value="other">Other</option>
              </select>
              <p className="text-[10px] text-[#777777] mt-0.5">
                Sets minimum hormonal dietary fat floor (&ge;0.85g/kg vs &ge;1.0g/kg).
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#222222] mb-1">
                Primary Goal
              </label>
              <select
                value={editGoal}
                onChange={(e) => setEditGoal(e.target.value as FitnessGoal)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-black/[0.1] text-xs bg-[#FBFBFA] focus:bg-white focus:border-[#AD314D] outline-hidden font-medium"
              >
                <option value="bulk">Bulk &amp; Hypertrophy</option>
                <option value="shred">Shred &amp; Fat Loss</option>
                <option value="longevity">Longevity &amp; Health</option>
                <option value="strength">Pure Strength</option>
                <option value="recomp">Body Recomposition</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#222222] mb-1">
                Training Days / Week (1 to 7 Days)
              </label>
              <select
                value={editDaysPerWeek}
                onChange={(e) => setEditDaysPerWeek(Number(e.target.value))}
                className="w-full px-3.5 py-2.5 rounded-xl border border-black/[0.1] text-xs bg-[#FBFBFA] focus:bg-white focus:border-[#AD314D] outline-hidden font-semibold text-[#222222]"
              >
                <option value={1}>1 Day / Week</option>
                <option value={2}>2 Days / Week</option>
                <option value={3}>3 Days / Week</option>
                <option value={4}>4 Days / Week</option>
                <option value={5}>5 Days / Week</option>
                <option value={6}>6 Days / Week</option>
                <option value={7}>7 Days / Week</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#222222] mb-1">
                Timezone (Schedule &amp; Timestamps)
              </label>
              <select
                value={editTimezone}
                onChange={(e) => setEditTimezone(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-black/[0.1] text-xs bg-[#FBFBFA] focus:bg-white focus:border-[#AD314D] outline-hidden font-medium text-[#222222]"
              >
                <option value="Europe/Oslo">Europe/Oslo (GMT+1 / CEST)</option>
                <option value="Europe/Stockholm">Europe/Stockholm (GMT+1 / CEST)</option>
                <option value="Europe/Copenhagen">Europe/Copenhagen (GMT+1 / CEST)</option>
                <option value="Europe/London">Europe/London (GMT / BST)</option>
                <option value="Europe/Berlin">Europe/Berlin (GMT+1 / CEST)</option>
                <option value="Europe/Paris">Europe/Paris (GMT+1 / CEST)</option>
                <option value="America/New_York">America/New_York (EST / EDT)</option>
                <option value="America/Chicago">America/Chicago (CST / CDT)</option>
                <option value="America/Los_Angeles">America/Los_Angeles (PST / PDT)</option>
                <option value="Asia/Tokyo">Asia/Tokyo (JST)</option>
                <option value="UTC">UTC (Universal Coordinated Time)</option>
              </select>
            </div>
          </div>

          {/* Bio / Target Focus & Objectives (Full Width Textarea) */}
          <div className="pt-2 border-t border-black/[0.06]">
            <div className="flex items-center justify-between mb-1.5">
              <label htmlFor="edit-bio" className="block text-xs font-bold text-[#222222]">
                Target Focus, Physique Goals &amp; Personal Bio
              </label>
              {editBio && (
                <button
                  type="button"
                  onClick={() => setEditBio("")}
                  className="text-[11px] text-rose-600 hover:underline font-semibold"
                >
                  Clear text
                </button>
              )}
            </div>
            <textarea
              id="edit-bio"
              rows={3}
              placeholder="e.g. Focus on chest & shoulder hypertrophy. Targeting 82kg clean lean mass before cutting phase."
              value={editBio}
              onChange={(e) => setEditBio(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-black/[0.1] text-xs bg-[#FBFBFA] focus:bg-white focus:border-[#AD314D] outline-hidden font-medium leading-relaxed resize-y"
            />
            <p className="text-[11px] text-[#777777] mt-1">
              Replace the placeholder text with your actual targets, target bodyweight, timeline, meet date, or personal notes.
            </p>
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-black/[0.06]">
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              className="px-4 py-2 rounded-full border border-black/[0.1] hover:bg-neutral-100 text-xs font-semibold text-[#222222]"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-6 py-2 rounded-full bg-[#AD314D] hover:bg-[#92263F] text-white text-xs font-bold shadow-sm transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <Check className="w-4 h-4" />
              <span>Save Profile &amp; Calibrate</span>
            </button>
          </div>
        </form>
      )}

      {/* Nutrition, Hormone & Metabolic Engine Card */}
      <div className="p-6 sm:p-8 rounded-3xl bg-white border border-black/[0.08] shadow-sm space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h3 className="text-base font-bold text-[#222222] flex items-center gap-2">
              <Flame className="w-5 h-5 text-amber-500" />
              <span>Hormone Balance & Macro Targets</span>
            </h3>
            <p className="text-xs text-[#4A4A4A] mt-0.5">
              Target calibrated for {userProfile.goal} at {userProfile.weightKg} {unit} body weight.
            </p>
          </div>
          <div className="text-right">
            <span className="text-2xl font-black text-[#222222]">
              {macroPlan.totalCalories}
            </span>
            <span className="text-xs font-semibold text-[#777777] ml-1">kcal / day</span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
          {/* Protein */}
          <div className="p-4 rounded-2xl bg-rose-50/60 border border-rose-100">
            <div className="text-xs uppercase font-bold text-rose-800">Protein</div>
            <div className="text-2xl font-extrabold text-[#AD314D] mt-1">
              {macroPlan.proteinGrams}g
            </div>
            <div className="text-[11px] text-[#4A4A4A] mt-1">
              {(macroPlan.proteinGrams / userProfile.weightKg).toFixed(1)}g per kg bodyweight
            </div>
          </div>

          {/* Carbs */}
          <div className="p-4 rounded-2xl bg-amber-50/60 border border-amber-100">
            <div className="text-xs uppercase font-bold text-amber-800">Carbohydrates</div>
            <div className="text-2xl font-extrabold text-amber-700 mt-1">
              {macroPlan.carbsGrams}g
            </div>
            <div className="text-[11px] text-[#4A4A4A] mt-1">
              High energy glycogen replenishment
            </div>
          </div>

          {/* Fats */}
          <div className="p-4 rounded-2xl bg-indigo-50/60 border border-indigo-100">
            <div className="text-xs uppercase font-bold text-indigo-800">Fats</div>
            <div className="text-2xl font-extrabold text-indigo-700 mt-1">
              {macroPlan.fatGrams}g
            </div>
            <div className="text-[11px] text-[#4A4A4A] mt-1">
              {(macroPlan.fatGrams / userProfile.weightKg).toFixed(1)}g per kg (Endocrine floor)
            </div>
          </div>
        </div>
      </div>

      {/* Firebase Account & Storage Security */}
      <div className="p-6 sm:p-8 rounded-3xl bg-white border border-black/[0.08] shadow-sm space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h3 className="text-base font-bold text-[#222222] flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-emerald-600" />
              <span>Firebase Account &amp; Storage Isolation</span>
            </h3>
            <p className="text-xs text-[#666666] mt-0.5">
              Your profile, workouts, and kinesiology records have strict isolated read/write rules bound to your account ID.
            </p>
          </div>
          {firebaseUser && !firebaseUser.isAnonymous ? (
            <button
              type="button"
              onClick={onSignOut}
              className="px-4 py-2 rounded-full bg-rose-50 hover:bg-rose-100 text-[#AD314D] border border-rose-200 text-xs font-bold shadow-2xs transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <span>Sign Out of Firebase</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={onOpenAuth}
              className="px-4 py-2 rounded-full bg-[#AD314D] hover:bg-[#8C1E37] text-white text-xs font-bold shadow-2xs transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <span>Sign In / Create Account</span>
            </button>
          )}
        </div>

        <div className="p-5 rounded-2xl border border-black/[0.06] bg-[#F8F9FA] grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
          <div>
            <div className="font-bold text-neutral-500 uppercase text-[10px]">Logged In Email</div>
            <div className="font-extrabold text-[#222222] mt-0.5 truncate">
              {firebaseUser?.email || "Not signed in"}
            </div>
          </div>
          <div>
            <div className="font-bold text-neutral-500 uppercase text-[10px]">Firebase Auth UID</div>
            <div className="font-mono text-[11px] font-bold text-indigo-700 mt-0.5 truncate">
              {firebaseUser?.uid || "guest"}
            </div>
          </div>
          <div>
            <div className="font-bold text-neutral-500 uppercase text-[10px]">Storage Isolation</div>
            <div className="font-extrabold text-emerald-700 mt-0.5 flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              <span>Isolated /users/{'{uid}'}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Google Health Platform */}
      <div className="p-6 sm:p-8 rounded-3xl bg-white border border-black/[0.08] shadow-sm space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h3 className="text-base font-bold text-[#222222] flex items-center gap-2">
              <Activity className="w-5 h-5 text-indigo-600" />
              <span>Google Health Platform</span>
            </h3>
            <p className="text-xs text-[#666666] mt-0.5">
              Sync daily steps, resting heart rate, active energy, and sleep duration from your wearable devices.
            </p>
          </div>
          <button
            type="button"
            onClick={onOpenHealthModal}
            className="px-4 py-2 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-sm transition-all self-start sm:self-auto flex items-center gap-1.5"
          >
            <Activity className="w-3.5 h-3.5" />
            <span>Manage Google Health</span>
          </button>
        </div>

        <div className="p-5 rounded-2xl border border-black/[0.06] bg-[#F8F9FA] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className={`w-3.5 h-3.5 rounded-full shrink-0 ${userProfile.connectedApps?.googleHealth ? "bg-emerald-500 ring-4 ring-emerald-100" : "bg-neutral-300"}`} />
            <div>
              <div className="text-xs font-bold text-[#222222]">
                Status: {userProfile.connectedApps?.googleHealth ? "Connected & Active" : "Not Connected"}
              </div>
              <div className="text-[11px] text-[#666666]">
                {userProfile.connectedApps?.googleHealth
                  ? "Authenticated with Google • Daily health telemetry enabled"
                  : "Connect to import steps, heart rate, and sleep metrics"}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onOpenHealthModal}
            className={`px-4 py-2 rounded-full text-xs font-semibold transition-all shrink-0 ${
              userProfile.connectedApps?.googleHealth
                ? "bg-neutral-900 hover:bg-black text-white"
                : "bg-indigo-600 hover:bg-indigo-700 text-white"
            }`}
          >
            {userProfile.connectedApps?.googleHealth ? "View Metrics" : "Connect Google Health"}
          </button>
        </div>
      </div>
    </div>
  );
};
