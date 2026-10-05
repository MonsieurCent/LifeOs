// Workout & Fitness Tracker Types
export type WeightUnit = "kg" | "lbs";

export type MuscleGroup =
  | "Chest"
  | "Back"
  | "Legs"
  | "Shoulders"
  | "Arms"
  | "Core"
  | "Full Body";

export type UserGender = "male" | "female" | "other";
export type ExperienceLevel = "beginner" | "intermediate" | "advanced";
export type FitnessGoal = "bulk" | "shred" | "longevity" | "strength" | "recomp" | "cut";
export type DayOfWeek = "Monday" | "Tuesday" | "Wednesday" | "Thursday" | "Friday" | "Saturday" | "Sunday";

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string;
  gender: UserGender;
  level: ExperienceLevel;
  goal: FitnessGoal;
  daysPerWeek: number;
  weightKg: number;
  heightCm: number;
  age: number;
  instagramHandle?: string;
  bio?: string;
  targetCalories?: number;
  macroSplit?: {
    proteinG: number;
    carbsG: number;
    fatsG: number;
  };
  connectedApps: {
    fitbit?: boolean;
    googleHealth: boolean;
    beurer: boolean;
    fatSecret: boolean;
    sats: boolean;
  };
  lastProgramChangeDate?: string; // YYYY-MM-DD for 2-week cooldown enforcement
  lastDietChangeDate?: string;
  onboardingCompleted: boolean;
  timezone?: string; // IANA Timezone, e.g. "Europe/Oslo" (defaults to Europe/Oslo)
  createdAt: string;
}

// Google Health API v4 Standardized Metrics Schema
export interface GoogleHealthMetrics {
  // Cardiovascular & Recovery
  restingHeartRate: number;      // bpm
  hrvRmssd: number;              // ms
  spo2Percent: number;           // %
  breathingRate: number;         // breaths/min
  skinTempVariation: number;     // °C deviation

  // Sleep Architecture
  sleepHours: number;            // hrs
  sleepScore: number;            // 0-100
  deepSleepMinutes: number;
  remSleepMinutes: number;
  lightSleepMinutes: number;
  awakeMinutes: number;

  // Energy & Body Composition
  activeCalories: number;        // kcal
  floorsClimbed: number;         // count
  bodyWeightKg: number;          // kg
  bodyFatPercent: number;        // %
  muscleMassPercent?: number;    // %
}

export interface GoogleHealthDailyMetric {
  date: string; // YYYY-MM-DD
  steps: number;
  distanceMeters: number;
  floors: number;
}

export interface GoogleHealthIntradayHour {
  hour: string; // "07:00", "08:00", etc.
  steps: number;
}

export interface GoogleHealthExerciseItem {
  id: string;
  name: string;
  exerciseType: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  caloriesKcal?: number;
  steps?: number;
  distanceMeters?: number;
  averageHeartRateBpm?: number;
  activeZoneMinutes?: number;
  deviceDisplayName?: string;
  platform?: string;
}

export interface GoogleHealthSyncDiagnostics {
  provider: string;
  metric: string;
  requestedDateRange: string;
  timezone: string;
  lastAttemptTime: string;
  lastSuccessfulTime?: string;
  responseStatus: number | string;
  returnedRecordCount: number;
  dataSourceStatus: "live" | "cached" | "stale" | "unavailable";
  syncStatus: "connected_pending_sync" | "syncing" | "updated" | "no_data" | "partially_synced" | "sync_failed" | "auth_expired";
  errorMessage?: string;
  requestId?: string;
  attemptStartTime?: string;
  attemptEndTime?: string;
  cacheUsage?: string;
  saveStatus?: string;
}

