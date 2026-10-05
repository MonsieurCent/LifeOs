import React, { useState, useEffect } from "react";
import {
  UserProfile,
  UserGender,
  ExperienceLevel,
  FitnessGoal
} from "../types";
import {
  CheckCircle2,
  ChevronRight,
  ChevronLeft,
  Sparkles,
  Heart,
  Dumbbell,
  Flame,
  Activity,
  Calendar,
  Smartphone,
  ShieldCheck,
  Scale,
  Layers,
  Trophy,
  Zap
} from "lucide-react";
import { calculateHormoneAndMacroPlan } from "../utils/fitnessData";

interface OnboardingModalProps {
  isOpen: boolean;
  onComplete?: (updatedProfile: Partial<UserProfile>, selectedProgramId?: string) => void;
  onCompleteOnboarding?: (updatedProfile: Partial<UserProfile>, selectedProgramId?: string) => void;
  onClose: () => void;
  initialProfile?: UserProfile;
  initialProgramId?: string;
}

export const OnboardingModal: React.FC<OnboardingModalProps> = ({
  isOpen,
  onComplete,
  onCompleteOnboarding,
  onClose,
  initialProfile,
  initialProgramId
}) => {
  const [step, setStep] = useState(1);

  // Question 1: Gender
  const [gender, setGender] = useState<UserGender>(initialProfile?.gender || "male");

  // Question 2: Level
  const [level, setLevel] = useState<ExperienceLevel>(initialProfile?.level || "intermediate");

  // Question 3: Goal
  const [goal, setGoal] = useState<FitnessGoal>(initialProfile?.goal || "bulk");

  // Question 4: Days per week
  const [daysPerWeek, setDaysPerWeek] = useState<number>(initialProfile?.daysPerWeek || 4);

  // Step 5: Suggested Program Selection
  const getRecommendedProgramId = (g: FitnessGoal, days: number): string => {
    if (days <= 3 || g === "longevity") return "prog-longevity-joints";
    if (g === "strength") return "prog-strength-power";
    if (g === "shred") return "prog-metabolic-shred";
    return "prog-single-muscle";
  };

  const [selectedProgramId, setSelectedProgramId] = useState<string>(() =>
    initialProgramId || getRecommendedProgramId(initialProfile?.goal || "bulk", initialProfile?.daysPerWeek || 4)
  );

  // Auto-update recommended program when goal or daysPerWeek changes
  useEffect(() => {
    setSelectedProgramId(getRecommendedProgramId(goal, daysPerWeek));
  }, [goal, daysPerWeek]);

  // Reset step to 1 when modal is opened
  useEffect(() => {
    if (isOpen) {
      setStep(1);
      if (initialProfile) {
        if (initialProfile.gender) setGender(initialProfile.gender);
        if (initialProfile.level) setLevel(initialProfile.level);
        if (initialProfile.goal) setGoal(initialProfile.goal);
        if (initialProfile.daysPerWeek) setDaysPerWeek(initialProfile.daysPerWeek);
      }
    }
  }, [isOpen]);

  // Question 6: Apps to sync
  const [appsToSync, setAppsToSync] = useState({
    googleHealth: initialProfile?.connectedApps?.googleHealth ?? true,
    beurer: initialProfile?.connectedApps?.beurer ?? true,
    fatSecret: initialProfile?.connectedApps?.fatSecret ?? true,
    sats: initialProfile?.connectedApps?.sats ?? true
  });

  if (!isOpen) return null;

  const availablePrograms = [
    {
      id: "prog-single-muscle",
      name: "Single Muscle Dedicated Split",
      badge: "Hypertrophy Focus",
      days: 6,
      targetGoal: "bulk" as FitnessGoal,
      description: "Dedicated daily focus on one primary muscle group with high training volume and progressive overload tracking.",
      splitDays: ["Day 1: Back & Rear Delts", "Day 2: Chest", "Day 3: Fullbody & Core", "Day 4: Shoulders", "Day 5: Arms", "Day 6: Legs & Core"]
    },
    {
      id: "prog-strength-power",
      name: "Strength & Power Peak",
      badge: "Pure Strength",
      days: 4,
      targetGoal: "strength" as FitnessGoal,
      description: "Linear periodization focusing on heavy squat, bench, deadlift compound movements with auto-regulated RPE tracking.",
      splitDays: ["Mon: Heavy Squat Power", "Tue: Heavy Bench Drive", "Thu: Heavy Deadlift", "Fri: Overhead Power & Delts"]
    },
    {
      id: "prog-metabolic-shred",
      name: "Metabolic Conditioning & Shred",
      badge: "Fat Loss & Density",
      days: 4,
      targetGoal: "shred" as FitnessGoal,
      description: "High-density training maximizing caloric expenditure while preserving lean muscle mass and metabolic rate.",
      splitDays: ["Mon: Upper Hypertrophy + Intervals", "Tue: Lower Power + Core", "Thu: Push Density", "Fri: Pull & Posterior Chain"]
    },
    {
      id: "prog-longevity-joints",
      name: "Longevity, Joint Health & Mobility",
      badge: "Functional Recomp",
      days: 3,
      targetGoal: "longevity" as FitnessGoal,
      description: "Balanced functional fitness protecting joint cartilage, building core stability, and optimizing metabolic health.",
      splitDays: ["Mon: Full Body Functional A", "Wed: Mobility & Posterior B", "Fri: Core & Structural C"]
    }
  ];

  const recommendedId = getRecommendedProgramId(goal, daysPerWeek);

  const handleFinish = () => {
    const weight = initialProfile?.weightKg || (gender === "male" ? 82 : 64);
    const macroPlan = calculateHormoneAndMacroPlan(gender, goal, weight);

    const payload = {
      gender,
      level,
      goal,
      daysPerWeek,
      connectedApps: appsToSync,
      targetCalories: macroPlan.totalCalories,
      macroSplit: {
        proteinG: macroPlan.proteinGrams,
        carbsG: macroPlan.carbsGrams,
        fatsG: macroPlan.fatGrams
      },
      onboardingCompleted: true
    };

    if (onComplete) onComplete(payload, selectedProgramId);
    if (onCompleteOnboarding) onCompleteOnboarding(payload as any, selectedProgramId);
  };

  const totalSteps = 6;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
      <div className="w-full max-w-xl bg-white rounded-3xl shadow-2xl border border-black/[0.08] overflow-hidden flex flex-col">
        {/* Header with step progress */}
        <div className="px-6 pt-6 pb-4 border-b border-black/[0.06] bg-[#F7F7F6]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-[#AD314D] text-white text-xs font-bold flex items-center justify-center">
                {step}
              </span>
              <span className="text-xs font-semibold uppercase tracking-wider text-[#4A4A4A]">
                {step <= 4 ? `Question ${step} of 4` : step === 5 ? "AI Program Recommendation" : "Health Sync"}
              </span>
            </div>
            <span className="text-[11px] text-[#4A4A4A] font-medium">
              Step {step} of {totalSteps}
            </span>
          </div>

          {/* Progress bar */}
          <div className="w-full h-1.5 bg-black/[0.06] rounded-full mt-3 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-[#AD314D] to-[#E35D7B] transition-all duration-300"
              style={{ width: `${(step / totalSteps) * 100}%` }}
            />
          </div>
        </div>

        {/* Step Content */}
        <div className="p-6 flex-1 min-h-[380px] flex flex-col justify-center">
          {/* STEP 1: GENDER */}
          {step === 1 && (
            <div className="space-y-4 animate-in fade-in duration-200">
              <div className="space-y-1">
                <h2 className="text-xl font-bold text-[#222222]">
                  What is your biological sex?
                </h2>
                <p className="text-xs text-[#4A4A4A] leading-relaxed">
                  Used by our kinesiologist AI to calibrate hormonal fat minimums (testosterone vs progesterone synthesis), recovery curves, and baseline metabolic calculations.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setGender("male")}
                  className={`p-4 rounded-2xl border text-left transition-all flex items-start gap-3.5 cursor-pointer ${
                    gender === "male"
                      ? "border-[#AD314D] bg-rose-50/50 shadow-sm"
                      : "border-black/[0.08] hover:border-black/[0.2] bg-white"
                  }`}
                >
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                    gender === "male" ? "bg-[#AD314D] text-white" : "bg-neutral-100 text-[#4A4A4A]"
                  }`}>
                    <Dumbbell className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="font-semibold text-sm text-[#222222]">Male</div>
                    <div className="text-[11px] text-[#4A4A4A] mt-0.5">
                      Calibrated for testosterone support, high dietary fat baseline (&gt;0.85g/kg), and upper body recovery patterns.
                    </div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setGender("female")}
                  className={`p-4 rounded-2xl border text-left transition-all flex items-start gap-3.5 cursor-pointer ${
                    gender === "female"
                      ? "border-[#AD314D] bg-rose-50/50 shadow-sm"
                      : "border-black/[0.08] hover:border-black/[0.2] bg-white"
                  }`}
                >
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                    gender === "female" ? "bg-[#AD314D] text-white" : "bg-neutral-100 text-[#4A4A4A]"
                  }`}>
                    <Heart className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="font-semibold text-sm text-[#222222]">Female</div>
                    <div className="text-[11px] text-[#4A4A4A] mt-0.5">
                      Calibrated for progesterone &amp; thyroid health, high fat oxidation (&gt;1.0g/kg), and posterior chain focus.
                    </div>
                  </div>
                </button>
              </div>
            </div>
          )}

          {/* STEP 2: EXPERIENCE LEVEL */}
          {step === 2 && (
            <div className="space-y-4 animate-in fade-in duration-200">
              <div className="space-y-1">
                <h2 className="text-xl font-bold text-[#222222]">
                  What is your lifting experience level?
                </h2>
                <p className="text-xs text-[#4A4A4A]">
                  Determines weekly volume volume, progressive overload increments, and RPE targeting.
                </p>
              </div>

              <div className="space-y-2.5 pt-1">
                {[
                  {
                    id: "beginner" as ExperienceLevel,
                    title: "Beginner (< 1 Year)",
                    desc: "Focus on mastering compound exercise technique, neural adaptations, and steady linear progression."
                  },
                  {
                    id: "intermediate" as ExperienceLevel,
                    title: "Intermediate (1 - 3 Years)",
                    desc: "Solid form foundation; ready for periodized loading, undulating rep ranges, and strategic deloads."
                  },
                  {
                    id: "advanced" as ExperienceLevel,
                    title: "Advanced (3+ Years)",
                    desc: "High volume tolerance; requiring targeted auto-regulation, RPE fatigue tracking, and phase potentiation."
                  }
                ].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setLevel(item.id)}
                    className={`w-full p-3.5 rounded-2xl border text-left transition-all flex items-center justify-between cursor-pointer ${
                      level === item.id
                        ? "border-[#AD314D] bg-rose-50/50 shadow-sm"
                        : "border-black/[0.08] hover:border-black/[0.2] bg-white"
                    }`}
                  >
                    <div>
                      <div className="font-semibold text-sm text-[#222222]">{item.title}</div>
                      <div className="text-[11px] text-[#4A4A4A] mt-0.5">{item.desc}</div>
                    </div>
                    {level === item.id && (
                      <CheckCircle2 className="w-5 h-5 text-[#AD314D] shrink-0 ml-3" />
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* STEP 3: PRIMARY GOAL */}
          {step === 3 && (
            <div className="space-y-4 animate-in fade-in duration-200">
              <div className="space-y-1">
                <h2 className="text-xl font-bold text-[#222222]">
                  What is your primary fitness goal?
                </h2>
                <p className="text-xs text-[#4A4A4A]">
                  Our AI Coach personalizes calorie targets, macro ratios, and program suggestions to this objective.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                {[
                  {
                    id: "bulk" as FitnessGoal,
                    icon: Flame,
                    title: "Bulk & Hypertrophy",
                    desc: "Controlled caloric surplus (+300 kcal), optimal protein synthesis & maximum muscle hypertrophy."
                  },
                  {
                    id: "shred" as FitnessGoal,
                    icon: Scale,
                    title: "Shred & Fat Loss",
                    desc: "High-protein deficit (2.4g/kg) to maximize fat loss while preserving lean mass and endocrine health."
                  },
                  {
                    id: "strength" as FitnessGoal,
                    icon: Dumbbell,
                    title: "Pure Strength & Power",
                    desc: "Heavy low-rep compounds (1-5 reps), neuromuscular power, long rest intervals, and peak force output."
                  },
                  {
                    id: "longevity" as FitnessGoal,
                    icon: Heart,
                    title: "Longevity & Health",
                    desc: "Balanced cardiovascular conditioning, joint mobility, metabolic flexibility, and low chronic fatigue."
                  }
                ].map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setGoal(item.id)}
                      className={`p-3.5 rounded-2xl border text-left transition-all flex flex-col justify-between cursor-pointer ${
                        goal === item.id
                          ? "border-[#AD314D] bg-rose-50/50 shadow-sm"
                          : "border-black/[0.08] hover:border-black/[0.2] bg-white"
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1.5">
                        <Icon className={`w-4 h-4 ${goal === item.id ? "text-[#AD314D]" : "text-[#4A4A4A]"}`} />
                        <span className="font-semibold text-xs text-[#222222]">{item.title}</span>
                      </div>
                      <span className="text-[11px] text-[#4A4A4A] leading-relaxed">{item.desc}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* STEP 4: DAYS PER WEEK */}
          {step === 4 && (
            <div className="space-y-4 animate-in fade-in duration-200">
              <div className="space-y-1">
                <h2 className="text-xl font-bold text-[#222222]">
                  How many days can you train per week?
                </h2>
                <p className="text-xs text-[#4A4A4A]">
                  We will curate and generate your suggested routine and progressive overload matrix around this frequency.
                </p>
              </div>

              <div className="grid grid-cols-6 gap-2 pt-3">
                {[2, 3, 4, 5, 6, 7].map((num) => (
                  <button
                    key={num}
                    type="button"
                    onClick={() => setDaysPerWeek(num)}
                    className={`py-4 px-1.5 rounded-2xl border text-center transition-all flex flex-col items-center gap-1 cursor-pointer ${
                      daysPerWeek === num
                        ? "border-[#AD314D] bg-rose-50 shadow-sm ring-1 ring-[#AD314D]"
                        : "border-black/[0.08] hover:border-black/[0.2] bg-white"
                    }`}
                  >
                    <span className="text-xl sm:text-2xl font-bold text-[#222222]">{num}</span>
                    <span className="text-[10px] font-medium text-[#4A4A4A] uppercase tracking-wider">
                      Days
                    </span>
                  </button>
                ))}
              </div>

              <div className="p-3.5 rounded-2xl bg-[#F7F7F6] border border-black/[0.06] text-xs text-[#4A4A4A] flex items-center gap-2 mt-2">
                <Calendar className="w-4 h-4 text-[#AD314D] shrink-0" />
                <span>
                  {daysPerWeek === 2 && "Suggested split: Full Body A & Full Body B."}
                  {daysPerWeek === 3 && "Suggested split: Longevity & Mobility 3-Day or Full Body Foundation."}
                  {daysPerWeek === 4 && "Suggested split: Heavy Strength 4-Day or Metabolic Shred 4-Day."}
                  {daysPerWeek === 5 && "Suggested split: Push / Pull / Legs / Upper / Lower."}
                  {daysPerWeek === 6 && "Suggested split: Single Muscle Dedicated Split (6-Day) or PPL."}
                  {daysPerWeek === 7 && "Suggested split: 6-Day High-Frequency + 1 Active Mobility Recovery."}
                </span>
              </div>
            </div>
          )}

          {/* STEP 5: AI PROGRAM GENERATION & SUGGESTION */}
          {step === 5 && (
            <div className="space-y-4 animate-in fade-in duration-200">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-[#AD314D]/10 text-[#AD314D] flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-[#AD314D]" /> AI Suggested Program
                  </span>
                </div>
                <h2 className="text-xl font-bold text-[#222222]">
                  Select your suggested training program
                </h2>
                <p className="text-xs text-[#4A4A4A]">
                  Based on your target of <strong>{daysPerWeek} days/week</strong> and <strong>{goal.toUpperCase()}</strong> focus, our AI kinesiologist recommends:
                </p>
              </div>

              <div className="space-y-2.5 max-h-[260px] overflow-y-auto pr-1">
                {availablePrograms.map((prog) => {
                  const isRecommended = prog.id === recommendedId;
                  const isSelected = prog.id === selectedProgramId;
                  return (
                    <button
                      key={prog.id}
                      type="button"
                      onClick={() => setSelectedProgramId(prog.id)}
                      className={`w-full p-3.5 rounded-2xl border text-left transition-all relative cursor-pointer ${
                        isSelected
                          ? "border-[#AD314D] bg-rose-50/50 shadow-sm ring-1 ring-[#AD314D]"
                          : isRecommended
                          ? "border-[#AD314D]/40 bg-white hover:bg-neutral-50"
                          : "border-black/[0.08] hover:border-black/[0.2] bg-white opacity-80"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm text-[#222222]">{prog.name}</span>
                          {isRecommended && (
                            <span className="text-[9px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-[#AD314D] text-white">
                              Best Match
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] font-semibold text-[#4A4A4A] bg-neutral-100 px-2 py-0.5 rounded-md">
                          {prog.days} Days / Wk
                        </span>
                      </div>

                      <p className="text-xs text-[#555555] mt-1 leading-relaxed">
                        {prog.description}
                      </p>

                      <div className="flex items-center gap-1.5 mt-2 flex-wrap text-[10px] text-[#4A4A4A]">
                        {prog.splitDays.map((d, dIdx) => (
                          <span key={dIdx} className="bg-black/[0.04] px-1.5 py-0.5 rounded text-[10px]">
                            {d.split(":")[1] ? d.split(":")[1].trim() : d}
                          </span>
                        ))}
                      </div>

                      {isSelected && (
                        <div className="absolute right-3.5 top-3.5">
                          <CheckCircle2 className="w-5 h-5 text-[#AD314D]" />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* STEP 6: APPS TO SYNC */}
          {step === 6 && (
            <div className="space-y-4 animate-in fade-in duration-200">
              <div className="space-y-1">
                <h2 className="text-xl font-bold text-[#222222]">
                  Connect your health apps
                </h2>
                <p className="text-xs text-[#4A4A4A]">
                  Select the services you'd like to integrate for live health metrics. You can modify these in your profile settings at any time.
                </p>
              </div>

              <div className="space-y-2.5 pt-1">
                {[
                  {
                    key: "googleHealth" as const,
                    name: "Google Health",
                    desc: "Daily steps, resting heart rate, sleep duration & active expenditure.",
                    badge: "Official Health Platform"
                  }
                ].map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() =>
                      setAppsToSync((prev) => ({ ...prev, [item.key]: !prev[item.key] }))
                    }
                    className={`w-full p-3.5 rounded-2xl border text-left transition-all flex items-center justify-between cursor-pointer ${
                      appsToSync[item.key]
                        ? "border-emerald-400 bg-emerald-50/40 shadow-sm"
                        : "border-black/[0.08] hover:border-black/[0.2] bg-white opacity-70"
                    }`}
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-xs text-[#222222]">{item.name}</span>
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-black/[0.05] text-[#4A4A4A]">
                          {item.badge}
                        </span>
                      </div>
                      <div className="text-[11px] text-[#4A4A4A] mt-0.5">{item.desc}</div>
                    </div>
                    <div
                      className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 ml-3 transition-colors ${
                        appsToSync[item.key]
                          ? "bg-emerald-600 border-emerald-600 text-white"
                          : "border-neutral-300 bg-white"
                      }`}
                    >
                      {appsToSync[item.key] && <CheckCircle2 className="w-3.5 h-3.5 text-white" />}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="px-6 py-4 border-t border-black/[0.06] bg-[#F7F7F6] flex items-center justify-between">
          {step > 1 ? (
            <button
              type="button"
              onClick={() => setStep((s) => s - 1)}
              className="px-4 py-2 rounded-full border border-black/[0.08] text-xs font-medium text-[#4A4A4A] hover:bg-black/[0.04] transition-colors flex items-center gap-1 cursor-pointer"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              <span>Back</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-full text-xs font-medium text-[#4A4A4A] hover:text-[#222222] cursor-pointer"
            >
              Skip for now
            </button>
          )}

          {step < totalSteps ? (
            <button
              type="button"
              onClick={() => setStep((s) => s + 1)}
              className="px-5 py-2.5 rounded-full bg-[#AD314D] hover:bg-[#92263F] text-white text-xs font-semibold shadow-sm transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <span>{step === 4 ? "Review Suggested Program" : "Next"}</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleFinish}
              className="px-6 py-2.5 rounded-full bg-gradient-to-r from-[#AD314D] to-[#8C1E37] hover:brightness-110 text-white text-xs font-semibold shadow-md transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-300" />
              <span>Launch Program &amp; Complete Setup</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
