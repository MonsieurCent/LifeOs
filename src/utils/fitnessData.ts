import {
  UserProfile,
  SyncedHealthMetrics,
  SupplementEntry,
  ProgressPhoto,
  WeeklyMatrixPlan,
  ExerciseVideo,
  DayOfWeek,
  PlannedExercise,
  PlannedSet,
  SessionFeeling,
  TrainingProgram,
  DailyMealPlan,
  MuscleGroup,
  ExerciseReference,
  WorkoutPlan,
  MatrixDayCell,
  WorkoutSession,
  ExerciseLog,
  ExerciseSet
} from "../types";
import {
  DEFAULT_TIMEZONE,
  DAYS_OF_WEEK,
  DAY_OFFSETS,
  getUtcNowISO,
  formatTimestampInTimezone,
  getTodayDateStr,
  parseLocalDate,
  formatLocalDateISO,
  isValidDateStr,
  normalizeCalendarDate,
  addDaysToDate,
  getDifferenceInDays,
  getWeekStartMonday,
  getWeekBoundaries,
  getMonthBoundaries,
  getDayOfWeekName,
  computeDateForDay,
  getTodayOrCurrentMondayDate,
  CANONICAL_PROGRAM_START_DATE,
  formatFriendlyDate,
  formatShortDate,
  formatRelativeOrFriendly,
  shiftAllMatrixDates
} from "./dateUtils";

export {
  DEFAULT_TIMEZONE,
  DAYS_OF_WEEK,
  DAY_OFFSETS,
  getUtcNowISO,
  formatTimestampInTimezone,
  getTodayDateStr,
  parseLocalDate,
  formatLocalDateISO,
  isValidDateStr,
  normalizeCalendarDate,
  addDaysToDate,
  getDifferenceInDays,
  getWeekStartMonday,
  getWeekBoundaries,
  getMonthBoundaries,
  getDayOfWeekName,
  computeDateForDay,
  getTodayOrCurrentMondayDate,
  CANONICAL_PROGRAM_START_DATE,
  formatFriendlyDate,
  formatShortDate,
  formatRelativeOrFriendly,
  shiftAllMatrixDates
};

export const DEFAULT_USER_PROFILE: UserProfile = {
  id: "user-1",
  name: "David Rootwelt",
  email: "david@rootwelt-norberg.com",
  gender: "male",
  level: "intermediate",
  goal: "bulk",
  daysPerWeek: 4,
  weightKg: 78.1,
  heightCm: 185,
  age: 28,
  instagramHandle: "david_lifts",
  bio: "Training hypertrophy & strength. Targeting 90kg lean bulk then cutting for summer.",
  targetCalories: 2890,
  macroSplit: {
    proteinG: 164,
    carbsG: 374,
    fatsG: 82
  },
  connectedApps: {
    fitbit: true,
    googleHealth: true,
    beurer: true,
    fatSecret: true,
    sats: true
  },
  lastProgramChangeDate: "2026-08-20", // > 2 weeks ago so alterations are allowed if requested
  lastDietChangeDate: "2026-08-20",
  onboardingCompleted: true,
  timezone: "Europe/Oslo",
  createdAt: "2026-06-15"
};

export const INITIAL_HEALTH_METRICS: SyncedHealthMetrics = {
  fitbit: {
    connected: true,
    lastSynced: "Just now",
    restingHeartRate: 56,
    currentPulse: 67,
    hrvRmssd: 64,
    cardioMinutes: 48,
    peakHeartRate: 168,
    sleepScore: 89,
    totalSleepHours: 7.9,
    deepSleepMinutes: 104, // 1h 44m deep sleep (~22%)
    remSleepMinutes: 112,  // 1h 52m REM sleep (~24%)
    lightSleepMinutes: 228, // 3h 48m light sleep (~48%)
    awakeMinutes: 30,      // 30m awake (~6%)
    dailySteps: 12450,
    caloriesBurned: 2890,
    distanceKm: 9.4,
    activeZoneMinutes: 52,
    floorsClimbed: 18,
    spo2Percent: 97.5,
    breathingRate: 13.8,
    skinTempVariation: -0.1
  },
  googleHealth: {
    connected: true,
    lastSynced: "Just now",
    apiProvider: "google_health_api",
    dailySteps: 12450,
    restingHeartRate: 56,
    currentPulse: 67,
    hrvRmssd: 64,
    activeCalories: 640,
    sleepHours: 7.9,
    sleepScore: 89,
    deepSleepMinutes: 104,
    remSleepMinutes: 112,
    lightSleepMinutes: 228,
    awakeMinutes: 30,
    bodyWeightKg: 78.1,
    bodyFatPercent: 14.2,
    spo2Percent: 97.5
  },
  beurer: {
    connected: true,
    lastSynced: "Today, 07:15",
    scaleWeightKg: 78.1,
    bodyFatPercent: 14.2,
    muscleMassPercent: 45.4,
    visceralFatRating: 4,
    bloodPressureSys: 118,
    bloodPressureDia: 74
  },
  fatSecret: {
    connected: true,
    lastSynced: "15 min ago",
    caloriesConsumed: 2850,
    proteinGrams: 184,
    carbsGrams: 340,
    fatGrams: 78,
    waterMl: 3200,
    targetAdherencePercent: 92
  },
  sats: {
    connected: true,
    lastSynced: "Yesterday",
    homeClub: "SATS",
    monthlyVisits: 14,
    lastCheckIn: "Yesterday 17:30 (Leg Day)",
    membershipStatus: "All-Inclusive Member",
    bookedClassesCount: 2
  }
};

export const INITIAL_SUPPLEMENTS: SupplementEntry[] = [
  {
    id: "sup-1",
    name: "Creatine Monohydrate",
    dosage: "5g",
    category: "creatine",
    timeOfDay: "morning",
    taken: true,
    lastTakenDate: "Today",
    streakDays: 42
  },
  {
    id: "sup-2",
    name: "Pre-Workout (Stim-Free / Pump)",
    dosage: "1 Scoop (L-Citrulline + Beta Alanine)",
    category: "pre-workout",
    timeOfDay: "pre-workout",
    taken: false,
    streakDays: 12
  },
  {
    id: "sup-3",
    name: "Vitamin D3 + K2",
    dosage: "4000 IU + 100mcg",
    category: "vitamins",
    timeOfDay: "morning",
    taken: true,
    lastTakenDate: "Today",
    streakDays: 68
  },
  {
    id: "sup-4",
    name: "Omega-3 Fish Oil (High EPA/DHA)",
    dosage: "2000mg (1000mg EPA)",
    category: "omega",
    timeOfDay: "morning",
    taken: true,
    lastTakenDate: "Today",
    streakDays: 35
  },
  {
    id: "sup-5",
    name: "Magnesium Glycinate",
    dosage: "400mg Elemental",
    category: "minerals",
    timeOfDay: "evening",
    taken: false,
    streakDays: 29
  },
  {
    id: "sup-6",
    name: "Zinc Picolinate",
    dosage: "15mg",
    category: "minerals",
    timeOfDay: "evening",
    taken: false,
    streakDays: 20
  }
];

export const INITIAL_PROGRESS_PHOTOS: ProgressPhoto[] = [
  {
    id: "photo-1",
    date: "2026-06-01",
    phase: "before",
    weightKg: 81.2,
    bodyFatPercent: 16.5,
    photoUrl: "https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?w=600&auto=format&fit=crop&q=80",
    notes: "Baseline start of hypertrophy cycle. Starting strength block."
  },
  {
    id: "photo-2",
    date: "2026-09-01",
    phase: "after",
    weightKg: 84.5,
    bodyFatPercent: 14.8,
    photoUrl: "https://images.unsplash.com/photo-1583454110551-21f2fa2afe61?w=600&auto=format&fit=crop&q=80",
    notes: "+3.3kg scale gain with visible lat and deltoid density increase."
  }
];

export const EXERCISE_VIDEOS: ExerciseVideo[] = [
  {
    id: "vid-bench",
    name: "Barbell Bench Press",
    muscleGroup: "Chest",
    videoUrl: "https://www.youtube-nocookie.com/embed/rT7DgCr-3pg",
    thumbnailUrl: "https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?w=600&auto=format&fit=crop&q=80",
    cues: [
      "Retract and depress scapulae into the bench.",
      "Drive feet firmly through the floor to stabilize pelvis.",
      "Lower the bar to mid-sternum with forearms vertically stacked under wrists.",
      "Press through the elbows in a subtle J-curve trajectory."
    ],
    commonMistakes: [
      "Flaring elbows out at 90 degrees (keep them at ~45-70 degrees).",
      "Bouncing bar off the ribcage.",
      "Lifting hips off the bench surface."
    ]
  },
  {
    id: "vid-incline-db",
    name: "Incline Dumbbell Press",
    muscleGroup: "Chest",
    videoUrl: "https://www.youtube-nocookie.com/embed/8iPEnn-ltC8",
    thumbnailUrl: "https://images.unsplash.com/photo-1583454110551-21f2fa2afe61?w=600&auto=format&fit=crop&q=80",
    cues: [
      "Set bench to 30° incline for optimal clavicular head fiber alignment.",
      "Tuck shoulder blades firmly down and back.",
      "Descend with control until thumbs touch upper chest line.",
      "Converge dumbbells at top without banging them together."
    ],
    commonMistakes: [
      "Setting bench angle too steep (>45° shifts load to anterior delts).",
      "Cutting range of motion short at the bottom."
    ]
  },
  {
    id: "vid-lat-pulldown",
    name: "Lat Pulldowns (Plate / Cable)",
    muscleGroup: "Back",
    videoUrl: "https://www.youtube-nocookie.com/embed/CAwf7n6Luuc",
    thumbnailUrl: "https://images.unsplash.com/photo-1605296867304-46d5465a13f1?w=600&auto=format&fit=crop&q=80",
    cues: [
      "Grip slightly outside shoulder width with palms facing away or neutral.",
      "Lean back slightly (10-15°) from the hips, not lumbar spine.",
      "Initiate the pull by pulling shoulder blades down and back.",
      "Drive elbows straight down towards your back pockets."
    ],
    commonMistakes: [
      "Swinging torso violently for momentum.",
      "Pulling bar behind neck which stresses rotator cuff."
    ]
  },
  {
    id: "vid-barbell-squat",
    name: "Barbell Back Squat",
    muscleGroup: "Legs",
    videoUrl: "https://www.youtube-nocookie.com/embed/bEv6CCg2BC8",
    thumbnailUrl: "https://images.unsplash.com/photo-1517838277536-f5f99be501cd?w=600&auto=format&fit=crop&q=80",
    cues: [
      "Create 360-degree intra-abdominal pressure (Valsalva).",
      "Root tripod foot pressure (big toe, pinky toe, heel).",
      "Break at knees and hips simultaneously, driving knees out in line with toes.",
      "Maintain neutral cervical spine and proud chest."
    ],
    commonMistakes: [
      "Knees caving inward (valgus collapse).",
      "Rising on toes due to poor ankle dorsiflexion."
    ]
  },
  {
    id: "vid-romanian-deadlift",
    name: "Romanian Deadlift (RDL)",
    muscleGroup: "Legs",
    videoUrl: "https://www.youtube-nocookie.com/embed/JCXUYuzwNrM",
    thumbnailUrl: "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=600&auto=format&fit=crop&q=80",
    cues: [
      "Soft unlock at knees, then push hips straight back into a deep hinge.",
      "Keep bar shaving down thighs and shins.",
      "Stop when hamstrings are under maximum stretch without rounding lower back.",
      "Drive hips forward to stand tall and contract glutes."
    ],
    commonMistakes: [
      "Turning it into a squat by bending knees excessively.",
      "Hyperextending spine at the top."
    ]
  },
  {
    id: "vid-overhead-press",
    name: "Overhead Barbell Press",
    muscleGroup: "Shoulders",
    videoUrl: "https://www.youtube-nocookie.com/embed/2yjwXTZQDDI",
    thumbnailUrl: "https://images.unsplash.com/photo-1581009146145-b5ef050c2e1e?w=600&auto=format&fit=crop&q=80",
    cues: [
      "Squeeze glutes and brace abs to lock ribcage down.",
      "Forearms perpendicular to floor under the bar.",
      "Move head back slightly to clear path, press vertical, then move head through window."
    ],
    commonMistakes: [
      "Excessive lumbar arching due to weak abdominal brace.",
      "Pressing bar forward away from center of gravity."
    ]
  }
];