export interface GoogleHealthData extends Partial<GoogleHealthMetrics> {
  connected: boolean;
  lastSynced?: string;
  lastSyncedIso?: string;
  lastSuccessfulSyncIso?: string;
  apiProvider?: "google_health_api" | "health_connect" | "legacy_fitbit";
  device?: string;
  steps?: number;
  dailySteps?: number;
  todaySteps?: number;
  distanceKm?: number;
  todayDistanceKm?: number;
  floorsClimbed?: number;
  todayFloors?: number;
  todayExerciseCalories?: number;
  todayExerciseAzm?: number;
  todayActiveCalories?: number;
  todayTotalCalories?: number;
  activeCaloriesStatus?: "live" | "empty_results" | "missing_permission" | "unsupported_operation" | "request_failed";
  activeCaloriesReason?: string;
  totalCaloriesStatus?: "live" | "empty_results" | "missing_permission" | "unsupported_operation" | "request_failed";
  totalCaloriesReason?: string;
  sleepStatus?: "live" | "empty_results" | "missing_permission" | "unsupported_operation" | "request_failed";
  sleepReason?: string;
  sleepDate?: string;
  sleepStartTime?: string;
  sleepEndTime?: string;
  timeAsleepMinutes?: number;
  minutesInSleepPeriod?: number;
  sleepDurationFormatted?: string;
  weeklyStepsAverage?: number;
  weeklyStepsTotal?: number;
  athleteName?: string;
  athleteEmail?: string;
  avatarUrl?: string;
  recentExercises?: any[];
  dailyHistory?: GoogleHealthDailyMetric[];
  past7CompleteDays?: GoogleHealthDailyMetric[];
  intradayHourly?: GoogleHealthIntradayHour[];
  syncDiagnostics?: GoogleHealthSyncDiagnostics;
  restingHeartRate?: number;
  currentPulse?: number;
  lowestHeartRate?: number;
  peakHeartRate?: number;
  trainingDaysCount?: number;
  trainingDaysWeek?: number;
  hrvRmssd?: number;
  activeCalories?: number;
  sleepHours?: number;
  sleepScore?: number;
  deepSleepMinutes?: number;
  remSleepMinutes?: number;
  lightSleepMinutes?: number;
  awakeMinutes?: number;
  restlessMinutes?: number;
  breathingRate?: number;
  skinTempVariation?: number;
  bodyWeightKg?: number;
  bodyFatPercent?: number;
  muscleMassPercent?: number;
  muscleMassKg?: number;
  bodyWaterPercent?: number;
  boneMassKg?: number;
  visceralFatRating?: number;
  bmi?: number;
  bmrKcal?: number;
  bloodPressureSys?: number;
  bloodPressureDia?: number;
  spo2Percent?: number;
  activeZoneMinutes?: number;
  totalCaloriesBurned?: number;
  cadenceAvg?: number;
  grantedScopes?: string[];
  missingScopes?: string[];
  hasSleepScope?: boolean;
  hasHealthMetricsScope?: boolean;
  hasActivityScope?: boolean;
  isLiveApiMetric?: Record<string, boolean>;
}

export interface BeurerData {
  connected: boolean;
  lastSynced?: string;
  scaleWeightKg: number;
  bodyFatPercent: number;
  muscleMassPercent: number;
  visceralFatRating: number;
  bloodPressureSys: number;
  bloodPressureDia: number;
}

export interface FatSecretData {
  connected: boolean;
  lastSynced?: string;
  caloriesConsumed: number;
  proteinGrams: number;
  carbsGrams: number;
  fatGrams: number;
  waterMl: number;
  targetAdherencePercent: number;
}

export interface SatsData {
  connected: boolean;
  lastSynced?: string;
  homeClub: string;
  monthlyVisits: number;
  lastCheckIn?: string;
  membershipStatus: string;
  bookedClassesCount: number;
}

export interface FitbitData {
  connected: boolean;
  lastSynced?: string;
  device?: string;
  // Pulse & Heart Rate
  restingHeartRate: number;
  currentPulse: number;
  hrvRmssd: number; // Heart rate variability ms
  cardioMinutes: number; // Active cardio / fat burn / peak minutes
  peakHeartRate: number;
  // Sleep Architecture
  sleepScore: number;
  totalSleepHours: number;
  deepSleepMinutes: number; // Deep sleep in minutes (growth hormone & recovery)
  remSleepMinutes: number;   // REM sleep in minutes (cognitive restoration)
  lightSleepMinutes: number; // Light sleep in minutes
  awakeMinutes: number;      // Restless / awake in minutes
  // Activity & Vitals
  dailySteps: number;
  caloriesBurned: number;
  distanceKm: number;
  activeZoneMinutes: number; // AZM
  floorsClimbed: number;
  // Biometrics
  spo2Percent: number;        // Blood oxygen saturation %
  breathingRate: number;      // Breaths / min
  skinTempVariation: number;  // Deviation in °C from baseline
}

export interface SyncedHealthMetrics {
  fitbit: FitbitData;
  googleHealth: GoogleHealthData;
  beurer: BeurerData;
  fatSecret: FatSecretData;
  sats: SatsData;
  readinessScore?: number;
  hrvMs?: number;
  sleepHours?: number;
}

export interface SessionFeeling {
  workoutId: string;
  rating: number; // 1 (Exhausted/Struggling) to 5 (Effortless/Peak)
  soreness: number; // 1 (None) to 5 (Extremely sore)
  rpeAverage?: number;
  energyLevel: "low" | "medium" | "high";
  notes?: string;
  loggedAt: string;
}

export interface SupplementEntry {
  id: string;
  name: string;
  dosage: string;
  category: string; // supports custom categories
  timeOfDay: "morning" | "pre-workout" | "post-workout" | "evening";
  timing?: string;
  notes?: string;
  taken: boolean;
  lastTakenDate?: string;
  streakDays: number;
}

export interface TrainingProgram {
  id: string;
  name: string;
  goal: FitnessGoal;
  description: string;
  primaryObjective: string;
  secondaryObjective?: string;
  splitDaysPerWeek: number;
  daysPerWeek?: number;
  durationWeeks: number;
  totalWeeks?: number;
  matrixPlans: WeeklyMatrixPlan[];
  isCustom?: boolean;
  createdAt?: string;
  updatedAt?: string;
  deletedAt?: string;
  userId?: string;
}

export interface DailyMealPlan {
  id: string;
  mealName: string;
  timing: string;
  targetCalories: number;
  targetProteinG: number;
  targetCarbsG: number;
  targetFatsG: number;
  recommendedFoods: string[];
  scientificRationale: string;
}

export interface ProgressPhoto {
  id: string;
  date: string;
  phase: "before" | "after" | "check-in";
  weightKg: number;
  bodyFatPercent?: number;
  photoUrl: string;
  notes?: string;
}

export interface MatrixDayCell {
  day: DayOfWeek;
  date?: string; // e.g. "2026-09-14"
  workoutTitle: string;
  isRestDay: boolean;
  targetMuscleGroup?: string;
  mainFocus?: string;
  exercises: PlannedExercise[];
  notes?: string;
  gymId?: string;
  gymName?: string;
  updatedAt?: string;
}

export interface WeeklyMatrixPlan {
  weekNumber: number;
  weekTheme?: string;
  startDate?: string; // e.g. "2026-09-14"
  isDeload?: boolean;
  days: Record<DayOfWeek, MatrixDayCell>;
  updatedAt?: string;
}

export interface ExerciseVideo {
  id: string;
  name: string;
  muscleGroup: MuscleGroup;
  videoUrl: string;
  thumbnailUrl: string;
  cues: string[];
  commonMistakes: string[];
}

export type SetType = "warmup" | "working" | "drop" | "failure";
export type SetCompletionState = "pending" | "done" | "skipped";

export interface ExerciseSet {
  id: string;
  setNumber: number;
  weight: number;
  reps: number;
  rpe?: number;
  isPr?: boolean;
  isCompleted?: boolean;
  state?: SetCompletionState;
  setType?: SetType;
  targetWeight?: number;
  targetReps?: string | number;
}

export type EquipmentType =
  | "barbell"
  | "dumbbell"
  | "cable"
  | "cable_machine"
  | "machine"
  | "plate_loaded_machine"
  | "selectorized_machine"
  | "smith"
  | "smith_machine"
  | "ez_bar"
  | "bodyweight"
  | "resistance_band"
  | "kettlebell"
  | "other";