// ============================================================================
// CENTRALIZED EXERCISE LIBRARY & CUSTOM EXERCISE MANAGEMENT SYSTEM
// ============================================================================

export const MASTER_EXERCISE_CATALOG: ExerciseReference[] = [
  { name: "Barbell Bench Press", muscleGroup: "Chest", defaultIncrement: 2.5 },
  { name: "Incline DB Chest Press", muscleGroup: "Chest", defaultIncrement: 2.0 },
  { name: "Flat chest press machine", muscleGroup: "Chest", defaultIncrement: 2.5 },
  { name: "Decline Chest Press", muscleGroup: "Chest", defaultIncrement: 2.5 },
  { name: "Cable Flies", muscleGroup: "Chest", defaultIncrement: 1.25 },
  { name: "Low to High Cable flies", muscleGroup: "Chest", defaultIncrement: 1.25 },
  { name: "Pec Dec", muscleGroup: "Chest", defaultIncrement: 2.5 },
  { name: "Pulldowns 8-12 Plate machine", muscleGroup: "Back", defaultIncrement: 5.0 },
  { name: "Chest-supported rows 8-12", muscleGroup: "Back", defaultIncrement: 2.5 },
  { name: "T-bar row 8-10", muscleGroup: "Back", defaultIncrement: 2.5 },
  { name: "Single-Arm Cable Pulldown 8-12", muscleGroup: "Back", defaultIncrement: 2.5 },
  { name: "Straight bar pulldown 8-12", muscleGroup: "Back", defaultIncrement: 1.25 },
  { name: "Face Pulls 10-15", muscleGroup: "Shoulders", defaultIncrement: 1.25 },
  { name: "Barbell Back Squat", muscleGroup: "Legs", defaultIncrement: 5.0 },
  { name: "Romanian Deadlift", muscleGroup: "Legs", defaultIncrement: 5.0 },
  { name: "Conventional Deadlift", muscleGroup: "Back", defaultIncrement: 5.0 },
  { name: "Barbell Overhead Press", muscleGroup: "Shoulders", defaultIncrement: 2.5 },
  { name: "Weighted Pull-Up", muscleGroup: "Back", defaultIncrement: 2.5 },
  { name: "Standing Dumbbell Lateral Raise", muscleGroup: "Shoulders", defaultIncrement: 1.0 },
  { name: "Barbell Bicep Curl", muscleGroup: "Arms", defaultIncrement: 2.5 },
  { name: "Triceps Rope Pushdown", muscleGroup: "Arms", defaultIncrement: 1.25 }
];