export const EQUIPMENT_LABELS: Record<string, string> = {
  barbell: "Barbell",
  dumbbell: "Dumbbell",
  cable: "Cable Station",
  cable_machine: "Cable Machine",
  machine: "Lever / Machine",
  plate_loaded_machine: "Plate-Loaded Machine",
  selectorized_machine: "Pin-Loaded Machine",
  smith: "Smith Machine",
  smith_machine: "Smith Machine",
  ez_bar: "EZ Bar",
  bodyweight: "Bodyweight",
  resistance_band: "Resistance Band",
  kettlebell: "Kettlebell",
  other: "Other"
};

export type LoadConvention = "total" | "per_hand" | "bar_included";

export interface GymMachine {
  id: string;
  gymId: string;
  name: string;
  customName?: string;
  category: MuscleGroup;
  brand?: string;
  model?: string;
  stationLabel?: string;
  seatSettings?: string;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface Gym {
  id: string;
  name: string;
  location?: string;
  address?: string;
  lat?: number;
  lng?: number;
  googlePlaceId?: string;
  rating?: number;
  userRatingsTotal?: number;
  distanceKm?: number;
  mapsUrl?: string;
  isDefault?: boolean;
  machines?: GymMachine[];
  isArchived?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface ExerciseLog {
  id: string;
  exerciseName: string;
  muscleGroup: MuscleGroup;
  sets: ExerciseSet[];
  notes?: string;
  equipmentType?: EquipmentType;
  loadConvention?: LoadConvention;
  machineId?: string;
  machineName?: string;
  stationLabel?: string;
  gymId?: string;
  isWarmup?: boolean;
}

export interface WorkoutSession {
  id: string;
  workoutId?: string;
  sessionId?: string;
  sourcePlanId?: string;
  date: string; // YYYY-MM-DD
  time?: string; // HH:mm
  dayOfWeek?: string;
  title: string;
  durationMinutes: number;
  duration?: number;
  exercises: ExerciseLog[];
  notes?: string;
  syncedToSheet?: boolean;
  weekNumber?: number;
  dayKey?: string;
  programId?: string;
  planId?: string;
  gymId?: string;
  gymName?: string;
  isCheckedIn?: boolean;
  checkInTime?: string;
  checkInGymName?: string;
  checkInGymId?: string;
  checkInAddress?: string;
  checkInDistanceKm?: number;
  checkInLocation?: { lat: number; lng: number };
  createdAt?: string;
  completedAt?: string;
  savedAt?: string;
  deviceId?: string;
  deviceName?: string;
  updatedAt?: string;
  deletedAt?: string;
  revision?: number;
  volume?: number;
  rpe?: number;
  sessionRpe?: number;
  status?: "planned" | "in_progress" | "completed";
  userId?: string;
}

export interface ExerciseReference {
  id?: string;
  name: string;
  muscleGroup: MuscleGroup;
  defaultIncrement: number;
  isCustom?: boolean;
}

export interface PlannedSet {
  setNumber: number;
  weight?: number; // can be undefined/blank
  reps?: number | string; // can be undefined/blank
  rpe?: number;
}

export interface PlannedExercise {
  exerciseName: string;
  muscleGroup: MuscleGroup;
  targetSets: number;
  targetReps: string; // e.g. "8-12" or "10"
  targetWeight?: number;
  warmupNotes?: string;
  notes?: string;
  sets?: PlannedSet[];
  progressionNote?: string;
  equipmentType?: EquipmentType;
  machineId?: string;
  machineName?: string;
  stationLabel?: string;
}

export interface WorkoutPlan {
  id: string;
  name: string; // e.g. "Day 1 (Back)"
  targetMuscleGroup?: string;
  exercises: PlannedExercise[];
  scheduledDate?: string; // YYYY-MM-DD
  weekNumber?: number;
  dayOfWeek?: DayOfWeek | string;
  dayKey?: string;
  notes?: string;
  gymId?: string;
  gymName?: string;
}

export interface SpreadsheetConfig {
  connected: boolean;
  sheetUrl: string;
  webhookUrl: string;
  lastSyncedAt?: string;
  autoSync: boolean;
}

export interface ExerciseProgressionItem {
  exerciseName: string;
  gymName?: string;
  bodypart: MuscleGroup;
  aiMatched: boolean;
  baselineWeight: number; // in kg
  currentWeight: number; // in kg
  weightChange: number; // in kg (current - baseline)
  percentChange: number; // in %
  baselineE1RM: number; // in kg
  currentE1RM: number; // in kg
  e1rmChange: number; // in kg
  e1rmPercentChange: number; // in %
  totalSets: number;
  setsThisWeek: number;
  sessionsCount: number;
  history: {
    date: string;
    weight: number;
    reps: number;
    e1rm: number;
    setsCount: number;
  }[];
  latestDate: string;
  isPr: boolean;
}

export interface BodypartSetsSummary {
  bodypart: MuscleGroup;
  setsThisWeek: number;
  totalSets: number;
  targetWeeklySets: number;
  percentageOfTarget: number;
  status: "low" | "optimal" | "high";
  exercises: { name: string; setsThisWeek: number; totalSets: number }[];
}

export interface BodyCompositionRecord {
  id: string;
  date: string; // YYYY-MM-DD
  time?: string; // HH:mm
  measuredAt?: string; // ISO timestamp
  weightKg: number;
  bodyFatPercent?: number; // %
  muscleMassKg?: number; // Muscle mass in kg (rendered in user's unit: kg or lb)
  muscleMassPercent?: number; // Muscle mass percentage (%)
  skeletalMusclePercent?: number; // Skeletal muscle percentage (%) distinct from muscle mass %
  boneMassKg?: number;
  boneMassUnit?: "kg" | "lbs";
  waterPercent?: number; // Body water %
  visceralFat?: number; // Visceral fat level/rating
  visceralFatUnit?: string; // Stated unit or index label (e.g. "Index 1-59")
  bmrKcal?: number; // Basal metabolic rate in kcal/day
  waistCm?: number;
  notes?: string;
  source?: "google_health" | "smart_scale" | "manual" | "seeded_demo";
  isDemo?: boolean;
  createdAt?: string;
  updatedAt?: string;
  deletedAt?: string;
  revision?: number;
  userId?: string;
}

export interface HealthTrainingReport {
  id: string;
  generatedAt: string;
  source: string;
  timeRange: "7d" | "14d" | "30d" | "90d" | "custom";
  startDate: string;
  endDate: string;
  periodLabel: string;
  overallScore: number; // 0 - 100
  overallStatus: string; // e.g. "Prime Adaptive State", "Optimal Recovery", "Accumulating Fatigue", "Under-Recovered"
  executiveSummary: string;
  metricsSnapshot: {
    workoutCount: number;
    totalVolumeKg: number;
    avgRpe: number;
    avgSleepHours: number;
    avgDailySteps: number;
    avgDailyBurnKcal: number;
    avgRestingHeartRate: number;
    avgHrvMs?: number;
  };
  biometricSignals: {
    sleepAndCns: {
      score: number;
      avgSleepFormatted: string;
      sleepQuality: string;
      deepSleepAvg?: string;
      remSleepAvg?: string;
      restingHeartRateAvg: string;
      hrvStatus: string;
      analysis: string;
    };
    metabolicAndEnergy: {
      score: number;
      avgDailyBurnKcal: number;
      targetIntakeKcal: number;
      netBalanceKcal: string;
      avgDailySteps: number;
      stepImpact: string;
      analysis: string;
    };
    trainingStrain: {
      score: number;
      totalVolumeKg: number;
      completedSessions: number;
      avgRpe: number;
      topMuscleGroups: string[];
      recoveryReadiness: string;
      analysis: string;
    };
  };
  longitudinalTrends: {
    metric: string;
    trend: "upward" | "downward" | "stable";
    detail: string;
  }[];
  prescriptiveActionPlan: {
    id: string;
    category: "steps" | "sleep" | "nutrition" | "training";
    title: string;
    recommendation: string;
    rationale: string;
    priority: "high" | "medium" | "low";
  }[];
}