export function getStoredCustomExercises(): ExerciseReference[] {
  try {
    const raw = localStorage.getItem("pulse_custom_exercises");
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {
    console.error("Failed to read custom exercises", e);
  }
  return [];
}

export function saveCustomExerciseToCatalog(newEx: ExerciseReference): ExerciseReference[] {
  const existing = getStoredCustomExercises();
  const trimmedName = newEx.name.trim();
  const index = existing.findIndex((e) => e.name.toLowerCase() === trimmedName.toLowerCase());
  let updated: ExerciseReference[];

  const exObj: ExerciseReference = {
    name: trimmedName,
    muscleGroup: newEx.muscleGroup || "Chest",
    defaultIncrement: newEx.defaultIncrement || 2.5,
    isCustom: true
  };

  if (index >= 0) {
    updated = existing.map((e, i) => (i === index ? exObj : e));
  } else {
    updated = [exObj, ...existing];
  }

  try {
    localStorage.setItem("pulse_custom_exercises", JSON.stringify(updated));
  } catch (e) {
    console.error("Failed to save custom exercise", e);
  }
  return updated;
}

export function deleteCustomExerciseFromCatalog(exerciseName: string): ExerciseReference[] {
  const existing = getStoredCustomExercises();
  const updated = existing.filter((e) => e.name.toLowerCase() !== exerciseName.toLowerCase());
  try {
    localStorage.setItem("pulse_custom_exercises", JSON.stringify(updated));
  } catch (e) {
    console.error("Failed to delete custom exercise", e);
  }
  return updated;
}

export function getFullExerciseCatalog(): ExerciseReference[] {
  const custom = getStoredCustomExercises();
  const builtInNames = new Set(MASTER_EXERCISE_CATALOG.map((e) => e.name.toLowerCase()));
  const uniqueCustom = custom.filter((c) => !builtInNames.has(c.name.toLowerCase()));
  return [...uniqueCustom, ...MASTER_EXERCISE_CATALOG];
}

export const INITIAL_SESSION_FEELINGS: SessionFeeling[] = [
  {
    workoutId: "mock-1",
    rating: 4,
    soreness: 2,
    rpeAverage: 8,
    energyLevel: "high",
    notes: "Felt strong on incline presses. Good mind-muscle connection in upper chest.",
    loggedAt: "2026-09-07"
  },
  {
    workoutId: "mock-2",
    rating: 3,
    soreness: 4,
    rpeAverage: 8.5,
    energyLevel: "medium",
    notes: "Quads were burning on hack squats. Needed 3 min rest on final set.",
    loggedAt: "2026-09-05"
  },
  {
    workoutId: "mock-3",
    rating: 4,
    soreness: 2,
    rpeAverage: 7.5,
    energyLevel: "high",
    notes: "Lats engaged smoothly on pulldowns. Forearms slightly pumped.",
    loggedAt: "2026-09-03"
  }
];

export function isDeloadWeek(w: number, plan?: WeeklyMatrixPlan): boolean {
  if (plan && typeof plan.isDeload === "boolean") {
    return plan.isDeload;
  }
  if (plan?.weekTheme?.toLowerCase().includes("deload")) {
    return true;
  }
  return false;
}

export function getWeekTheme(w: number, plan?: WeeklyMatrixPlan): string {
  if (isDeloadWeek(w, plan)) {
    return `Week ${w} Deload (Active Recovery)`;
  }
  if (w === 1) return "Cycle 1: Base Accumulation";
  if (w === 2) return "Cycle 1: Volume Overload";
  if (w === 3) return "Cycle 1: Intensity Spike";
  if (w === 4) return "Cycle 1: Peak Loading";
  if (w === 5) return "Cycle 1: Progression Phase";
  if (w === 6) return "Cycle 2: Intensification";
  if (w === 7) return "Cycle 2: Progressive Overload";
  if (w === 8) return "Cycle 2: Strength Peak";
  return `Training Week ${w}`;
}

// Generates an initial 5-week Matrix Plan (Cycle 1: Weeks 1-4 + Week 5 Deload)
export function createInitialMatrixPlan(totalWeeks: number = 8, startDateStr?: string): WeeklyMatrixPlan[] {
  const cycleBaseDate = startDateStr && isValidDateStr(startDateStr) ? startDateStr : CANONICAL_PROGRAM_START_DATE;
  const week1Days: Record<DayOfWeek, { title: string; isRest: boolean; muscle: string; exercises: PlannedExercise[] }> = {
    Monday: {
      title: "Day 1 (Back & Rear Delts)",
      isRest: false,
      muscle: "Back & Rear Delts",
      exercises: [
        { exerciseName: "Pulldowns 8-12 Plate machine", muscleGroup: "Back", targetSets: 3, targetReps: "8-12", targetWeight: 121, sets: [{ setNumber: 1, weight: 121, reps: 12 }, { setNumber: 2, weight: 121, reps: 11 }, { setNumber: 3, weight: 121, reps: 11 }], warmupNotes: "Warm Up 2 sets" },
        { exerciseName: "Chest-supported rows 8-12", muscleGroup: "Back", targetSets: 3, targetReps: "8-12", targetWeight: 28, sets: [{ setNumber: 1, weight: 28, reps: 12 }, { setNumber: 2, weight: 28, reps: 12 }, { setNumber: 3, weight: 28, reps: 13 }], warmupNotes: "Warm Up" },
        { exerciseName: "T-bar row 8-10", muscleGroup: "Back", targetSets: 3, targetReps: "8-10", targetWeight: 35, sets: [{ setNumber: 1, weight: 30, reps: 12 }, { setNumber: 2, weight: 35, reps: 12 }, { setNumber: 3, weight: 40, reps: 8 }], warmupNotes: "Warm Up" },
        { exerciseName: "Single-Arm Cable Pulldown 8-12", muscleGroup: "Back", targetSets: 3, targetReps: "8-12", targetWeight: 29, sets: [{ setNumber: 1, weight: 29, reps: 12 }, { setNumber: 2, weight: 29, reps: 12 }, { setNumber: 3, weight: 29, reps: 12 }], warmupNotes: "Warm Up" },
        { exerciseName: "Straight bar pulldown 8-12", muscleGroup: "Back", targetSets: 3, targetReps: "8-12", targetWeight: 36, sets: [{ setNumber: 1, weight: 33, reps: 14 }, { setNumber: 2, weight: 36, reps: 11 }, { setNumber: 3, weight: 36, reps: 9 }], warmupNotes: "Warm Up" },
        { exerciseName: "Face Pulls 10-15", muscleGroup: "Shoulders", targetSets: 3, targetReps: "10-15", targetWeight: 35, sets: [{ setNumber: 1, weight: 35, reps: 12 }, { setNumber: 2, weight: 35, reps: 12 }, { setNumber: 3, weight: 35, reps: 12 }], warmupNotes: "Warm Up" },
        { exerciseName: "Chest supported shrugs", muscleGroup: "Back", targetSets: 3, targetReps: "12-14", targetWeight: 26, sets: [{ setNumber: 1, weight: 26, reps: 12 }, { setNumber: 2, weight: 26, reps: 14 }, { setNumber: 3, weight: 26, reps: 13 }], warmupNotes: "Warm Up" }
      ]
    },
    Tuesday: {
      title: "Day 2 (Chest)",
      isRest: false,
      muscle: "Chest",
      exercises: [
        { exerciseName: "Incline DB Chest Press", muscleGroup: "Chest", targetSets: 3, targetReps: "10-12", targetWeight: 32, sets: [{ setNumber: 1, weight: 32, reps: 12 }, { setNumber: 2, weight: 32, reps: 10 }, { setNumber: 3, weight: 32, reps: 12 }], warmupNotes: "Warm Up" },
        { exerciseName: "Flat chest press machine", muscleGroup: "Chest", targetSets: 3, targetReps: "8-10", targetWeight: 40, sets: [{ setNumber: 1, weight: 40, reps: 8 }, { setNumber: 2, weight: 40, reps: 10 }, { setNumber: 3, weight: 40, reps: 9 }], warmupNotes: "Warm Up" },
        { exerciseName: "Decline Chest Press", muscleGroup: "Chest", targetSets: 3, targetReps: "12", targetWeight: 70, sets: [{ setNumber: 1, weight: 70, reps: 12 }, { setNumber: 2, weight: 70, reps: 12 }, { setNumber: 3, weight: 70, reps: 12 }], warmupNotes: "Warm Up" },
        { exerciseName: "Cable Flies", muscleGroup: "Chest", targetSets: 3, targetReps: "10-13", targetWeight: 35, sets: [{ setNumber: 1, weight: 35, reps: 13 }, { setNumber: 2, weight: 35, reps: 10 }, { setNumber: 3, weight: 35, reps: 10 }], warmupNotes: "Warm Up" },
        { exerciseName: "Low to High Cable flies", muscleGroup: "Chest", targetSets: 3, targetReps: "10-14", targetWeight: 20, sets: [{ setNumber: 1, weight: 20, reps: 14 }, { setNumber: 2, weight: 20, reps: 12 }, { setNumber: 3, weight: 20, reps: 10 }], warmupNotes: "Warm Up" },
        { exerciseName: "Pec Dec", muscleGroup: "Chest", targetSets: 3, targetReps: "9-14", targetWeight: 70, sets: [{ setNumber: 1, weight: 65, reps: 14 }, { setNumber: 2, weight: 70, reps: 11 }, { setNumber: 3, weight: 70, reps: 9 }], warmupNotes: "Warm Up" }
      ]
    },
    Wednesday: {
      title: "Day 3 (Fullbody & Core)",
      isRest: false,
      muscle: "Full Body",
      exercises: [
        { exerciseName: "Chins", muscleGroup: "Back", targetSets: 4, targetReps: "8-12", targetWeight: 0, sets: [{ setNumber: 1, weight: 0, reps: 12 }, { setNumber: 2, weight: 0, reps: 10 }, { setNumber: 3, weight: 0, reps: 8 }], warmupNotes: "BW / Warmup" },
        { exerciseName: "Dips", muscleGroup: "Chest", targetSets: 3, targetReps: "8-12", targetWeight: 0, sets: [{ setNumber: 1, weight: 0, reps: 12 }, { setNumber: 2, weight: 0, reps: 10 }, { setNumber: 3, weight: 0, reps: 8 }], warmupNotes: "BW / Warmup" },
        { exerciseName: "Hang leg raise", muscleGroup: "Core", targetSets: 3, targetReps: "8-12", targetWeight: 0, sets: [{ setNumber: 1, weight: 0, reps: 12 }, { setNumber: 2, weight: 0, reps: 10 }, { setNumber: 3, weight: 0, reps: 8 }], warmupNotes: "BW / Warmup" },
        { exerciseName: "Abcrunch", muscleGroup: "Core", targetSets: 3, targetReps: "8-12", targetWeight: 59, sets: [{ setNumber: 1, weight: 59, reps: 12 }, { setNumber: 2, weight: 59, reps: 10 }, { setNumber: 3, weight: 59, reps: 8 }], warmupNotes: "BW / Warmup" },
        { exerciseName: "Abdominal", muscleGroup: "Core", targetSets: 3, targetReps: "8-12", targetWeight: 50, sets: [{ setNumber: 1, weight: 50, reps: 12 }, { setNumber: 2, weight: 50, reps: 10 }, { setNumber: 3, weight: 50, reps: 8 }], warmupNotes: "BW / Warmup" }
      ]
    },
    Thursday: {
      title: "Day 4 (Shoulders)",
      isRest: false,
      muscle: "Shoulders",
      exercises: [
        { exerciseName: "Overhead Press", muscleGroup: "Shoulders", targetSets: 3, targetReps: "8-10", targetWeight: 26, sets: [{ setNumber: 1, weight: 26, reps: 10 }, { setNumber: 2, weight: 26, reps: 9 }, { setNumber: 3, weight: 26, reps: 8 }], warmupNotes: "Warm Up" },
        { exerciseName: "Cabel Lateral Raise", muscleGroup: "Shoulders", targetSets: 3, targetReps: "10-12", targetWeight: 8.8, sets: [{ setNumber: 1, weight: 8.8, reps: 12 }, { setNumber: 2, weight: 8.8, reps: 11 }, { setNumber: 3, weight: 8.8, reps: 10 }], warmupNotes: "Warm Up" },
        { exerciseName: "Upright Row", muscleGroup: "Shoulders", targetSets: 3, targetReps: "11-13", targetWeight: 33, sets: [{ setNumber: 1, weight: 33, reps: 13 }, { setNumber: 2, weight: 33, reps: 12 }, { setNumber: 3, weight: 33, reps: 11 }], warmupNotes: "Warm Up" },
        { exerciseName: "Reversed Pec Deck", muscleGroup: "Shoulders", targetSets: 3, targetReps: "12", targetWeight: 61, sets: [{ setNumber: 1, weight: 61, reps: 12 }, { setNumber: 2, weight: 61, reps: 12 }, { setNumber: 3, weight: 61, reps: 12 }], warmupNotes: "Warm Up" },
        { exerciseName: "Laying Delt Raise", muscleGroup: "Shoulders", targetSets: 3, targetReps: "8-10", targetWeight: 7.9, sets: [{ setNumber: 1, weight: 7.9, reps: 10 }, { setNumber: 2, weight: 7.9, reps: 9 }, { setNumber: 3, weight: 7.9, reps: 8 }], warmupNotes: "Warm Up" },
        { exerciseName: "Shrugs", muscleGroup: "Shoulders", targetSets: 3, targetReps: "13-16", targetWeight: 34, sets: [{ setNumber: 1, weight: 34, reps: 16 }, { setNumber: 2, weight: 34, reps: 14 }, { setNumber: 3, weight: 34, reps: 13 }], warmupNotes: "Warm Up" }
      ]
    },
    Friday: {
      title: "Day 5 (Arms)",
      isRest: false,
      muscle: "Arms",
      exercises: [
        { exerciseName: "spider curls", muscleGroup: "Arms", targetSets: 3, targetReps: "10-12", targetWeight: 32.5, sets: [{ setNumber: 1, weight: 32.5, reps: 12 }, { setNumber: 2, weight: 32.5, reps: 11 }, { setNumber: 3, weight: 32.5, reps: 10 }], warmupNotes: "Warm Up" },
        { exerciseName: "Laying DB Curls", muscleGroup: "Arms", targetSets: 3, targetReps: "9-11", targetWeight: 16, sets: [{ setNumber: 1, weight: 16, reps: 11 }, { setNumber: 2, weight: 16, reps: 10 }, { setNumber: 3, weight: 16, reps: 9 }], warmupNotes: "Warm Up" },
        { exerciseName: "Bayesian Cable Curl", muscleGroup: "Arms", targetSets: 3, targetReps: "12", targetWeight: 12.5, sets: [{ setNumber: 1, weight: 12.5, reps: 12 }, { setNumber: 2, weight: 12.5, reps: 12 }, { setNumber: 3, weight: 12.5, reps: 12 }], warmupNotes: "Warm Up" },
        { exerciseName: "BFR EZ Bench", muscleGroup: "Arms", targetSets: 4, targetReps: "12-30", targetWeight: 18, sets: [{ setNumber: 1, weight: 18, reps: 30 }, { setNumber: 2, weight: 18, reps: 20 }, { setNumber: 3, weight: 18, reps: 15 }, { setNumber: 4, weight: 18, reps: 12 }], warmupNotes: "Warm Up" },
        { exerciseName: "Overhead Cable", muscleGroup: "Arms", targetSets: 3, targetReps: "9-14", targetWeight: 55, sets: [{ setNumber: 1, weight: 55, reps: 14 }, { setNumber: 2, weight: 55, reps: 11 }, { setNumber: 3, weight: 55, reps: 9 }], warmupNotes: "Warm Up" },
        { exerciseName: "Pushdown Cambered Bar", muscleGroup: "Arms", targetSets: 3, targetReps: "11-15", targetWeight: 75, sets: [{ setNumber: 1, weight: 75, reps: 15 }, { setNumber: 2, weight: 75, reps: 13 }, { setNumber: 3, weight: 75, reps: 11 }], warmupNotes: "Warm Up" },
        { exerciseName: "Kick Back Cable", muscleGroup: "Arms", targetSets: 3, targetReps: "10-12", targetWeight: 21.5, sets: [{ setNumber: 1, weight: 21.5, reps: 12 }, { setNumber: 2, weight: 21.5, reps: 11 }, { setNumber: 3, weight: 21.5, reps: 10 }], warmupNotes: "Warm Up" },
        { exerciseName: "BFR Rope Push down", muscleGroup: "Arms", targetSets: 4, targetReps: "12-30", targetWeight: 25, sets: [{ setNumber: 1, weight: 25, reps: 30 }, { setNumber: 2, weight: 25, reps: 20 }, { setNumber: 3, weight: 25, reps: 15 }, { setNumber: 4, weight: 25, reps: 12 }], warmupNotes: "Warm Up" }
      ]
    },
    Saturday: {
      title: "Day 6 (Legs & Core)",
      isRest: false,
      muscle: "Legs",
      exercises: [
        { exerciseName: "Leg Extensions", muscleGroup: "Legs", targetSets: 3, targetReps: "8-12", targetWeight: 110, sets: [{ setNumber: 1, weight: 110, reps: 12 }, { setNumber: 2, weight: 110, reps: 10 }, { setNumber: 3, weight: 110, reps: 8 }], warmupNotes: "Warm Up" },
        { exerciseName: "Leg Curls", muscleGroup: "Legs", targetSets: 4, targetReps: "12-15", targetWeight: 33, sets: [{ setNumber: 1, weight: 33, reps: 15 }, { setNumber: 2, weight: 33, reps: 14 }, { setNumber: 3, weight: 33, reps: 13 }, { setNumber: 4, weight: 33, reps: 12 }], warmupNotes: "Warm Up" },
        { exerciseName: "Hip Adductor", muscleGroup: "Legs", targetSets: 4, targetReps: "15-20", targetWeight: 20, sets: [{ setNumber: 1, weight: 20, reps: 20 }, { setNumber: 2, weight: 20, reps: 18 }, { setNumber: 3, weight: 20, reps: 16 }, { setNumber: 4, weight: 20, reps: 15 }], warmupNotes: "Warm Up" },
        { exerciseName: "Hip Abductor", muscleGroup: "Legs", targetSets: 3, targetReps: "10-15", targetWeight: 25, sets: [{ setNumber: 1, weight: 25, reps: 15 }, { setNumber: 2, weight: 25, reps: 12 }, { setNumber: 3, weight: 25, reps: 10 }], warmupNotes: "Warm Up" },
        { exerciseName: "Hang legraises", muscleGroup: "Core", targetSets: 3, targetReps: "15-20", targetWeight: 0, sets: [{ setNumber: 1, weight: 0, reps: 20 }, { setNumber: 2, weight: 0, reps: 18 }, { setNumber: 3, weight: 0, reps: 15 }], warmupNotes: "Warm Up" },
        { exerciseName: "Ab Crunches", muscleGroup: "Core", targetSets: 3, targetReps: "13-15", targetWeight: 70, sets: [{ setNumber: 1, weight: 70, reps: 15 }, { setNumber: 2, weight: 70, reps: 14 }, { setNumber: 3, weight: 70, reps: 13 }], warmupNotes: "Warm Up" },
        { exerciseName: "V-up", muscleGroup: "Core", targetSets: 4, targetReps: "15-30", targetWeight: 0, sets: [{ setNumber: 1, weight: 0, reps: 30 }, { setNumber: 2, weight: 0, reps: 25 }, { setNumber: 3, weight: 0, reps: 20 }, { setNumber: 4, weight: 0, reps: 15 }], warmupNotes: "Warm Up" }
      ]
    },
    Sunday: {
      title: "Day 7 (Rest & Recovery)",
      isRest: true,
      muscle: "Rest",
      exercises: []
    }
  };

  const weeks: WeeklyMatrixPlan[] = [];
  let trainingWeekCount = 0;

  for (let w = 1; w <= totalWeeks; w++) {
    const isDeload = isDeloadWeek(w);
    if (!isDeload) {
      trainingWeekCount++;
    }

    const overloadMultiplier = isDeload
      ? 0.85
      : 1 + (trainingWeekCount - 1) * 0.025; // 2.5% progression per training week

    const daysRecord: Record<DayOfWeek, any> = {} as any;

    for (const day of DAYS_OF_WEEK) {
      const template = week1Days[day];
      const cellDate = computeDateForDay(cycleBaseDate, w, day);
      daysRecord[day] = {
        day,
        date: cellDate,
        workoutTitle: template.title,
        isRestDay: template.isRest,
        targetMuscleGroup: template.muscle,
        notes: isDeload
          ? "Deload Week: 50% volume, 85% load, CNS & joint recovery"
          : w === 12
          ? "Cycle 3 Final Peak Overload (Peak training week - NOT a deload!)"
          : `Week ${w} progressive overload target (+${((overloadMultiplier - 1) * 100).toFixed(1)}%)`,
        exercises: template.exercises.map((ex) => {
          const calcWeight = ex.targetWeight
            ? Math.round(ex.targetWeight * overloadMultiplier * 2) / 2
            : undefined;
          const calcSets = isDeload ? Math.max(2, ex.targetSets - 1) : ex.targetSets;

          const scaledSets = ex.sets
            ? (isDeload ? ex.sets.slice(0, calcSets) : ex.sets).map((s) => ({
                ...s,
                weight: s.weight ? Math.round(s.weight * overloadMultiplier * 2) / 2 : calcWeight
              }))
            : undefined;

          return {
            ...ex,
            targetWeight: calcWeight,
            targetSets: calcSets,
            sets: scaledSets
          };
        })
      };
    }

    weeks.push({
      weekNumber: w,
      weekTheme: getWeekTheme(w),
      startDate: computeDateForDay(cycleBaseDate, w, "Monday"),
      days: daysRecord
    });
  }

  return weeks;
}

// Auto-fill weeks 2..N from Week 1 with customized progressive overload
// Cycle rule: Deload happens after 4 weeks of training:
// Week 5 is Deload (post 4-week cycle 1)
// Week 9 is Deload (post 4-week cycle 2)
// Week 12 is PEAK training (NOT deload!)
// Week 13 is Deload (post 4-week cycle 3)
export function autoFillWeeksFromWeek1(
  week1: WeeklyMatrixPlan,
  totalWeeks: number = 5,
  progressionRatePercent: number = 2.5
): WeeklyMatrixPlan[] {
  const baseStartDate = week1.startDate || "2026-09-14";
  const updatedWeek1: WeeklyMatrixPlan = {
    ...week1,
    startDate: baseStartDate,
    days: { ...week1.days }
  };
  for (const day of DAYS_OF_WEEK) {
    if (updatedWeek1.days[day]) {
      updatedWeek1.days[day] = {
        ...updatedWeek1.days[day],
        date: updatedWeek1.days[day].date || computeDateForDay(baseStartDate, 1, day)
      };
    }
  }

  const result: WeeklyMatrixPlan[] = [updatedWeek1];
  let trainingWeekCount = 1; // Week 1 is training week 1

  for (let w = 2; w <= totalWeeks; w++) {
    const isDeload = isDeloadWeek(w);
    if (!isDeload) {
      trainingWeekCount++;
    }

    const overloadMultiplier = isDeload
      ? 0.85
      : 1 + (trainingWeekCount - 1) * (progressionRatePercent / 100);

    const daysRecord: Record<DayOfWeek, any> = {} as any;

    for (const day of DAYS_OF_WEEK) {
      const sourceDay = week1.days[day];
      const calcSets = (exTargetSets: number) =>
        isDeload ? Math.max(2, exTargetSets - 1) : exTargetSets;
      const cellDate = computeDateForDay(baseStartDate, w, day);

      daysRecord[day] = {
        day,
        date: cellDate,
        workoutTitle: sourceDay.workoutTitle,
        isRestDay: sourceDay.isRestDay,
        targetMuscleGroup: sourceDay.targetMuscleGroup,
        notes: isDeload
          ? "Strategic Deload (Reduced Volume & Weight for CNS recovery)"
          : w === 12
          ? "Cycle 3 Final Peak Overload (Peak training week - NOT deload!)"
          : `Week ${w} (+${((overloadMultiplier - 1) * 100).toFixed(1)}% overload)`,
        exercises: sourceDay.exercises.map((ex) => {
          const newTargetSets = calcSets(ex.targetSets);
          const newTargetWeight = ex.targetWeight
            ? Math.round(ex.targetWeight * overloadMultiplier * 2) / 2
            : undefined;

          // Scale individual sets as well so set-by-set grid has exact values
          const newSets = ex.sets
            ? (isDeload ? ex.sets.slice(0, newTargetSets) : ex.sets).map((s) => ({
                ...s,
                weight: s.weight
                  ? Math.round(s.weight * overloadMultiplier * 2) / 2
                  : newTargetWeight
              }))
            : undefined;

          return {
            ...ex,
            targetWeight: newTargetWeight,
            targetSets: newTargetSets,
            sets: newSets
          };
        })
      };
    }

    result.push({
      weekNumber: w,
      weekTheme: getWeekTheme(w),
      startDate: computeDateForDay(baseStartDate, w, "Monday"),
      days: daysRecord
    });
  }

  return result;
}

import { calculateHormoneAndMacroPlan } from "./calculations";
export { calculateHormoneAndMacroPlan };

export const DEFAULT_SUPPLEMENT_CATEGORIES: string[] = [
  "creatine",
  "pre-workout",
  "vitamins",
  "minerals",
  "omega",
  "adaptogen",
  "nootropics",
  "joint health",
  "electrolytes",
  "sleep aid"
];

export function isLegacyPplPlan(plans?: WeeklyMatrixPlan[]): boolean {
  if (!plans || plans.length === 0) return true;
  const w1 = plans[0];
  if (!w1 || !w1.days) return true;
  const mon = w1.days.Monday;
  if (!mon || !mon.exercises || mon.exercises.length === 0) return true;
  
  // If Monday has Barbell Bench Press or Flat Bench or doesn't have Pulldowns
  const hasOldBench = mon.exercises.some((e) =>
    e.exerciseName.toLowerCase().includes("bench press") ||
    e.exerciseName.toLowerCase().includes("flat barbell")
  );
  const hasPulldown = mon.exercises.some((e) =>
    e.exerciseName.toLowerCase().includes("pulldown")
  );
  if (hasOldBench && !hasPulldown) return true;

  // If Friday has RDL or Romanian Deadlift instead of Spider Curls / Arms
  const fri = w1.days.Friday;
  if (fri && fri.exercises) {
    const hasRdl = fri.exercises.some((e) =>
      e.exerciseName.toLowerCase().includes("deadlift") ||
      e.exerciseName.toLowerCase().includes("rdl")
    );
    const hasArms = fri.exercises.some((e) =>
      e.exerciseName.toLowerCase().includes("curl") ||
      e.exerciseName.toLowerCase().includes("triceps") ||
      e.exerciseName.toLowerCase().includes("pushdown")
    );
    if (hasRdl || !hasArms) return true;
  }

  // If Saturday is Rest Day instead of Legs & Core
  const sat = w1.days.Saturday;
  if (sat && (sat.isRestDay || !sat.exercises || sat.exercises.length === 0)) return true;

  return false;
}

export function sanitizeSingleMuscleMatrix(
  plans: WeeklyMatrixPlan[],
  baseDateStr?: string,
  targetProgramId?: string,
  programName?: string
): WeeklyMatrixPlan[] {
  // Strict program check: if a specific non-single-muscle program is specified, do not sanitize
  if (targetProgramId && targetProgramId !== "prog-single-muscle" && targetProgramId !== "prog-hypertrophy-5day") {
    if (!programName || !programName.toLowerCase().includes("single muscle")) {
      return plans;
    }
  }

  const baseDate = baseDateStr && isValidDateStr(baseDateStr) ? baseDateStr : CANONICAL_PROGRAM_START_DATE;
  const canonical8Weeks = createInitialMatrixPlan(Math.max(8, plans?.length || 8), baseDate);

  if (!plans || plans.length === 0 || isLegacyPplPlan(plans)) {
    // If the plan is a legacy PPL template, merge preserving any user gym settings
    return canonical8Weeks.map((canonicalWeek, idx) => {
      const existingWeek = plans?.[idx];
      const expectedWeekStart = computeDateForDay(baseDate, idx + 1, "Monday");
      if (!existingWeek) return { ...canonicalWeek, startDate: expectedWeekStart };
      const mergedDays = { ...canonicalWeek.days };
      for (const day of DAYS_OF_WEEK) {
        const exCell = existingWeek.days?.[day];
        const expectedDate = computeDateForDay(baseDate, idx + 1, day);
        mergedDays[day] = {
          ...canonicalWeek.days[day],
          date: expectedDate,
          gymId: exCell?.gymId || canonicalWeek.days[day].gymId,
          gymName: exCell?.gymName || canonicalWeek.days[day].gymName
        };
      }
      return {
        ...canonicalWeek,
        startDate: expectedWeekStart,
        days: mergedDays
      };
    });
  }

  return plans.map((weekPlan, idx) => {
    const canonicalWeek = canonical8Weeks[idx] || createInitialMatrixPlan(1, computeDateForDay(baseDate, idx + 1, "Monday"))[0];
    const sanitizedDays: Record<DayOfWeek, MatrixDayCell> = { ...weekPlan.days };

    for (const day of DAYS_OF_WEEK) {
      const cell = weekPlan.days?.[day];
      const canonicalCell = canonicalWeek.days[day];
      const expectedDate = computeDateForDay(baseDate, idx + 1, day);

      if (day === "Sunday") {
        sanitizedDays[day] = {
          ...canonicalCell,
          date: expectedDate,
          isRestDay: true,
          exercises: []
        };
        continue;
      }

      if (!cell || !cell.exercises || cell.exercises.length === 0) {
        if (!canonicalCell.isRestDay) {
          sanitizedDays[day] = {
            ...canonicalCell,
            date: expectedDate,
            gymId: cell?.gymId || canonicalCell.gymId,
            gymName: cell?.gymName || canonicalCell.gymName
          };
        }
        continue;
      }

      // Check if cell date belongs to a different week (e.g. 2026-09-23 on week 1)
      const isDateOutOfSync = cell.date && cell.date !== expectedDate;

      // Check if user has made custom edits / actual logs on this cell
      const hasUserLoggedSets = cell.exercises.some((e) => e.sets && e.sets.length > 0);

      // Day-specific checks for legacy PPL contamination:
      if (day === "Monday") {
        const isPplMonday = cell.exercises.some((e) =>
          e.exerciseName.toLowerCase().includes("bench press") ||
          e.exerciseName.toLowerCase().includes("incline dumbbell press")
        );
        const hasPulldown = cell.exercises.some((e) =>
          e.exerciseName.toLowerCase().includes("pulldown")
        );
        if (isPplMonday && !hasPulldown && !hasUserLoggedSets) {
          sanitizedDays[day] = {
            ...canonicalCell,
            date: expectedDate,
            gymId: cell.gymId || canonicalCell.gymId,
            gymName: cell.gymName || canonicalCell.gymName
          };
        } else {
          sanitizedDays[day] = {
            ...cell,
            date: expectedDate
          };
        }
      } else if (day === "Tuesday") {
        const isPplTuesday = cell.exercises.some((e) =>
          e.exerciseName.toLowerCase().includes("deadlift") ||
          (e.exerciseName.toLowerCase().includes("row") && !cell.exercises.some((x) => x.exerciseName.toLowerCase().includes("chest")))
        );
        const hasChest = cell.exercises.some((e) =>
          e.exerciseName.toLowerCase().includes("chest") ||
          e.exerciseName.toLowerCase().includes("pec") ||
          e.exerciseName.toLowerCase().includes("flies")
        );
        if (isPplTuesday && !hasChest && !hasUserLoggedSets) {
          sanitizedDays[day] = {
            ...canonicalCell,
            date: expectedDate,
            gymId: cell.gymId || canonicalCell.gymId,
            gymName: cell.gymName || canonicalCell.gymName
          };
        } else {
          sanitizedDays[day] = {
            ...cell,
            date: expectedDate
          };
        }
      } else if (day === "Thursday") {
        const isPplThursday = cell.exercises.some((e) =>
          e.exerciseName.toLowerCase().includes("incline barbell bench") ||
          e.exerciseName.toLowerCase().includes("cable crossover")
        );
        const hasShoulders = cell.exercises.some((e) =>
          e.exerciseName.toLowerCase().includes("overhead press") ||
          e.exerciseName.toLowerCase().includes("lateral raise") ||
          e.exerciseName.toLowerCase().includes("delt")
        );
        if (isPplThursday && !hasShoulders && !hasUserLoggedSets) {
          sanitizedDays[day] = {
            ...canonicalCell,
            date: expectedDate,
            gymId: cell.gymId || canonicalCell.gymId,
            gymName: cell.gymName || canonicalCell.gymName
          };
        } else {
          sanitizedDays[day] = {
            ...cell,
            date: expectedDate
          };
        }
      } else if (day === "Friday") {
        const isPplFriday = cell.exercises.some((e) =>
          e.exerciseName.toLowerCase().includes("romanian deadlift") ||
          e.exerciseName.toLowerCase().includes("rdl") ||
          e.exerciseName.toLowerCase().includes("leg press")
        );
        const hasArms = cell.exercises.some((e) =>
          e.exerciseName.toLowerCase().includes("curl") ||
          e.exerciseName.toLowerCase().includes("triceps") ||
          e.exerciseName.toLowerCase().includes("pushdown") ||
          e.exerciseName.toLowerCase().includes("kick back")
        );
        if ((isPplFriday || !hasArms) && !hasUserLoggedSets) {
          sanitizedDays[day] = {
            ...canonicalCell,
            date: expectedDate,
            gymId: cell.gymId || canonicalCell.gymId,
            gymName: cell.gymName || canonicalCell.gymName
          };
        } else {
          sanitizedDays[day] = {
            ...cell,
            date: expectedDate
          };
        }
      } else if (day === "Saturday") {
        if ((cell.isRestDay || !cell.exercises.some((e) => e.exerciseName.toLowerCase().includes("leg") || e.exerciseName.toLowerCase().includes("ab"))) && !hasUserLoggedSets) {
          sanitizedDays[day] = {
            ...canonicalCell,
            date: expectedDate,
            gymId: cell.gymId || canonicalCell.gymId,
            gymName: cell.gymName || canonicalCell.gymName
          };
        } else {
          sanitizedDays[day] = {
            ...cell,
            date: expectedDate
          };
        }
      } else {
        sanitizedDays[day] = {
          ...cell,
          date: expectedDate
        };
      }
    }

    return {
      ...weekPlan,
      startDate: computeDateForDay(baseDate, idx + 1, "Monday"),
      days: sanitizedDays
    };
  });
}

// Pre-planned training programs based on athlete goals with customizable objectives
export function createPreplannedPrograms(startDateStr?: string): TrainingProgram[] {
  const baseDate = startDateStr && isValidDateStr(startDateStr) ? startDateStr : CANONICAL_PROGRAM_START_DATE;
  const singleMuscleMatrix = createInitialMatrixPlan(8, baseDate);

  // Strength Program 4-Day Matrix
  const strengthWeek1Days: Record<DayOfWeek, { title: string; isRest: boolean; muscle: string; exercises: PlannedExercise[] }> = {
    Monday: {
      title: "Heavy Squat & Leg Power",
      isRest: false,
      muscle: "Legs",
      exercises: [
        { exerciseName: "Barbell Back Squat", muscleGroup: "Legs", targetSets: 5, targetReps: "3-5", targetWeight: 135, warmupNotes: "Ramp up with 3 warmup sets" },
        { exerciseName: "Leg Press 45°", muscleGroup: "Legs", targetSets: 3, targetReps: "6-8", targetWeight: 240 },
        { exerciseName: "Romanian Deadlift (RDL)", muscleGroup: "Legs", targetSets: 3, targetReps: "6-8", targetWeight: 120 }
      ]
    },
    Tuesday: {
      title: "Heavy Bench & Overhead Drive",
      isRest: false,
      muscle: "Chest & Shoulders",
      exercises: [
        { exerciseName: "Barbell Bench Press", muscleGroup: "Chest", targetSets: 5, targetReps: "3-5", targetWeight: 100, warmupNotes: "Focus on arch & leg drive" },
        { exerciseName: "Overhead Barbell Press", muscleGroup: "Shoulders", targetSets: 4, targetReps: "4-6", targetWeight: 62.5 },
        { exerciseName: "Dips (Weighted / Bodyweight)", muscleGroup: "Chest", targetSets: 3, targetReps: "6-8", targetWeight: 20 }
      ]
    },
    Wednesday: {
      title: "Active Recovery & Mobility",
      isRest: true,
      muscle: "Rest & Recovery",
      exercises: []
    },
    Thursday: {
      title: "Heavy Deadlift & Lat Recruitment",
      isRest: false,
      muscle: "Back & Posterior Chain",
      exercises: [
        { exerciseName: "Barbell Deadlift (Conventional/Sumo)", muscleGroup: "Back", targetSets: 4, targetReps: "3-5", targetWeight: 160 },
        { exerciseName: "Chest-Supported T-Bar Row", muscleGroup: "Back", targetSets: 4, targetReps: "6-8", targetWeight: 75 },
        { exerciseName: "Face Pulls", muscleGroup: "Shoulders", targetSets: 4, targetReps: "12-15", targetWeight: 30 }
      ]
    },
    Friday: {
      title: "Assistance Compounds & Core Armor",
      isRest: false,
      muscle: "Full Body & Core",
      exercises: [
        { exerciseName: "Incline Dumbbell Press", muscleGroup: "Chest", targetSets: 4, targetReps: "6-8", targetWeight: 40 },
        { exerciseName: "Standing Dumbbell Lateral Raises", muscleGroup: "Shoulders", targetSets: 4, targetReps: "10-12", targetWeight: 16 },
        { exerciseName: "Hanging Leg Raises", muscleGroup: "Core", targetSets: 4, targetReps: "12-15", targetWeight: 0 }
      ]
    },
    Saturday: {
      title: "Active Regeneration & Walk",
      isRest: true,
      muscle: "Rest",
      exercises: []
    },
    Sunday: {
      title: "Total Central Nervous System Reset",
      isRest: true,
      muscle: "Rest",
      exercises: []
    }
  };

  const strengthWeeks: WeeklyMatrixPlan[] = [];
  for (let w = 1; w <= 5; w++) {
    const loadMultiplier = 1 + (w - 1) * 0.03;
    const daysRec: Record<DayOfWeek, any> = {} as any;
    for (const d of DAYS_OF_WEEK) {
      const template = strengthWeek1Days[d];
      daysRec[d] = {
        day: d,
        date: computeDateForDay(baseDate, w, d),
        workoutTitle: template.title,
        isRestDay: template.isRest,
        targetMuscleGroup: template.muscle,
        notes: `Week ${w} linear intensity overload (+${((loadMultiplier - 1) * 100).toFixed(0)}%)`,
        exercises: template.exercises.map((ex) => ({
          ...ex,
          targetWeight: ex.targetWeight ? Math.round(ex.targetWeight * loadMultiplier) : undefined,
          targetSets: ex.targetSets
        }))
      };
    }
    strengthWeeks.push({
      weekNumber: w,
      weekTheme: `Strength Accumulation W${w}`,
      startDate: computeDateForDay(baseDate, w, "Monday"),
      days: daysRec
    });
  }

  // Shred / Conditioning Matrix (4-Day high density)
  const shredWeek1Days: Record<DayOfWeek, { title: string; isRest: boolean; muscle: string; exercises: PlannedExercise[] }> = {
    Monday: {
      title: "Upper Density & Push Intervals",
      isRest: false,
      muscle: "Upper Body",
      exercises: [
        { exerciseName: "Incline Dumbbell Press", muscleGroup: "Chest", targetSets: 4, targetReps: "10-12", targetWeight: 32 },
        { exerciseName: "Neutral Grip Cable Row", muscleGroup: "Back", targetSets: 4, targetReps: "10-12", targetWeight: 65 },
        { exerciseName: "Standing Dumbbell Lateral Raises", muscleGroup: "Shoulders", targetSets: 4, targetReps: "15-20", targetWeight: 12 },
        { exerciseName: "Triceps Rope Pushdown", muscleGroup: "Arms", targetSets: 3, targetReps: "12-15", targetWeight: 28 }
      ]
    },
    Tuesday: {
      title: "Lower Body Metabolic Circuit",
      isRest: false,
      muscle: "Legs",
      exercises: [
        { exerciseName: "Barbell Back Squat", muscleGroup: "Legs", targetSets: 4, targetReps: "8-10", targetWeight: 105 },
        { exerciseName: "Romanian Deadlift (RDL)", muscleGroup: "Legs", targetSets: 4, targetReps: "10-12", targetWeight: 95 },
        { exerciseName: "Leg Extension", muscleGroup: "Legs", targetSets: 3, targetReps: "15-18", targetWeight: 55 },
        { exerciseName: "Hanging Leg Raises", muscleGroup: "Core", targetSets: 3, targetReps: "15-20", targetWeight: 0 }
      ]
    },
    Wednesday: {
      title: "Zone 2 Low-Impact Cardio & Core",
      isRest: true,
      muscle: "Cardiovascular",
      exercises: []
    },
    Thursday: {
      title: "Pull Density & Rear Chain",
      isRest: false,
      muscle: "Back & Rear Delts",
      exercises: [
        { exerciseName: "Lat Pulldown (Plate/Cable)", muscleGroup: "Back", targetSets: 4, targetReps: "10-12", targetWeight: 70 },
        { exerciseName: "Face Pulls", muscleGroup: "Shoulders", targetSets: 4, targetReps: "15-20", targetWeight: 25 },
        { exerciseName: "Incline Dumbbell Curl", muscleGroup: "Arms", targetSets: 3, targetReps: "12-15", targetWeight: 14 }
      ]
    },
    Friday: {
      title: "Full Body High-Density Pump",
      isRest: false,
      muscle: "Full Body",
      exercises: [
        { exerciseName: "Barbell Bench Press", muscleGroup: "Chest", targetSets: 3, targetReps: "10-12", targetWeight: 80 },
        { exerciseName: "Leg Press 45°", muscleGroup: "Legs", targetSets: 3, targetReps: "12-15", targetWeight: 190 },
        { exerciseName: "Standing Calf Raise", muscleGroup: "Legs", targetSets: 4, targetReps: "15-20", targetWeight: 65 }
      ]
    },
    Saturday: {
      title: "Active Outdoor Recovery",
      isRest: true,
      muscle: "Rest",
      exercises: []
    },
    Sunday: {
      title: "Rest & Meal Prep Reset",
      isRest: true,
      muscle: "Rest",
      exercises: []
    }
  };

  const shredWeeks: WeeklyMatrixPlan[] = [];
  for (let w = 1; w <= 5; w++) {
    const daysRec: Record<DayOfWeek, any> = {} as any;
    for (const d of DAYS_OF_WEEK) {
      const template = shredWeek1Days[d];
      daysRec[d] = {
        day: d,
        date: computeDateForDay(baseDate, w, d),
        workoutTitle: template.title,
        isRestDay: template.isRest,
        targetMuscleGroup: template.muscle,
        notes: `Week ${w} Density & Short Rest Periods (45-60s)`,
        exercises: template.exercises.map((ex) => ({
          ...ex,
          targetWeight: ex.targetWeight,
          targetSets: ex.targetSets
        }))
      };
    }
    shredWeeks.push({
      weekNumber: w,
      weekTheme: `Metabolic Density W${w}`,
      startDate: computeDateForDay(baseDate, w, "Monday"),
      days: daysRec
    });
  }

  // Longevity & Joint Health Matrix
  const longevityWeek1Days: Record<DayOfWeek, { title: string; isRest: boolean; muscle: string; exercises: PlannedExercise[] }> = {
    Monday: {
      title: "Anterior Chain Strength & Thoracic Mobility",
      isRest: false,
      muscle: "Chest & Legs",
      exercises: [
        { exerciseName: "Barbell Bench Press", muscleGroup: "Chest", targetSets: 3, targetReps: "8-10", targetWeight: 75, warmupNotes: "Pause 1s on chest for tendon health" },
        { exerciseName: "Barbell Back Squat", muscleGroup: "Legs", targetSets: 3, targetReps: "8-10", targetWeight: 95, warmupNotes: "Focus on deep hip mobility" },
        { exerciseName: "Standing Dumbbell Lateral Raises", muscleGroup: "Shoulders", targetSets: 3, targetReps: "12-15", targetWeight: 12 }
      ]
    },
    Tuesday: {
      title: "Rest & Active Walking",
      isRest: true,
      muscle: "Recovery",
      exercises: []
    },
    Wednesday: {
      title: "Posterior Chain & Scapular Stability",
      isRest: false,
      muscle: "Back & Hamstrings",
      exercises: [
        { exerciseName: "Romanian Deadlift (RDL)", muscleGroup: "Legs", targetSets: 3, targetReps: "10-12", targetWeight: 90 },
        { exerciseName: "Neutral Grip Cable Row", muscleGroup: "Back", targetSets: 3, targetReps: "10-12", targetWeight: 60 },
        { exerciseName: "Face Pulls", muscleGroup: "Shoulders", targetSets: 4, targetReps: "15-20", targetWeight: 22 }
      ]
    },
    Thursday: {
      title: "Mobility & Zone 2 Cardiovascular",
      isRest: true,
      muscle: "Cardiovascular",
      exercises: []
    },
    Friday: {
      title: "Full Body Structural Balance",
      isRest: false,
      muscle: "Full Body",
      exercises: [
        { exerciseName: "Overhead Barbell Press", muscleGroup: "Shoulders", targetSets: 3, targetReps: "8-10", targetWeight: 45 },
        { exerciseName: "Leg Press 45°", muscleGroup: "Legs", targetSets: 3, targetReps: "12-15", targetWeight: 180 },
        { exerciseName: "Incline Dumbbell Curl", muscleGroup: "Arms", targetSets: 3, targetReps: "10-12", targetWeight: 14 }
      ]
    },
    Saturday: {
      title: "Sauna & Cold Plunge / Active Recreation",
      isRest: true,
      muscle: "Rest",
      exercises: []
    },
    Sunday: {
      title: "Full Nervous System Decompression",
      isRest: true,
      muscle: "Rest",
      exercises: []
    }
  };

  const longevityWeeks: WeeklyMatrixPlan[] = [];
  for (let w = 1; w <= 4; w++) {
    const daysRec: Record<DayOfWeek, any> = {} as any;
    for (const d of DAYS_OF_WEEK) {
      const template = longevityWeek1Days[d];
      daysRec[d] = {
        day: d,
        workoutTitle: template.title,
        isRestDay: template.isRest,
        targetMuscleGroup: template.muscle,
        notes: `Week ${w} Joint longevity, slow eccentrics, controlled tempo`,
        exercises: template.exercises.map((ex) => ({
          ...ex,
          targetWeight: ex.targetWeight
        }))
      };
    }
    longevityWeeks.push({
      weekNumber: w,
      weekTheme: `Longevity Phase W${w}`,
      startDate: computeDateForDay(baseDate, w, "Monday"),
      days: daysRec
    });
  }

  const singleMuscleWeek1Days: Record<DayOfWeek, { title: string; isRest: boolean; muscle: string; exercises: PlannedExercise[] }> = {
    Monday: {
      title: "Day 1 (Back & Rear Delts)",
      isRest: false,
      muscle: "Back & Rear Delts",
      exercises: [
        { exerciseName: "Pulldowns 8-12 Plate machine", muscleGroup: "Back", targetSets: 3, targetReps: "8-12", targetWeight: 121, warmupNotes: "Warm Up 2 sets", notes: "Plate machine" },
        { exerciseName: "Chest-supported rows 8-12", muscleGroup: "Back", targetSets: 3, targetReps: "8-12", targetWeight: 28, warmupNotes: "Warm Up", notes: "Chest supported" },
        { exerciseName: "T-bar row 8-10", muscleGroup: "Back", targetSets: 3, targetReps: "8-10", targetWeight: 35, warmupNotes: "Warm Up", notes: "Controlled contraction" },
        { exerciseName: "Single-Arm Cable Pulldown 8-12", muscleGroup: "Back", targetSets: 3, targetReps: "8-12", targetWeight: 29, warmupNotes: "Warm Up", notes: "Unilateral focus" },
        { exerciseName: "Straight bar pulldown 8-12", muscleGroup: "Back", targetSets: 3, targetReps: "8-12", targetWeight: 36, warmupNotes: "Warm Up", notes: "Lat sweep" },
        { exerciseName: "Face Pulls 10-15", muscleGroup: "Shoulders", targetSets: 3, targetReps: "10-15", targetWeight: 35, warmupNotes: "Warm Up", notes: "Rear delt & external rotation" },
        { exerciseName: "Chest supported shrugs", muscleGroup: "Back", targetSets: 3, targetReps: "12-14", targetWeight: 26, warmupNotes: "Warm Up", notes: "Upper trap contraction" }
      ]
    },
    Tuesday: {
      title: "Day 2 (Chest)",
      isRest: false,
      muscle: "Chest",
      exercises: [
        { exerciseName: "Incline DB Chest Press", muscleGroup: "Chest", targetSets: 3, targetReps: "10-12", targetWeight: 32, warmupNotes: "Warm Up", notes: "Clavicular head focus" },
        { exerciseName: "Flat chest press machine", muscleGroup: "Chest", targetSets: 3, targetReps: "8-10", targetWeight: 40, warmupNotes: "Warm Up", notes: "Machine press" },
        { exerciseName: "Decline Chest Press", muscleGroup: "Chest", targetSets: 3, targetReps: "12", targetWeight: 70, warmupNotes: "Warm Up", notes: "Sternal head focus" },
        { exerciseName: "Cable Flies", muscleGroup: "Chest", targetSets: 3, targetReps: "10-13", targetWeight: 35, warmupNotes: "Warm Up", notes: "Peak squeeze" },
        { exerciseName: "Low to High Cable flies", muscleGroup: "Chest", targetSets: 3, targetReps: "10-14", targetWeight: 20, warmupNotes: "Warm Up", notes: "Upper chest adduction" },
        { exerciseName: "Pec Dec", muscleGroup: "Chest", targetSets: 3, targetReps: "9-14", targetWeight: 70, warmupNotes: "Warm Up", notes: "Machine fly isolation" }
      ]
    },
    Wednesday: {
      title: "Day 3 (Fullbody & Core)",
      isRest: false,
      muscle: "Full Body",
      exercises: [
        { exerciseName: "Chins", muscleGroup: "Back", targetSets: 4, targetReps: "8-12", targetWeight: 0, warmupNotes: "BW / Warmup", notes: "Standard controlled tempo" },
        { exerciseName: "Dips", muscleGroup: "Chest", targetSets: 3, targetReps: "8-12", targetWeight: 0, warmupNotes: "BW / Warmup", notes: "Standard controlled tempo" },
        { exerciseName: "Hang leg raise", muscleGroup: "Core", targetSets: 3, targetReps: "8-12", targetWeight: 0, warmupNotes: "BW / Warmup", notes: "Standard controlled tempo" },
        { exerciseName: "Abcrunch", muscleGroup: "Core", targetSets: 3, targetReps: "8-12", targetWeight: 59, warmupNotes: "BW / Warmup", notes: "Standard controlled tempo" },
        { exerciseName: "Abdominal", muscleGroup: "Core", targetSets: 3, targetReps: "8-12", targetWeight: 50, warmupNotes: "BW / Warmup", notes: "Standard controlled tempo" }
      ]
    },
    Thursday: {
      title: "Day 4 (Shoulders)",
      isRest: false,
      muscle: "Shoulders",
      exercises: [
        { exerciseName: "Overhead Press", muscleGroup: "Shoulders", targetSets: 3, targetReps: "8-10", targetWeight: 26, warmupNotes: "Warm Up", notes: "Strict OHP" },
        { exerciseName: "Cabel Lateral Raise", muscleGroup: "Shoulders", targetSets: 3, targetReps: "10-12", targetWeight: 8.8, warmupNotes: "Warm Up", notes: "Lateral delts" },
        { exerciseName: "Upright Row", muscleGroup: "Shoulders", targetSets: 3, targetReps: "11-13", targetWeight: 33, warmupNotes: "Warm Up", notes: "Cable/Barbell upright row" },
        { exerciseName: "Reversed Pec Deck", muscleGroup: "Shoulders", targetSets: 3, targetReps: "12", targetWeight: 61, warmupNotes: "Warm Up", notes: "Rear delt fly" },
        { exerciseName: "Laying Delt Raise", muscleGroup: "Shoulders", targetSets: 3, targetReps: "8-10", targetWeight: 7.9, warmupNotes: "Warm Up", notes: "Incline/Flat bench delt raise" },
        { exerciseName: "Shrugs", muscleGroup: "Shoulders", targetSets: 3, targetReps: "13-16", targetWeight: 34, warmupNotes: "Warm Up", notes: "Dumbbell/Trap bar shrugs" }
      ]
    },
    Friday: {
      title: "Day 5 (Arms)",
      isRest: false,
      muscle: "Arms",
      exercises: [
        { exerciseName: "spider curls", muscleGroup: "Arms", targetSets: 3, targetReps: "10-12", targetWeight: 32.5, warmupNotes: "Warm Up", notes: "Short head biceps" },
        { exerciseName: "Laying DB Curls", muscleGroup: "Arms", targetSets: 3, targetReps: "9-11", targetWeight: 16, warmupNotes: "Warm Up", notes: "Incline/Flat curl" },
        { exerciseName: "Bayesian Cable Curl", muscleGroup: "Arms", targetSets: 3, targetReps: "12", targetWeight: 12.5, warmupNotes: "Warm Up", notes: "Behind back stretch curl" },
        { exerciseName: "BFR EZ Bench", muscleGroup: "Arms", targetSets: 4, targetReps: "12-30", targetWeight: 18, warmupNotes: "Warm Up", notes: "Blood flow restriction bench curl" },
        { exerciseName: "Overhead Cable", muscleGroup: "Arms", targetSets: 3, targetReps: "9-14", targetWeight: 55, warmupNotes: "Warm Up", notes: "Triceps long head extension" },
        { exerciseName: "Pushdown Cambered Bar", muscleGroup: "Arms", targetSets: 3, targetReps: "11-15", targetWeight: 75, warmupNotes: "Warm Up", notes: "Cambered bar pushdown" },
        { exerciseName: "Kick Back Cable", muscleGroup: "Arms", targetSets: 3, targetReps: "10-12", targetWeight: 21.5, warmupNotes: "Warm Up", notes: "Triceps cable kickback" },
        { exerciseName: "BFR Rope Push down", muscleGroup: "Arms", targetSets: 4, targetReps: "12-30", targetWeight: 25, warmupNotes: "Warm Up", notes: "Blood flow restriction rope pushdown" }
      ]
    },
    Saturday: {
      title: "Day 6 (Legs & Core)",
      isRest: false,
      muscle: "Legs",
      exercises: [
        { exerciseName: "Leg Extensions", muscleGroup: "Legs", targetSets: 3, targetReps: "8-12", targetWeight: 110, warmupNotes: "Warm Up", notes: "Quad extension" },
        { exerciseName: "Leg Curls", muscleGroup: "Legs", targetSets: 4, targetReps: "12-15", targetWeight: 33, warmupNotes: "Warm Up", notes: "Hamstring curl" },
        { exerciseName: "Hip Adductor", muscleGroup: "Legs", targetSets: 4, targetReps: "15-20", targetWeight: 20, warmupNotes: "Warm Up", notes: "Innover press / Adductor" },
        { exerciseName: "Hip Abductor", muscleGroup: "Legs", targetSets: 3, targetReps: "10-15", targetWeight: 25, warmupNotes: "Warm Up", notes: "Utover press / Abductor" },
        { exerciseName: "Hang legraises", muscleGroup: "Core", targetSets: 3, targetReps: "15-20", targetWeight: 0, warmupNotes: "Warm Up", notes: "Hanging leg raise" },
        { exerciseName: "Ab Crunches", muscleGroup: "Core", targetSets: 3, targetReps: "13-15", targetWeight: 70, warmupNotes: "Warm Up", notes: "Machine / weighted ab crunch" },
        { exerciseName: "V-up", muscleGroup: "Core", targetSets: 4, targetReps: "15-30", targetWeight: 0, warmupNotes: "Warm Up", notes: "Bodyweight V-ups" }
      ]
    },
    Sunday: {
      title: "Day 7 (Rest & Recovery)",
      isRest: true,
      muscle: "Rest",
      exercises: []
    }
  };

  const singleMuscleWeeks: WeeklyMatrixPlan[] = [];
  for (let w = 1; w <= 8; w++) {
    const daysRec: Record<DayOfWeek, any> = {} as any;
    for (const d of DAYS_OF_WEEK) {
      const template = singleMuscleWeek1Days[d];
      daysRec[d] = {
        day: d,
        date: computeDateForDay(baseDate, w, d),
        workoutTitle: template.title,
        isRestDay: template.isRest,
        targetMuscleGroup: template.muscle,
        notes: `Week ${w} Single Muscle Focus - ${template.title}`,
        exercises: template.exercises.map((ex) => ({
          ...ex,
          targetWeight: ex.targetWeight,
          targetSets: ex.targetSets
        }))
      };
    }
    singleMuscleWeeks.push({
      weekNumber: w,
      weekTheme: `Single Muscle Split W${w}`,
      startDate: computeDateForDay(baseDate, w, "Monday"),
      days: daysRec
    });
  }

  return [
    {
      id: "prog-single-muscle",
      name: "Single Muscle Dedicated Split (6-Day)",
      goal: "bulk",
      description: "Dedicated single muscle group per training day (Back, Chest, Fullbody/Core, Shoulders, Arms, Legs & Core, Sunday Rest).",
      primaryObjective: "Maximum localized hypertrophy and training frequency across 6 training days",
      secondaryObjective: "Strict isolation form and progressive overload per body part",
      splitDaysPerWeek: 6,
      daysPerWeek: 6,
      durationWeeks: 8,
      totalWeeks: 8,
      matrixPlans: singleMuscleMatrix,
      isCustom: false
    },
    {
      id: "prog-strength-power",
      name: "Strength & Power Peak (Linear Heavy Periodization)",
      goal: "strength",
      description: "Neuromuscular rate of force development focused on 3-5 rep compound power lifts (Squat, Bench, Deadlift, Overhead Press).",
      primaryObjective: "Add 15kg to Back Squat and 10kg to Barbell Bench Press",
      secondaryObjective: "Refine intra-abdominal bracing (Valsalva) and bar speed off the floor",
      splitDaysPerWeek: 4,
      daysPerWeek: 4,
      durationWeeks: 4,
      totalWeeks: 8,
      matrixPlans: strengthWeeks,
      isCustom: false
    },
    {
      id: "prog-metabolic-shred",
      name: "Metabolic Conditioning & Fat Loss Shred",
      goal: "shred",
      description: "High-density resistance training paired with peri-workout carbohydrate cycling to shed body fat while defending 1RM strength.",
      primaryObjective: "Reduce body fat by 3% while keeping compound lift working weights stable",
      secondaryObjective: "Elevate EPOC (excess post-exercise oxygen consumption) with 45s rest intervals",
      splitDaysPerWeek: 4,
      daysPerWeek: 4,
      durationWeeks: 4,
      totalWeeks: 8,
      matrixPlans: shredWeeks,
      isCustom: false
    },
    {
      id: "prog-longevity-joints",
      name: "Longevity, Joint Health & Mobility Recomp",
      goal: "longevity",
      description: "Low axial fatigue, high tendon elasticity routine emphasizing tempo eccentrics, scapular stabilization, and cardiovascular base.",
      primaryObjective: "Zero joint inflammation, optimize HRV (+8ms) and resting heart rate (<55 bpm)",
      secondaryObjective: "Build resilient rotator cuffs and posterior chain mobility",
      splitDaysPerWeek: 3,
      daysPerWeek: 3,
      durationWeeks: 4,
      totalWeeks: 8,
      matrixPlans: longevityWeeks,
      isCustom: false
    }
  ];
}

// Generates an 8-week matrix plan for custom programs with blank exercises for all days of the week, ready for quick exercise addition
export function createBlankMatrixPlan(totalWeeks: number = 8, startDateStr?: string): WeeklyMatrixPlan[] {
  const baseDate = startDateStr || getTodayOrCurrentMondayDate();
  const weeks: WeeklyMatrixPlan[] = [];

  for (let w = 1; w <= totalWeeks; w++) {
    const daysRecord: Record<DayOfWeek, any> = {} as any;
    for (const day of DAYS_OF_WEEK) {
      const cellDate = computeDateForDay(baseDate, w, day);
      const isSunday = day === "Sunday";

      daysRecord[day] = {
        day,
        date: cellDate,
        workoutTitle: isSunday ? "Rest & Recovery" : `${day} Workout`,
        isRestDay: isSunday,
        targetMuscleGroup: isSunday ? "Rest" : "Full Body",
        notes: isSunday ? "Recovery day" : `Week ${w} ${day} routine`,
        exercises: []
      };
    }
    weeks.push({
      weekNumber: w,
      weekTheme: `Week ${w} Custom Routine`,
      startDate: computeDateForDay(baseDate, w, "Monday"),
      days: daysRecord
    });
  }

  return weeks;
}

// Recommended Meal Plans aligned with user profile & peri-workout nutrition
export function getRecommendedMealPlan(profile: UserProfile): DailyMealPlan[] {
  const macros = calculateHormoneAndMacroPlan(profile.gender, profile.goal, profile.weightKg);
  const total = macros.totalCalories;
  const p = macros.proteinGrams;
  const c = macros.carbsGrams;
  const f = macros.fatGrams;

  return [
    {
      id: "meal-1",
      mealName: "Anabolic Breakfast & Endocrine Foundation",
      timing: "07:30 AM (Morning)",
      targetCalories: Math.round(total * 0.25),
      targetProteinG: Math.round(p * 0.28),
      targetCarbsG: Math.round(c * 0.25),
      targetFatsG: Math.round(f * 0.35),
      recommendedFoods: [
        "3 Whole Pasture-Raised Eggs + 2 Egg Whites",
        "80g Rolled Oats with Blueberries & Cinnamon",
        "1 Scoop Whey Isolate",
        "10g Chia Seeds or Crushed Walnuts"
      ],
      scientificRationale: "Whole eggs supply bioavailable cholesterol substrate for morning Leydig cell testosterone/steroid hormone synthesis."
    },
    {
      id: "meal-2",
      mealName: "Pre-Workout Glycogen Top-Off",
      timing: "11:30 AM (90 mins before training)",
      targetCalories: Math.round(total * 0.28),
      targetProteinG: Math.round(p * 0.25),
      targetCarbsG: Math.round(c * 0.35),
      targetFatsG: Math.round(f * 0.15),
      recommendedFoods: [
        "180g Grilled Chicken Breast or Lean Beef",
        "220g Jasmine Rice or Sweet Potato",
        "Steamed Broccoli or Spinach with Sea Salt",
        "500ml Water + Pinch of Pink Himalayan Salt"
      ],
      scientificRationale: "Low fat, easily digestible starch saturates muscle glycogen stores and primes intracellular pump without GI distress."
    },
    {
      id: "meal-3",
      mealName: "Post-Workout Muscle Protein Synthesis (MPS) Spike",
      timing: "02:30 PM (Within 45 mins post-training)",
      targetCalories: Math.round(total * 0.22),
      targetProteinG: Math.round(p * 0.27),
      targetCarbsG: Math.round(c * 0.25),
      targetFatsG: Math.round(f * 0.15),
      recommendedFoods: [
        "1 Scoop Whey Isolate (30g Protein)",
        "1 Ripe Banana + 40g Cream of Rice",
        "5g Creatine Monohydrate",
        "100ml Almond Milk or Water"
      ],
      scientificRationale: "Rapid leucine spike activates mTORC1 signaling pathway while high-GI carbs trigger insulin to transport amino acids into sensitized muscle tissue."
    },
    {
      id: "meal-4",
      mealName: "Evening Sustained Recovery & Sleep Optimization",
      timing: "07:30 PM (Evening)",
      targetCalories: Math.round(total * 0.25),
      targetProteinG: Math.round(p * 0.20),
      targetCarbsG: Math.round(c * 0.15),
      targetFatsG: Math.round(f * 0.35),
      recommendedFoods: [
        "200g Wild Salmon or Grass-Fed Steak (Rich in Zinc & Omega-3)",
        "Roasted Asparagus with 1 tbsp Extra Virgin Olive Oil",
        "150g Greek Yogurt with 1 tsp Raw Honey before bed",
        "Magnesium Glycinate (400mg) supplement"
      ],
      scientificRationale: "Casein and slow fats release amino acids steadily overnight to prevent nocturnal catabolism, while magnesium promotes parasympathetic deep sleep."
    }
  ];
}

/**
 * CANONICAL CONVERSION: Converts a matrix day cell into a standard WorkoutPlan
 * Preserves ALL sets, weights, and reps without truncation (e.g. 6 working sets @ 80kg).
 */
export function convertDayCellToWorkoutPlan(
  cell: MatrixDayCell,
  weekNumber: number,
  day: DayOfWeek,
  programName?: string
): WorkoutPlan {
  const muscle = typeof cell.targetMuscleGroup === "string"
    ? cell.targetMuscleGroup
    : Array.isArray(cell.targetMuscleGroup)
    ? (cell.targetMuscleGroup as string[]).join(" • ")
    : "General Strength";

  const exercises: PlannedExercise[] = (cell.exercises || []).map((ex) => {
    // Preserve ALL planned sets if they exist
    const hasSets = Array.isArray(ex.sets) && ex.sets.length > 0;
    const count = hasSets ? ex.sets!.length : (Number(ex.targetSets) || 3);

    const sets: PlannedSet[] = Array.from({ length: count }, (_, sIdx) => {
      if (hasSets && ex.sets![sIdx]) {
        const s = ex.sets![sIdx];
        return {
          setNumber: sIdx + 1,
          weight: s.weight !== undefined ? s.weight : ex.targetWeight,
          reps: s.reps !== undefined ? s.reps : ex.targetReps
        };
      }
      return {
        setNumber: sIdx + 1,
        weight: ex.targetWeight,
        reps: ex.targetReps
      };
    });

    return {
      exerciseName: ex.exerciseName,
      muscleGroup: ex.muscleGroup || "Chest",
      targetSets: sets.length,
      targetReps: ex.targetReps || "8-12",
      targetWeight: ex.targetWeight,
      warmupNotes: ex.warmupNotes,
      sets,
      progressionNote: ex.progressionNote,
      equipmentType: ex.equipmentType,
      machineId: ex.machineId,
      machineName: ex.machineName,
      stationLabel: ex.stationLabel
    };
  });

  const progPrefix = programName ? `${programName} • ` : "";
  const title = cell.workoutTitle || `${day} Workout`;

  return {
    id: `plan-w${weekNumber}-${day}`,
    name: `${title} (Week ${weekNumber} • ${day})`,
    targetMuscleGroup: muscle,
    notes: cell.notes || `${progPrefix}Week ${weekNumber} ${day} scheduled training session`,
    scheduledDate: cell.date,
    gymId: cell.gymId,
    gymName: cell.gymName,
    exercises
  };
}

export interface ResolvedPlannedSession {
  weekNumber: number;
  dayOfWeek: DayOfWeek;
  dayCell: MatrixDayCell;
  workoutPlan: WorkoutPlan;
  isToday: boolean;
}

/**
 * CANONICAL RESOLVER: Locates the planned session for any target date
 * Used across Dashboard, Diary, Planner, and Live Logger.
 */
export function findPlannedSessionForDate(
  matrixPlans: WeeklyMatrixPlan[],
  targetDateStr: string,
  programName?: string
): ResolvedPlannedSession | null {
  if (!matrixPlans || matrixPlans.length === 0) return null;

  // 1. Direct date match in any cell
  for (const wp of matrixPlans) {
    for (const d of DAYS_OF_WEEK) {
      const cell = wp.days?.[d];
      if (cell && cell.date === targetDateStr) {
        return {
          weekNumber: wp.weekNumber,
          dayOfWeek: d,
          dayCell: cell,
          workoutPlan: convertDayCellToWorkoutPlan(cell, wp.weekNumber, d, programName),
          isToday: targetDateStr === getTodayDateStr()
        };
      }
    }
  }

  // 2. Calculation match using cycle start date
  const baseStartMonday = getWeekStartMonday(matrixPlans[0]?.startDate || CANONICAL_PROGRAM_START_DATE);
  if (isValidDateStr(baseStartMonday) && isValidDateStr(targetDateStr)) {
    const diffDays = getDifferenceInDays(baseStartMonday, targetDateStr);
    const dayOfWeekName = getDayOfWeekName(targetDateStr);
    if (diffDays >= 0) {
      const calcWeekNum = Math.floor(diffDays / 7) + 1;
      const matchedWeek = matrixPlans.find((wp) => wp.weekNumber === calcWeekNum);
      if (matchedWeek && dayOfWeekName && matchedWeek.days?.[dayOfWeekName]) {
        const cell = matchedWeek.days[dayOfWeekName];
        return {
          weekNumber: calcWeekNum,
          dayOfWeek: dayOfWeekName,
          dayCell: cell,
          workoutPlan: convertDayCellToWorkoutPlan(cell, calcWeekNum, dayOfWeekName, programName),
          isToday: targetDateStr === getTodayDateStr()
        };
      }
    }
  }

  // 3. Fallback: match day of week in the first week
  const dayName = getDayOfWeekName(targetDateStr);
  if (dayName) {
    const wp = matrixPlans[0];
    if (wp && wp.days?.[dayName]) {
      const cell = wp.days[dayName];
      return {
        weekNumber: wp.weekNumber,
        dayOfWeek: dayName,
        dayCell: cell,
        workoutPlan: convertDayCellToWorkoutPlan(cell, wp.weekNumber, dayName, programName),
        isToday: targetDateStr === getTodayDateStr()
      };
    }
  }

  return null;
}

/**
 * Finds a matching completed WorkoutSession for a given week, day, or date
 */
export function findMatchingCompletedWorkout(
  workouts: WorkoutSession[],
  weekNumber: number,
  day: DayOfWeek,
  targetDateStr?: string
): WorkoutSession | undefined {
  if (!workouts || workouts.length === 0) return undefined;

  // Exact match by metadata
  const byMeta = workouts.find((w) => w.weekNumber === weekNumber && w.dayOfWeek === day);
  if (byMeta) return byMeta;

  const byKey = workouts.find((w) => w.dayKey === `w${weekNumber}-${day}`);
  if (byKey) return byKey;

  // Match by date if provided
  if (targetDateStr) {
    const byDate = workouts.find((w) => w.date === targetDateStr);
    if (byDate) return byDate;
  }

  return undefined;
}

/**
  * Converts PlannedExercise[] to ExerciseLog[], rigorously preserving all planned sets (e.g. 6 sets)
  */
export function convertPlannedExercisesToLogs(planned: PlannedExercise[]): ExerciseLog[] {
  if (!planned || planned.length === 0) return [];

  return planned.map((pEx, pIdx) => {
    let sets: ExerciseSet[] = [];

    // 1. If explicit sets array is provided with items, convert all of them
    if (Array.isArray(pEx.sets) && pEx.sets.length > 0) {
      sets = pEx.sets.map((s, sIdx) => ({
        id: `set-${Date.now()}-${pIdx}-${sIdx}`,
        setNumber: s.setNumber || sIdx + 1,
        weight: typeof s.weight === "number" ? s.weight : (pEx.targetWeight || 50),
        reps: typeof s.reps === "number" ? s.reps : (parseInt(String(pEx.targetReps), 10) || 10),
        rpe: 8
      }));
    } else {
      // 2. Otherwise generate targetSets count (e.g. 6 sets)
      const setCount = typeof pEx.targetSets === "number" && pEx.targetSets > 0 ? pEx.targetSets : 3;
      const targetRepsNum = parseInt(String(pEx.targetReps), 10) || 10;
      const targetWeightNum = typeof pEx.targetWeight === "number" ? pEx.targetWeight : 50;

      for (let i = 1; i <= setCount; i++) {
        sets.push({
          id: `set-${Date.now()}-${pIdx}-${i}`,
          setNumber: i,
          weight: targetWeightNum,
          reps: targetRepsNum,
          rpe: 8
        });
      }
    }

    return {
      id: `ex-${Date.now()}-${pIdx}`,
      exerciseName: pEx.exerciseName,
      muscleGroup: pEx.muscleGroup as any,
      sets
    };
  });
}
