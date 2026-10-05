import React, { useState, useEffect, useRef, useCallback } from "react";
import { Navigation, NavTab } from "./components/Navigation";
import { SummaryCards } from "./components/SummaryCards";
import { ProgressionCharts } from "./components/ProgressionCharts";
import { WorkoutLogger } from "./components/WorkoutLogger";
import { WorkoutHistory } from "./components/WorkoutHistory";
import { SpreadsheetSyncModal } from "./components/SpreadsheetSyncModal";
import { ExecutiveSummaryModal } from "./components/ExecutiveSummaryModal";
import { WeeklyMatrixPlanner } from "./components/WeeklyMatrixPlanner";
import { AiCoachPanel } from "./components/AiCoachPanel";
import { OnboardingModal } from "./components/OnboardingModal";
import { ProfilePage } from "./components/ProfilePage";
import { HealthIntegrationsModal } from "./components/HealthIntegrationsModal";
import { SessionFeelingModal } from "./components/SessionFeelingModal";
import { ExerciseVideoModal } from "./components/ExerciseVideoModal";
import { SupplementsTracker } from "./components/SupplementsTracker";
import { ProgressPhotosModal } from "./components/ProgressPhotosModal";
import { AiProgramGeneratorModal } from "./components/AiProgramGeneratorModal";
import { TodaySessionDiary } from "./components/TodaySessionDiary";
import { BodyCompositionView } from "./components/BodyCompositionView";
import { HealthView } from "./components/HealthView";
import { DashboardScheduledSessionCard } from "./components/DashboardScheduledSessionCard";
import { CloudSyncModal } from "./components/CloudSyncModal";
import { AuthModal } from "./components/AuthModal";

import {
  WorkoutSession,
  WeightUnit,
  WorkoutPlan,
  UserProfile,
  SyncedHealthMetrics,
  WeeklyMatrixPlan,
  SupplementEntry,
  ProgressPhoto,
  SessionFeeling,
  TrainingProgram,
  DayOfWeek,
  BodyCompositionRecord,
  MuscleGroup,
  Gym
} from "./types";
import { cleanNumber } from "./utils/sessionResolver";
import { formatLocalDateISO, getWeekStartMonday, getDifferenceInDays } from "./utils/dateUtils";
import { INITIAL_WORKOUTS, calculateSessionVolume, deduplicateWorkouts, generateStableId } from "./utils/calculations";
import {
  DEFAULT_USER_PROFILE,
  INITIAL_HEALTH_METRICS,
  INITIAL_SUPPLEMENTS,
  INITIAL_PROGRESS_PHOTOS,
  DEFAULT_SUPPLEMENT_CATEGORIES,
  createInitialMatrixPlan,
  calculateHormoneAndMacroPlan,
  createPreplannedPrograms,
  DAYS_OF_WEEK,
  autoFillWeeksFromWeek1,
  getTodayOrCurrentMondayDate,
  shiftAllMatrixDates,
  getStoredCustomExercises,
  convertDayCellToWorkoutPlan,
  findPlannedSessionForDate,
  findMatchingCompletedWorkout,
  sanitizeSingleMuscleMatrix,
  isLegacyPplPlan,
  computeDateForDay,
  CANONICAL_PROGRAM_START_DATE
} from "./utils/fitnessData";
import { validateGoogleHealthApiResponse } from "./utils/healthSchemas";
import {
  sanitizeForFirestore,
  getDeviceId,
  mergeWorkouts,
  mergeBodyCompRecords,
  mergePrograms,
  mergeWeeklyMatrixPlans,
  LocalSyncSnapshot,
  executeTransactionalSync,
  mergeLocalWithServerDocument
} from "./utils/firestoreSync";
import {
  fetchServerSyncStore,
  postServerSyncStore,
  subscribeServerSyncEvents
} from "./utils/serverSync";
import {
  getUserStorageKey,
  safeGetItem,
  safeSetItem,
  safeRemoveItem,
  createLocalPreMigrationBackup,
  getTombstones,
  addTombstone,
  mergeTombstones,
  getPendingOperations,
  enqueuePendingOperation,
  removePendingOperation,
  clearPendingOperations,
  removeWorkoutDraft,
  migrateGuestDataToUser,
  loadScopedUserData,
  saveScopedField,
  sanitizeUserWorkouts,
  sanitizeCompletedDaysRecord,
  getPersistentSyncState,
  savePersistentSyncState,
  markModuleDirty,
  markSyncConfirmed,
  getStoredGyms,
  saveStoredGyms,
  getUserStorageKey
} from "./utils/userStorage";
import { SyncStatus } from "./utils/syncTypes";
import {
  computeCanonicalDataHash,
  evaluateSyncNecessity,
  resolveCanonicalSyncStatus,
  buildNormalizedModulePayloads,
  calculateDailyQuotaResetTime,
  getStoredQuotaCooldown,
  setStoredQuotaCooldown,
  clearStoredQuotaCooldown,
  isFirestoreQuotaCooldownActive,
  executeCloudSyncEngine
} from "./utils/syncManager";
import { firestoreTracker } from "./utils/firestoreInstrumentation";
import { workoutRepository } from "./repositories/workoutRepository";
import { planRepository } from "./repositories/planRepository";
import { programRepository } from "./repositories/programRepository";
import { measurementRepository } from "./repositories/measurementRepository";
import { exerciseRepository } from "./repositories/exerciseRepository";
import { profileRepository } from "./repositories/profileRepository";
import { migrationService } from "./services/migrationService";
import { sessionRecoveryService, SessionRecoveryReport } from "./services/sessionRecoveryService";
import { 
  auth, 
  db, 
  googleProvider, 
  signInWithPopup, 
  signInAnonymously, 
  signOut,
  onAuthStateChanged, 
  doc, 
  setDoc, 
  getDoc, 
  getDocFromServer,
  runTransaction,
  onSnapshot,
  disableNetwork,
  enableNetwork,
  User as FirebaseUser 
} from "./lib/firebase";

import {
  PlusCircle,
  FileSpreadsheet,
  ArrowRight,
  CheckCircle2,
  History,
  CalendarRange,
  FileDown,
  Printer,
  Sparkles,
  Heart,
  Pill,
  MessageSquare,
  User,
  Activity,
  Play,
  Camera,
  Smile,
  BookOpen,
  Layers,
  Calendar,
  Dumbbell,
  Clock,
  ChevronRight
} from "lucide-react";

const INITIAL_DEFAULTS = {
  defaultWorkouts: [] as WorkoutSession[],
  defaultPrograms: createPreplannedPrograms(),
  defaultMatrixPlans: createInitialMatrixPlan(),
  defaultProfile: DEFAULT_USER_PROFILE,
  defaultHealthMetrics: INITIAL_HEALTH_METRICS,
  defaultSupplements: INITIAL_SUPPLEMENTS,
  defaultSupplementCategories: DEFAULT_SUPPLEMENT_CATEGORIES,
  defaultProgressPhotos: INITIAL_PROGRESS_PHOTOS
};

export function App() {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [isCloudSyncing, setIsCloudSyncing] = useState<boolean>(false);
  const [cloudSyncStatus, setCloudSyncStatus] = useState<SyncStatus>(() => {
    if (isFirestoreQuotaCooldownActive()) {
      return "Cloud quota reached, pending sync";
    }
    return getPersistentSyncState("guest").status || "Saved locally";
  });
  const currentUid = firebaseUser?.uid || "guest";

  const initialGuestData = useRef(loadScopedUserData("guest", INITIAL_DEFAULTS));

  const [workouts, setWorkouts] = useState<WorkoutSession[]>(() => sanitizeUserWorkouts(initialGuestData.current.workouts));
  const [importedSessionIds, setImportedSessionIds] = useState<string[]>([]);

  const [unit, setUnit] = useState<WeightUnit>(() => {
    try {
      const savedUnit = localStorage.getItem("pulse_fitness_unit");
      if (savedUnit === "kg" || savedUnit === "lbs") return savedUnit;
    } catch (e) {}
    return "kg";
  });

  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem("pulse_dark_mode");
      if (saved !== null) return saved === "true";
    } catch (e) {}
    return false;
  });

  useEffect(() => {
    try {
      localStorage.setItem("pulse_dark_mode", String(isDarkMode));
      if (isDarkMode) {
        document.documentElement.classList.add("dark");
      } else {
        document.documentElement.classList.remove("dark");
      }
    } catch (e) {}
  }, [isDarkMode]);

  const handleToggleDarkMode = () => {
    setIsDarkMode((prev) => !prev);
  };

  const [userProfile, setUserProfile] = useState<UserProfile>(() => initialGuestData.current.userProfile);
  const [healthMetrics, setHealthMetrics] = useState<SyncedHealthMetrics>(() => initialGuestData.current.healthMetrics);
  const [matrixPlans, setMatrixPlans] = useState<WeeklyMatrixPlan[]>(() => {
    const rawPlans = initialGuestData.current.matrixPlans;
    const activeProgId = initialGuestData.current.activeProgramId;
    const activeProg = initialGuestData.current.programs.find((p) => p.id === activeProgId);
    const isSingleMuscle =
      activeProgId === "prog-single-muscle" ||
      activeProgId === "prog-hypertrophy-5day" ||
      activeProg?.name?.toLowerCase().includes("single muscle");
    if (isSingleMuscle) {
      return sanitizeSingleMuscleMatrix(rawPlans, undefined, activeProgId, activeProg?.name);
    }
    return rawPlans;
  });
  const [programs, setPrograms] = useState<TrainingProgram[]>(() => initialGuestData.current.programs);
  const [activeProgramId, setActiveProgramId] = useState<string>(() => initialGuestData.current.activeProgramId);
  const [completedDaysRecord, setCompletedDaysRecord] = useState<Record<string, boolean>>(() => initialGuestData.current.completedDaysRecord);
  const [supplements, setSupplements] = useState<SupplementEntry[]>(() => initialGuestData.current.supplements);
  const [supplementCategories, setSupplementCategories] = useState<string[]>(() => initialGuestData.current.supplementCategories);

  const handleUpdateSupplementCategories = (updated: string[]) => {
    setSupplementCategories(updated);
  };

  const [progressPhotos, setProgressPhotos] = useState<ProgressPhoto[]>(() => initialGuestData.current.progressPhotos);
  const [sessionFeelings, setSessionFeelings] = useState<SessionFeeling[]>(() => initialGuestData.current.sessionFeelings);
  const [bodyCompRecords, setBodyCompRecords] = useState<BodyCompositionRecord[]>(() => initialGuestData.current.bodyCompRecords);

  // Automatically hydrate body composition measurements from MeasurementRepository across local/cloud
  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const localRecords = await measurementRepository.getAllLocalMeasurements(currentUid);
        if (isMounted && localRecords.length > 0) {
          setBodyCompRecords((prev) => mergeBodyCompRecords(prev, localRecords));
        }
        if (currentUid && currentUid !== "guest" && navigator.onLine) {
          const remoteRecords = await measurementRepository.fetchRemoteMeasurements(currentUid);
          if (isMounted && remoteRecords.length > 0) {
            setBodyCompRecords((prev) => mergeBodyCompRecords(prev, remoteRecords));
          }
        }
      } catch (err) {
        console.warn("Notice hydrating measurements repository:", err);
      }
    })();
    return () => { isMounted = false; };
  }, [currentUid]);

  // Ensure matrix plans match active program and are not stuck on old legacy PPL
  useEffect(() => {
    // Strictly verify activeProgramId before applying single muscle matrix sanitization
    const activeProgram = programs.find((p) => p.id === activeProgramId);
    const isSingleMuscleProgram =
      activeProgramId === "prog-single-muscle" ||
      activeProgramId === "prog-hypertrophy-5day" ||
      activeProgram?.name?.toLowerCase().includes("single muscle");

    if (isSingleMuscleProgram) {
      if (activeProgramId === "prog-hypertrophy-5day") {
        setActiveProgramId("prog-single-muscle");
        saveScopedField(currentUid, "active_program_id", "prog-single-muscle");
      }
      const needsDateOrPplSanitization =
        isLegacyPplPlan(matrixPlans) ||
        matrixPlans.some((wp, idx) => {
          const expectedStart = computeDateForDay(CANONICAL_PROGRAM_START_DATE, idx + 1, "Monday");
          return wp.startDate !== expectedStart || wp.days?.Monday?.date !== expectedStart;
        });
      if (needsDateOrPplSanitization) {
        const sanitized = sanitizeSingleMuscleMatrix(matrixPlans, undefined, activeProgramId, activeProgram?.name);
        const currentJson = JSON.stringify(matrixPlans);
        const sanitizedJson = JSON.stringify(sanitized);
        if (currentJson !== sanitizedJson) {
          console.log(`[ProgramHydration] Strictly verified activeProgramId (${activeProgramId} - "${activeProgram?.name || "Single Muscle Split"}") -> applying Single Muscle matrix sanitization`);
          setMatrixPlans(sanitized);
          saveScopedField(currentUid, "matrix_plans", sanitized);
          sanitized.forEach((pl) => planRepository.savePlan(currentUid, pl).catch(() => {}));
        }
      }
    }
  }, [activeProgramId, matrixPlans, currentUid, programs]);

  // Ensure completedDaysRecord stays clean and accurate relative to actual workouts
  useEffect(() => {
    setCompletedDaysRecord((prev) => {
      const next = sanitizeCompletedDaysRecord(prev, workouts);
      const prevKeys = Object.keys(prev || {});
      const nextKeys = Object.keys(next || {});
      if (prevKeys.length === nextKeys.length && prevKeys.every((k) => prev[k] === next[k])) {
        return prev;
      }
      return next;
    });
  }, [workouts]);

  // Synchronize latest logged body weight across user profile & health metrics
  useEffect(() => {
    if (bodyCompRecords && bodyCompRecords.length > 0) {
      const sorted = [...bodyCompRecords].sort((a, b) => b.date.localeCompare(a.date));
      const latest = sorted[0];
      if (latest && latest.weightKg && latest.weightKg > 0) {
        setUserProfile((prev) => {
          if (prev.weightKg === latest.weightKg && prev.targetCalories) return prev;
          const macros = calculateHormoneAndMacroPlan(prev.gender, prev.goal, latest.weightKg);
          return {
            ...prev,
            weightKg: latest.weightKg,
            targetCalories: macros.totalCalories,
            macroSplit: {
              proteinG: macros.proteinGrams,
              carbsG: macros.carbsGrams,
              fatsG: macros.fatGrams
            }
          };
        });
        setHealthMetrics((prev) => ({
          ...prev,
          googleHealth: {
            ...prev.googleHealth,
            bodyWeightKg: latest.weightKg,
            ...(latest.bodyFatPercent !== undefined ? { bodyFatPercent: latest.bodyFatPercent } : {})
          },
          fitbit: {
            ...prev.fitbit,
            bodyWeightKg: latest.weightKg,
            ...(latest.bodyFatPercent !== undefined ? { bodyFatPercent: latest.bodyFatPercent } : {}),
            ...(latest.muscleMassPercent !== undefined ? { muscleMassPercent: latest.muscleMassPercent } : {})
          },
          beurer: {
            ...prev.beurer,
            scaleWeightKg: latest.weightKg,
            ...(latest.bodyFatPercent !== undefined ? { bodyFatPercent: latest.bodyFatPercent } : {}),
            ...(latest.muscleMassPercent !== undefined ? { muscleMassPercent: latest.muscleMassPercent } : {})
          }
        }));
      }
    }
  }, [bodyCompRecords]);

  const handleAddBodyCompRecord = (record: BodyCompositionRecord) => {
    setBodyCompRecords((prev) => mergeBodyCompRecords(prev, [record]));
    if (record.weightKg && record.weightKg > 0) {
      const macros = calculateHormoneAndMacroPlan(userProfile.gender, userProfile.goal, record.weightKg);
      setUserProfile((prev) => ({
        ...prev,
        weightKg: record.weightKg,
        targetCalories: macros.totalCalories,
        macroSplit: {
          proteinG: macros.proteinGrams,
          carbsG: macros.carbsGrams,
          fatsG: macros.fatGrams
        }
      }));
      setHealthMetrics((prev) => ({
        ...prev,
        googleHealth: {
          ...prev.googleHealth,
          bodyWeightKg: record.weightKg,
          ...(record.bodyFatPercent !== undefined ? { bodyFatPercent: record.bodyFatPercent } : {})
        },
        fitbit: {
          ...prev.fitbit,
          bodyWeightKg: record.weightKg,
          ...(record.bodyFatPercent !== undefined ? { bodyFatPercent: record.bodyFatPercent } : {}),
          ...(record.muscleMassPercent !== undefined ? { muscleMassPercent: record.muscleMassPercent } : {})
        },
        beurer: {
          ...prev.beurer,
          scaleWeightKg: record.weightKg,
          ...(record.bodyFatPercent !== undefined ? { bodyFatPercent: record.bodyFatPercent } : {}),
          ...(record.muscleMassPercent !== undefined ? { muscleMassPercent: record.muscleMassPercent } : {})
        }
      }));
    }
    measurementRepository.saveMeasurement(currentUid, record).catch(() => {});
    setToastMessage(`Body composition record for ${record.date} (${record.weightKg} kg) saved successfully!`);
    setTimeout(() => setToastMessage(null), 4000);
  };

  const handleUpdateBodyCompRecord = (id: string, updated: Partial<BodyCompositionRecord>) => {
    setBodyCompRecords((prev) => {
      const next = prev.map((r) => {
        if (r.id === id) {
          const merged = { ...r, ...updated };
          measurementRepository.saveMeasurement(currentUid, merged).catch(() => {});
          return merged;
        }
        return r;
      });
      const sorted = [...next].sort((a, b) => b.date.localeCompare(a.date));
      const latest = sorted[0];
      if (latest && latest.weightKg && latest.weightKg > 0) {
        const macros = calculateHormoneAndMacroPlan(userProfile.gender, userProfile.goal, latest.weightKg);
        setUserProfile((p) => ({
          ...p,
          weightKg: latest.weightKg,
          targetCalories: macros.totalCalories,
          macroSplit: {
            proteinG: macros.proteinGrams,
            carbsG: macros.carbsGrams,
            fatsG: macros.fatGrams
          }
        }));
      }
      return next;
    });
    setToastMessage("Record updated successfully.");
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleDeleteBodyCompRecord = (id: string) => {
    addTombstone(currentUid, "bodyComp", id);
    measurementRepository.deleteMeasurement(currentUid, id).catch(() => {});
    setBodyCompRecords((prev) => prev.filter((r) => r.id !== id));
    setToastMessage("Record deleted.");
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleSyncGoogleHealthBodyComp = async () => {
    console.info("[Google Health Sync] Initiating body composition synchronization with Zod validation...");
    const savedToken = localStorage.getItem("google_health_token");
    const tokenToSend = savedToken || "stored";

    try {
      setToastMessage("Fetching live scale biometrics from Google Health API...");
      const res = await fetch("/api/fitness/google-health-live-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: tokenToSend })
      });

      // 1. Validate HTTP response status
      if (!res.ok) {
        let errorBody: any = null;
        try {
          errorBody = await res.json();
        } catch {
          errorBody = await res.text().catch(() => null);
        }
        console.error(`[Google Health Sync] HTTP Error ${res.status} (${res.statusText}):`, errorBody);

        const errorMsg =
          (typeof errorBody === "object" && errorBody?.error) ||
          (typeof errorBody === "object" && errorBody?.message) ||
          (typeof errorBody === "string" && errorBody) ||
          `Server returned HTTP ${res.status} (${res.statusText})`;

        try {
          localStorage.setItem("google_health_last_raw_payload", JSON.stringify(errorBody || { error: errorMsg, status: res.status }, null, 2));
          localStorage.setItem(
            "google_health_last_raw_payload_meta",
            JSON.stringify({
              timestamp: new Date().toISOString(),
              status: res.status,
              endpoint: "/api/fitness/google-health-live-test",
              error: true
            })
          );
        } catch (e) {}

        setToastMessage(`Google Health API error: ${errorMsg}. Please verify your connection.`);
        setTimeout(() => setToastMessage(null), 5000);
        setIsHealthModalOpen(true);
        return;
      }

      // 2. Parse raw JSON structure safely
      let rawData: unknown;
      try {
        rawData = await res.json();
      } catch (parseErr: any) {
        console.error("[Google Health Sync] Malformed response: Failed to parse JSON body:", parseErr);
        setToastMessage("Failed to process Google Health API response: Invalid JSON received from server.");
        setTimeout(() => setToastMessage(null), 5000);
        setIsHealthModalOpen(true);
        return;
      }

      console.info("[Google Health Sync] Received raw response payload for Zod validation:", rawData);

      try {
        localStorage.setItem("google_health_last_raw_payload", JSON.stringify(rawData, null, 2));
        localStorage.setItem(
          "google_health_last_raw_payload_meta",
          JSON.stringify({
            timestamp: new Date().toISOString(),
            status: res.status,
            endpoint: "/api/fitness/google-health-live-test",
            source: "App.tsx (Body Comp Sync)"
          })
        );
      } catch (storageErr) {
        console.warn("Failed to cache Google Health raw payload in localStorage", storageErr);
      }

      // 3. Rigorous Zod Schema Validation
      const validation = validateGoogleHealthApiResponse(rawData);

      // Case A: Schema contract mismatch or malformed structure
      if (validation.type === "schema_invalid") {
        console.error(
          "[Google Health Sync] Zod Schema Validation Failed:",
          validation.errorMessage,
          validation.validationIssues,
          "Raw payload:",
          rawData
        );
        setToastMessage(
          `Google Health response failed schema validation: ${validation.errorMessage}. Please check API logs or enter measurements manually.`
        );
        setTimeout(() => setToastMessage(null), 6000);
        setIsHealthModalOpen(true);
        return;
      }

      // Case B: API-level failure reported by server
      if (validation.type === "api_error") {
        console.error("[Google Health Sync] API returned failure:", validation.errorMessage, validation.instruction);
        setToastMessage(`Google Health sync failed: ${validation.errorMessage}`);
        setTimeout(() => setToastMessage(null), 5000);
        setIsHealthModalOpen(true);
        return;
      }

      // Case C: Valid response but empty data (no weight records in account)
      if (validation.type === "success_empty") {
        console.warn("[Google Health Sync] Empty dataset: No weight measurements found in account.", rawData);
        setToastMessage(
          validation.errorMessage ||
            "Google Health is connected, but no weight records were found in your Google Fit/Health history. Please enter your measurement manually."
        );
        setTimeout(() => setToastMessage(null), 5000);
        setIsHealthModalOpen(true);
        return;
      }

      // Case D: Valid physiological metrics extracted & verified by Zod
      const metrics = validation.metrics;
      if (!metrics) {
        console.error("[Google Health Sync] Unexpected state: Successful validation returned no metrics object.", validation);
        setToastMessage("Google Health API returned empty measurement data. Please enter your weight manually.");
        setTimeout(() => setToastMessage(null), 5000);
        setIsHealthModalOpen(true);
        return;
      }

      const today = new Date().toISOString().split("T")[0];
      const w = metrics.weightKg;
      const newRecord: BodyCompositionRecord = {
        id: `bc-${Date.now()}`,
        date: today,
        weightKg: Number(w.toFixed(1)),
        notes: "Synced via Google Health Smart Scale",
        source: "google_health"
      };
      if (typeof metrics.bodyFatPercent === "number") {
        newRecord.bodyFatPercent = metrics.bodyFatPercent;
      }
      if (typeof metrics.muscleMassPercent === "number") {
        newRecord.muscleMassPercent = metrics.muscleMassPercent;
      }
      if (typeof metrics.waterPercent === "number") {
        newRecord.waterPercent = metrics.waterPercent;
      }
      if (typeof metrics.boneMassKg === "number") {
        newRecord.boneMassKg = metrics.boneMassKg;
      }
      if (typeof metrics.visceralFat === "number") {
        newRecord.visceralFat = metrics.visceralFat;
      }
      if (typeof metrics.bmrKcal === "number") {
        newRecord.bmrKcal = metrics.bmrKcal;
      }

      console.info("[Google Health Sync] Successfully verified with Zod and committed record:", newRecord);
      setBodyCompRecords((prev) => {
        const todayIdx = prev.findIndex(r => r.date === today);
        if (todayIdx >= 0) {
          const updated = [...prev];
          updated[todayIdx] = {
            ...updated[todayIdx],
            ...newRecord,
            id: updated[todayIdx].id
          };
          return updated;
        }
        return [...prev, newRecord];
      });

      const macros = calculateHormoneAndMacroPlan(userProfile.gender, userProfile.goal, w);
      setUserProfile((prev) => ({
        ...prev,
        weightKg: Number(w.toFixed(1)),
        targetCalories: macros.totalCalories,
        macroSplit: {
          proteinG: macros.proteinGrams,
          carbsG: macros.carbsGrams,
          fatsG: macros.fatGrams
        }
      }));

      setHealthMetrics((prev) => ({
        ...prev,
        googleHealth: {
          ...prev.googleHealth,
          bodyWeightKg: Number(w.toFixed(1)),
          ...(typeof metrics.bodyFatPercent === "number" ? { bodyFatPercent: metrics.bodyFatPercent } : {}),
          ...(typeof metrics.muscleMassPercent === "number" ? { muscleMassPercent: metrics.muscleMassPercent } : {}),
          ...(typeof metrics.waterPercent === "number" ? { bodyWaterPercent: metrics.waterPercent } : {}),
          ...(typeof metrics.boneMassKg === "number" ? { boneMassKg: metrics.boneMassKg } : {}),
          ...(typeof metrics.visceralFat === "number" ? { visceralFatRating: metrics.visceralFat } : {}),
          ...(typeof metrics.bmi === "number" ? { bmi: metrics.bmi } : {}),
          ...(typeof metrics.bmrKcal === "number" ? { bmrKcal: metrics.bmrKcal } : {}),
        },
        fitbit: {
          ...prev.fitbit,
          bodyWeightKg: Number(w.toFixed(1)),
          ...(typeof metrics.bodyFatPercent === "number" ? { bodyFatPercent: metrics.bodyFatPercent } : {})
        }
      }));

      const extraDetails = [
        typeof metrics.bodyFatPercent === "number" ? `${metrics.bodyFatPercent}% fat` : null,
        typeof metrics.muscleMassPercent === "number" ? `${metrics.muscleMassPercent}% muscle` : null,
        typeof metrics.waterPercent === "number" ? `${metrics.waterPercent}% water` : null
      ].filter(Boolean).join(", ");

      setToastMessage(`Synced Google Health scale biometrics: ${w.toFixed(1)} kg${extraDetails ? ` (${extraDetails})` : ""}!`);
      setTimeout(() => setToastMessage(null), 5000);
    } catch (err: any) {
      console.error("[Google Health Sync] Network or execution exception during sync:", err);
      setToastMessage(`Google Health API connection failed: ${err?.message || "Network error"}. Please enter your actual measurement manually.`);
      setTimeout(() => setToastMessage(null), 5000);
      setIsHealthModalOpen(true);
    }
  };

  // Navigation & Modals State
  const [activeTab, setActiveTab] = useState<NavTab>("dashboard");
  const [coachInitialSection, setCoachInitialSection] = useState<"overview" | "report" | "program" | "meals" | "supplements">("overview");
  const [diaryTarget, setDiaryTarget] = useState<{
    week?: number;
    day?: DayOfWeek;
    date?: string;
    timestamp?: number;
  } | null>(null);
  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);
  const [isExecutiveSummaryOpen, setIsExecutiveSummaryOpen] = useState(false);
  const [isOnboardingOpen, setIsOnboardingOpen] = useState(false);
  const [isHealthModalOpen, setIsHealthModalOpen] = useState(false);
  const [isVideoModalOpen, setIsVideoModalOpen] = useState(false);
  const [isPhotosModalOpen, setIsPhotosModalOpen] = useState(false);
  const [isSessionFeelingOpen, setIsSessionFeelingOpen] = useState(false);
  const [isAiGeneratorOpen, setIsAiGeneratorOpen] = useState(false);
  const [isCloudSyncModalOpen, setIsCloudSyncModalOpen] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [lastSyncedTime, setLastSyncedTime] = useState<string | null>(null);

  const [currentPlanToLog, setCurrentPlanToLog] = useState<WorkoutPlan | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Scoped Persistence & Storage Engine
  useEffect(() => {
    saveScopedField(currentUid, "fitness_workouts", workouts);
  }, [workouts, currentUid]);

  useEffect(() => {
    saveScopedField(currentUid, "imported_ids", importedSessionIds);
  }, [importedSessionIds, currentUid]);

  useEffect(() => {
    saveScopedField(currentUid, "fitness_unit", unit);
  }, [unit, currentUid]);

  useEffect(() => {
    saveScopedField(currentUid, "user_profile", userProfile);
  }, [userProfile, currentUid]);

  useEffect(() => {
    saveScopedField(currentUid, "health_metrics", healthMetrics);
  }, [healthMetrics, currentUid]);

  useEffect(() => {
    saveScopedField(currentUid, "matrix_plans", matrixPlans);
  }, [matrixPlans, currentUid]);

  useEffect(() => {
    saveScopedField(currentUid, "supplements", supplements);
  }, [supplements, currentUid]);

  useEffect(() => {
    saveScopedField(currentUid, "supplement_categories", supplementCategories);
  }, [supplementCategories, currentUid]);

  useEffect(() => {
    saveScopedField(currentUid, "progress_photos", progressPhotos);
  }, [progressPhotos, currentUid]);

  useEffect(() => {
    saveScopedField(currentUid, "session_feelings", sessionFeelings);
  }, [sessionFeelings, currentUid]);

  useEffect(() => {
    saveScopedField(currentUid, "training_programs", programs);
  }, [programs, currentUid]);

  useEffect(() => {
    saveScopedField(currentUid, "active_program_id", activeProgramId);
  }, [activeProgramId, currentUid]);

  useEffect(() => {
    saveScopedField(currentUid, "completed_days_record", completedDaysRecord);
  }, [completedDaysRecord, currentUid]);

  useEffect(() => {
    saveScopedField(currentUid, "body_comp_records", bodyCompRecords);
  }, [bodyCompRecords, currentUid]);

  useEffect(() => {
    const handleBeforeUnload = () => {
      saveScopedField(currentUid, "fitness_workouts", workouts);
      saveScopedField(currentUid, "matrix_plans", matrixPlans);
      saveScopedField(currentUid, "training_programs", programs);
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [workouts, matrixPlans, programs, currentUid]);

  // Durable Sync & Queuing Engine
  const isApplyingRemoteSnapshotRef = useRef<boolean>(false);
  const isInitialHydrationPendingRef = useRef<boolean>(true);
  const localPendingRevisionRef = useRef<number>(0);
  const lastConfirmedRevisionRef = useRef<number>(0);
  const isSyncInFlightRef = useRef<boolean>(false);
  const needsFollowUpSyncRef = useRef<boolean>(false);
  const syncDebounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastSyncedJsonRef = useRef<string>("");
  const quotaCooldownUntilRef = useRef<number>(getStoredQuotaCooldown());
  const hasAttemptedSeedRef = useRef<boolean>(false);

  const syncPayloadRef = useRef({
    workouts,
    matrixPlans,
    bodyCompRecords,
    userProfile,
    healthMetrics,
    supplements,
    supplementCategories,
    progressPhotos,
    sessionFeelings,
    programs,
    activeProgramId,
    completedDaysRecord,
    firebaseUser,
    gyms: getStoredGyms(currentUid)
  });

  useEffect(() => {
    syncPayloadRef.current = {
      workouts,
      matrixPlans,
      bodyCompRecords,
      userProfile,
      healthMetrics,
      supplements,
      supplementCategories,
      progressPhotos,
      sessionFeelings,
      programs,
      activeProgramId,
      completedDaysRecord,
      firebaseUser,
      gyms: getStoredGyms(currentUid) as any
    };
  });

  const executeCloudSync = useCallback(async () => {
    const {
      firebaseUser: currentUser,
      workouts: currentWorkouts,
      matrixPlans: currentMatrixPlans,
      bodyCompRecords: currentBodyCompRecords,
      userProfile: currentUserProfile,
      healthMetrics: currentHealthMetrics,
      supplements: currentSupplements,
      supplementCategories: currentSupplementCategories,
      progressPhotos: currentProgressPhotos,
      sessionFeelings: currentSessionFeelings,
      programs: currentPrograms,
      activeProgramId: currentActiveProgramId,
      completedDaysRecord: currentCompletedDaysRecord
    } = syncPayloadRef.current;

    const uid = currentUser?.uid || "guest";

    if (!navigator.onLine) {
      setCloudSyncStatus("Offline, pending sync");
      firestoreTracker.setStatus("Offline, pending sync");
      savePersistentSyncState(uid, { isDirty: true, status: "Offline, pending sync" });
      setIsCloudSyncing(false);
      return;
    }

    if (isSyncInFlightRef.current) {
      needsFollowUpSyncRef.current = true;
      return;
    }

    const pendingOps = getPendingOperations(uid);
    if (pendingOps.length === 0 && localPendingRevisionRef.current <= lastConfirmedRevisionRef.current) {
      setCloudSyncStatus("Synced to cloud");
      firestoreTracker.setStatus("Synced to cloud");
      setIsCloudSyncing(false);
      return;
    }

    const customExercises = getStoredCustomExercises();
    const tombstones = getTombstones(uid);
    const currentGyms = getStoredGyms(uid);

    // Compute canonical string of the data payload for deterministic deduplication
    const coreDataString = computeCanonicalDataHash({
      workouts: currentWorkouts,
      matrixPlans: currentMatrixPlans,
      bodyCompRecords: currentBodyCompRecords,
      userProfile: currentUserProfile,
      healthMetrics: currentHealthMetrics,
      supplements: currentSupplements,
      supplementCategories: currentSupplementCategories,
      progressPhotos: currentProgressPhotos,
      sessionFeelings: currentSessionFeelings,
      programs: currentPrograms,
      activeProgramId: currentActiveProgramId,
      completedDaysRecord: currentCompletedDaysRecord,
      customExercises,
      gyms: currentGyms
    });

    if (coreDataString === lastSyncedJsonRef.current && lastSyncedJsonRef.current.length > 0) {
      firestoreTracker.recordDeduplicatedSaved(1);
      lastConfirmedRevisionRef.current = Math.max(lastConfirmedRevisionRef.current, localPendingRevisionRef.current);
      clearPendingOperations(uid);
      markSyncConfirmed(uid, localPendingRevisionRef.current);
      isSyncInFlightRef.current = false;
      setIsCloudSyncing(false);
      setCloudSyncStatus("Synced to cloud");
      firestoreTracker.setStatus("Synced to cloud");
      return;
    }

    isSyncInFlightRef.current = true;
    setIsCloudSyncing(true);
    setCloudSyncStatus("Syncing");
    firestoreTracker.setStatus("Syncing");

    const uploadRevision = localPendingRevisionRef.current;
    const pendingOpsBeforeUpload = getPendingOperations(uid);
    const capturedOpIds = new Set(pendingOpsBeforeUpload.map((op) => op.id));

    try {
      const localSnapshot: LocalSyncSnapshot = {
        workouts: currentWorkouts,
        matrixPlans: currentMatrixPlans,
        bodyCompRecords: currentBodyCompRecords,
        userProfile: currentUserProfile,
        healthMetrics: currentHealthMetrics,
        supplements: currentSupplements,
        supplementCategories: currentSupplementCategories,
        progressPhotos: currentProgressPhotos,
        sessionFeelings: currentSessionFeelings,
        programs: currentPrograms,
        activeProgramId: currentActiveProgramId,
        completedDaysRecord: currentCompletedDaysRecord,
        customExercises,
        gyms: currentGyms
      };

      const syncResult = await executeCloudSyncEngine({
        uid,
        localSnapshot,
        tombstones,
        uploadRevision,
        capturedOpIds,
        isQuotaCooldown: isFirestoreQuotaCooldownActive(),
        quotaCooldownUntil: quotaCooldownUntilRef.current,
        postServerSync: (userId, snapshot, tb, rev) =>
          postServerSyncStore(userId, snapshot, tb, rev),
        executeFirestoreSync: async (userId, snapshot, tb, rev) => {
          return await executeTransactionalSync(
            db,
            userId,
            doc,
            runTransaction,
            snapshot,
            tb,
            getDeviceId(),
            rev
          );
        },
        getPendingOps: (userId) => getPendingOperations(userId),
        clearPendingOps: (userId) => clearPendingOperations(userId),
        savePendingOps: (userId, ops) =>
          safeSetItem(getUserStorageKey(userId, "pending_ops"), JSON.stringify(ops)),
        markConfirmed: (userId, rev) => markSyncConfirmed(userId, rev),
        savePersistentState: (userId, state) => savePersistentSyncState(userId, state),
        recordQuotaError: () => {
          firestoreTracker.recordQuotaError();
          const resetTime = calculateDailyQuotaResetTime();
          quotaCooldownUntilRef.current = resetTime;
          setStoredQuotaCooldown(resetTime);
        },
        localPendingRevision: localPendingRevisionRef.current,
        needsFollowUpSync: needsFollowUpSyncRef.current
      });

      // Update local state if merged data is available from remote write(s)
      if (syncResult.mergedData) {
        const md = syncResult.mergedData;
        setWorkouts(md.workouts);
        saveScopedField(uid, "fitness_workouts", md.workouts);
        setPrograms(md.programs);
        saveScopedField(uid, "training_programs", md.programs);
        setMatrixPlans(md.matrixPlans);
        saveScopedField(uid, "matrix_plans", md.matrixPlans);
        setBodyCompRecords(md.bodyCompRecords);
        saveScopedField(uid, "body_comp_records", md.bodyCompRecords);
        setCompletedDaysRecord(md.completedDaysRecord);
        saveScopedField(uid, "completed_days_record", md.completedDaysRecord);
        if (md.gyms && Array.isArray(md.gyms)) {
          saveStoredGyms(uid, md.gyms);
        }
      }
      if (syncResult.mergedTombstones) {
        safeSetItem(getUserStorageKey(uid, "tombstones"), JSON.stringify(syncResult.mergedTombstones));
      }

      setCloudSyncStatus(syncResult.status);
      firestoreTracker.setStatus(syncResult.status);

      if (syncResult.status === "Synced to cloud") {
        if (typeof syncResult.confirmedRev === "number") {
          lastConfirmedRevisionRef.current = Math.max(lastConfirmedRevisionRef.current, syncResult.confirmedRev);
        }
        if (syncResult.mergedData) {
          lastSyncedJsonRef.current = computeCanonicalDataHash({
            workouts: syncResult.mergedData.workouts,
            matrixPlans: syncResult.mergedData.matrixPlans,
            bodyCompRecords: syncResult.mergedData.bodyCompRecords,
            userProfile: syncResult.mergedData.userProfile,
            healthMetrics: syncResult.mergedData.healthMetrics,
            supplements: syncResult.mergedData.supplements,
            supplementCategories: syncResult.mergedData.supplementCategories,
            progressPhotos: syncResult.mergedData.progressPhotos,
            sessionFeelings: syncResult.mergedData.sessionFeelings,
            programs: syncResult.mergedData.programs,
            activeProgramId: syncResult.mergedData.activeProgramId,
            completedDaysRecord: syncResult.mergedData.completedDaysRecord,
            customExercises: syncResult.mergedData.customExercises,
            gyms: syncResult.mergedData.gyms || currentGyms
          });
        }
        setLastSyncedTime(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
      } else if (syncResult.status === "Saved locally") {
        needsFollowUpSyncRef.current = false;
        scheduleCloudSync(3500);
      } else if (syncResult.status === "Partial sync") {
        scheduleCloudSync(3500);
      } else if (syncResult.status === "Cloud sync failed. Changes are waiting to retry.") {
        scheduleCloudSync(5000);
      }
    } catch (err: any) {
      const failStatus: SyncStatus = "Cloud sync failed. Changes are waiting to retry.";
      setCloudSyncStatus(failStatus);
      firestoreTracker.setStatus(failStatus);
      savePersistentSyncState(uid, {
        isDirty: true,
        status: failStatus,
        lastError: err?.message
      });
      scheduleCloudSync(5000);
    } finally {
      isSyncInFlightRef.current = false;
      setIsCloudSyncing(false);
    }
  }, []);

  const scheduleCloudSync = useCallback((delayMs: number = 2500) => {
    if (!navigator.onLine) {
      setCloudSyncStatus("Offline, pending sync");
      return;
    }
    if (syncDebounceTimerRef.current) {
      clearTimeout(syncDebounceTimerRef.current);
    }
    syncDebounceTimerRef.current = setTimeout(() => {
      executeCloudSync();
    }, delayMs);
  }, [executeCloudSync]);

  const applyingRemoteSnapshotTimerRef = useRef<NodeJS.Timeout | null>(null);
  const applyingRemoteSnapshotStartTimeRef = useRef<number>(0);

  const setApplyingRemoteSnapshot = useCallback((applying: boolean, reason: string, safetyTimeoutMs: number = 2500) => {
    const timestamp = new Date().toISOString();
    if (applyingRemoteSnapshotTimerRef.current) {
      clearTimeout(applyingRemoteSnapshotTimerRef.current);
      applyingRemoteSnapshotTimerRef.current = null;
    }

    if (applying) {
      isApplyingRemoteSnapshotRef.current = true;
      applyingRemoteSnapshotStartTimeRef.current = Date.now();
      console.log(`[SyncEngine][${timestamp}] isApplyingRemoteSnapshotRef -> TRUE | Reason: "${reason}" | SafetyWatchdog: ${safetyTimeoutMs}ms`);

      applyingRemoteSnapshotTimerRef.current = setTimeout(() => {
        if (isApplyingRemoteSnapshotRef.current) {
          const elapsed = Date.now() - applyingRemoteSnapshotStartTimeRef.current;
          console.warn(`[SyncEngine][${new Date().toISOString()}] isApplyingRemoteSnapshotRef AUTO-RELEASED by Watchdog (held for ${elapsed}ms) | Prior reason: "${reason}"`);
          isApplyingRemoteSnapshotRef.current = false;
          // Check if there are dirty pending edits to schedule
          const uid = syncPayloadRef.current.firebaseUser?.uid || "guest";
          const pending = getPendingOperations(uid);
          if (pending.length > 0 || localPendingRevisionRef.current > lastConfirmedRevisionRef.current) {
            console.log(`[SyncEngine] Triggering follow-up cloud sync after watchdog release`);
            scheduleCloudSync(500);
          }
        }
      }, safetyTimeoutMs);
    } else {
      const elapsed = applyingRemoteSnapshotStartTimeRef.current > 0 ? Date.now() - applyingRemoteSnapshotStartTimeRef.current : 0;
      isApplyingRemoteSnapshotRef.current = false;
      applyingRemoteSnapshotStartTimeRef.current = 0;
      console.log(`[SyncEngine][${timestamp}] isApplyingRemoteSnapshotRef -> FALSE | Reason: "${reason}" | ActiveDuration: ${elapsed}ms`);

      // Auto-reconcile check: if local state was modified during remote snapshot, schedule follow-up sync
      const uid = syncPayloadRef.current.firebaseUser?.uid || "guest";
      const pending = getPendingOperations(uid);
      if (pending.length > 0 || localPendingRevisionRef.current > lastConfirmedRevisionRef.current) {
        console.log(`[SyncEngine] Pending uncommitted operations detected upon snapshot release -> scheduling follow-up sync`);
        scheduleCloudSync(1000);
      }
    }
  }, [scheduleCloudSync]);

  // Automated Recovery Engine for Pending Changes (Quota Cooldown Expiry & Connectivity)
  useEffect(() => {
    const recoveryInterval = setInterval(() => {
      const uid = syncPayloadRef.current.firebaseUser?.uid || "guest";
      
      // If quota cooldown is still active, avoid querying or writing Firestore
      if (quotaCooldownUntilRef.current > Date.now() || isFirestoreQuotaCooldownActive()) {
        return;
      }

      // If cooldown period just expired, clear stored cooldown and restore network
      if (quotaCooldownUntilRef.current > 0 && quotaCooldownUntilRef.current <= Date.now()) {
        quotaCooldownUntilRef.current = 0;
        clearStoredQuotaCooldown();
        enableNetwork(db).catch(() => {});
      }

      const persistent = getPersistentSyncState(uid);
      if (
        persistent.isDirty &&
        navigator.onLine &&
        quotaCooldownUntilRef.current <= Date.now() &&
        !isSyncInFlightRef.current &&
        syncPayloadRef.current.firebaseUser
      ) {
        executeCloudSync();
      }
    }, 60000);

    return () => clearInterval(recoveryInterval);
  }, [executeCloudSync]);

  // Online / Offline Detection
  useEffect(() => {
    const handleOnline = () => {
      const uid = syncPayloadRef.current.firebaseUser?.uid || "guest";
      if (quotaCooldownUntilRef.current > 0 && quotaCooldownUntilRef.current <= Date.now()) {
        quotaCooldownUntilRef.current = 0;
      }
      const pending = getPendingOperations(uid);
      const persistent = getPersistentSyncState(uid);

      if (pending.length > 0 || persistent.isDirty || localPendingRevisionRef.current > lastConfirmedRevisionRef.current) {
        setCloudSyncStatus("Saved locally");
        scheduleCloudSync(100);
      } else {
        setCloudSyncStatus("Synced to cloud");
      }
    };
    const handleOffline = () => {
      setCloudSyncStatus("Offline, pending sync");
      firestoreTracker.setStatus("Offline, pending sync");
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    if (!navigator.onLine) {
      setCloudSyncStatus("Offline, pending sync");
      firestoreTracker.setStatus("Offline, pending sync");
    }

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [scheduleCloudSync]);

  // Firebase Auth Listener with Account Isolation and Immediate Cloud Hydration
  const previousUidRef = useRef<string>("guest");

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      const prevUid = previousUidRef.current;
      if (user) {
        setFirebaseUser(user);
        const newUid = user.uid;
        previousUidRef.current = newUid;

        // Account Isolation & Migration:
        // Only migrate if transitioning from guest to an authenticated user AND target user has no data
        if (prevUid === "guest" && !user.isAnonymous) {
          migrateGuestDataToUser(newUid);
        }

        // Mark hydration as pending to strictly block premature auto-sync writes
        isInitialHydrationPendingRef.current = true;
        setApplyingRemoteSnapshot(true, "Auth onAuthStateChanged - Initial user hydration started", 4000);

        // Load data strictly scoped to this user from local storage
        const userData = loadScopedUserData(newUid, INITIAL_DEFAULTS);
        
        // Enrich profile with authenticated user details if available
        const isDemoSeedAccount = user.email === "david@rootwelt-norberg.com" || newUid === "EGAAqqJvUAU7ln38ApMENxrYQlC2";
        let hasExplicitTargetOnboarding = false;
        try {
          hasExplicitTargetOnboarding = localStorage.getItem(getUserStorageKey(newUid, "onboarding_completed")) === "true";
        } catch (e) {}

        if (!user.isAnonymous) {
          if (user.email && (!userData.userProfile.email || userData.userProfile.email === "david@rootwelt-norberg.com")) {
            userData.userProfile.email = user.email;
          }
          if (user.displayName) {
            userData.userProfile.name = user.displayName;
          } else if (!user.displayName && user.email && (!userData.userProfile.name || userData.userProfile.name === "David Rootwelt" || userData.userProfile.name === "David Norberg")) {
            userData.userProfile.name = user.email.split("@")[0];
          }
          if (user.photoURL) {
            userData.userProfile.avatarUrl = user.photoURL;
          }

          if (!isDemoSeedAccount && !hasExplicitTargetOnboarding) {
            userData.userProfile.onboardingCompleted = false;
          }
        }

        setWorkouts(userData.workouts);
        setPrograms(userData.programs);
        setMatrixPlans(userData.matrixPlans);
        setActiveProgramId(userData.activeProgramId);
        setCompletedDaysRecord(userData.completedDaysRecord);
        setBodyCompRecords(userData.bodyCompRecords);
        setUserProfile(userData.userProfile);
        if (!userData.userProfile.onboardingCompleted) {
          setIsOnboardingOpen(true);
        }
        setHealthMetrics(userData.healthMetrics);
        setSupplements(userData.supplements);
        setSupplementCategories(userData.supplementCategories);
        setProgressPhotos(userData.progressPhotos);
        setSessionFeelings(userData.sessionFeelings);

        localPendingRevisionRef.current = 0;
        lastConfirmedRevisionRef.current = 0;

        // Attempt immediate cloud query to hydrate cross-device cloud data
        if (!user.isAnonymous && newUid && newUid !== "guest") {
          try {
            await enableNetwork(db).catch(() => {});
            const docRef = doc(db, "users", newUid, "data", "fitnessStore");

            // Query both full-stack server bridge and Firestore in parallel
            const [serverSyncRes, fsSnap] = await Promise.all([
              fetchServerSyncStore(newUid).catch(() => ({ success: false, exists: false, data: null, revision: 0 })),
              getDocFromServer(docRef).catch(() => getDoc(docRef)).catch(() => null)
            ]);

            let authoritativeData: any = null;
            let authoritativeRev = 0;

            if (serverSyncRes.exists && serverSyncRes.data) {
              authoritativeData = serverSyncRes.data;
              authoritativeRev = serverSyncRes.revision || serverSyncRes.data.revision || 0;
            }

            if (fsSnap && fsSnap.exists()) {
              const fsData = fsSnap.data();
              const fsRev = fsData.revision || 0;
              // If firestore has newer revision or server bridge had no document, use firestore
              if (!authoritativeData || fsRev >= authoritativeRev) {
                authoritativeData = fsData;
                authoritativeRev = fsRev;
              }
            }

            if (authoritativeData) {
              firestoreTracker.recordRead(1, "Authoritative cloud hydration");
              const data = authoritativeData;
              const localTombstones = getTombstones(newUid);
              const mergedTombstones = mergeTombstones(localTombstones, data.tombstones);

              const rawMergedWorkouts = (data.workouts && Array.isArray(data.workouts))
                ? (userData.workouts.length > 0 && userData.workouts !== INITIAL_DEFAULTS.defaultWorkouts
                    ? mergeWorkouts(userData.workouts, data.workouts, mergedTombstones.workouts)
                    : data.workouts)
                : userData.workouts;
              const mergedWorkouts = sanitizeUserWorkouts(rawMergedWorkouts);

              const mergedBodyComp = (data.bodyCompRecords && Array.isArray(data.bodyCompRecords))
                ? (userData.bodyCompRecords.length > 0
                    ? mergeBodyCompRecords(userData.bodyCompRecords, data.bodyCompRecords, mergedTombstones.bodyComp)
                    : data.bodyCompRecords)
                : userData.bodyCompRecords;

              const mergedPrograms = (data.programs && Array.isArray(data.programs))
                ? (userData.programs.length > 0 && userData.programs !== INITIAL_DEFAULTS.defaultPrograms
                    ? mergePrograms(userData.programs, data.programs, mergedTombstones.programs)
                    : data.programs)
                : userData.programs;

              const mergedMatrix = (data.matrixPlans && Array.isArray(data.matrixPlans))
                ? (userData.matrixPlans.length > 0 && userData.matrixPlans !== INITIAL_DEFAULTS.defaultMatrixPlans
                    ? mergeWeeklyMatrixPlans(userData.matrixPlans, data.matrixPlans)
                    : data.matrixPlans)
                : userData.matrixPlans;

              const rawProfile = data.userProfile || userData.userProfile;
              const mergedProfile = { ...rawProfile };
              if (!user.isAnonymous && !isDemoSeedAccount && !hasExplicitTargetOnboarding) {
                mergedProfile.onboardingCompleted = false;
                if (user.email) {
                  mergedProfile.email = user.email;
                  if (!mergedProfile.name || mergedProfile.name === "David Rootwelt" || mergedProfile.name === "David Norberg") {
                    mergedProfile.name = user.displayName || user.email.split("@")[0];
                  }
                }
              }
              const mergedHealth = data.healthMetrics || userData.healthMetrics;
              const mergedSupplements = data.supplements || userData.supplements;
              const mergedCategories = data.supplementCategories || userData.supplementCategories;
              const mergedPhotos = data.progressPhotos || userData.progressPhotos;
              const mergedFeelings = (data.sessionFeelings || userData.sessionFeelings || []).filter((f: any) => f.workoutId !== "sess-01");
              const mergedDays = sanitizeCompletedDaysRecord(data.completedDaysRecord || userData.completedDaysRecord);
              const mergedActiveProgId = data.activeProgramId || userData.activeProgramId;

              // Update state
              setWorkouts(mergedWorkouts);
              setBodyCompRecords(mergedBodyComp);
              setPrograms(mergedPrograms);
              setActiveProgramId(mergedActiveProgId);
              setMatrixPlans(mergedMatrix);
              setUserProfile(mergedProfile);
              if (!mergedProfile.onboardingCompleted) {
                setIsOnboardingOpen(true);
              }
              setHealthMetrics(mergedHealth);
              setSupplements(mergedSupplements);
              setSupplementCategories(mergedCategories);
              setProgressPhotos(mergedPhotos);
              setSessionFeelings(mergedFeelings);
              setCompletedDaysRecord(mergedDays);

              // Save to local storage for offline / cross-session availability
              saveScopedField(newUid, "fitness_workouts", mergedWorkouts);
              saveScopedField(newUid, "body_comp_records", mergedBodyComp);
              saveScopedField(newUid, "training_programs", mergedPrograms);
              saveScopedField(newUid, "active_program_id", mergedActiveProgId);
              saveScopedField(newUid, "matrix_plans", mergedMatrix);
              saveScopedField(newUid, "user_profile", mergedProfile);
              saveScopedField(newUid, "health_metrics", mergedHealth);
              saveScopedField(newUid, "supplements", mergedSupplements);
              saveScopedField(newUid, "supplement_categories", mergedCategories);
              saveScopedField(newUid, "progress_photos", mergedPhotos);
              saveScopedField(newUid, "session_feelings", mergedFeelings);
              saveScopedField(newUid, "completed_days_record", mergedDays);

              const canonical = computeCanonicalDataHash({
                workouts: mergedWorkouts,
                matrixPlans: mergedMatrix,
                bodyCompRecords: mergedBodyComp,
                userProfile: mergedProfile,
                healthMetrics: mergedHealth,
                supplements: mergedSupplements,
                supplementCategories: mergedCategories,
                progressPhotos: mergedPhotos,
                sessionFeelings: mergedFeelings,
                programs: mergedPrograms,
                activeProgramId: mergedActiveProgId,
                completedDaysRecord: mergedDays,
                customExercises: data.customExercises || getStoredCustomExercises()
              });

              lastSyncedJsonRef.current = canonical;
              const rev = authoritativeRev || data.revision || 0;
              lastConfirmedRevisionRef.current = rev;
              localPendingRevisionRef.current = rev;
              clearPendingOperations(newUid);
              markSyncConfirmed(newUid, rev);

              setCloudSyncStatus("Synced to cloud");
              firestoreTracker.setStatus("Synced to cloud");
              setLastSyncedTime(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
            } else {
              // Document doesn't exist on cloud yet; if this device has created records, seed the cloud immediately
              if (userData.workouts.length > 0 || userData.programs.length > 0) {
                localPendingRevisionRef.current += 1;
                enqueuePendingOperation(newUid, {
                  id: `seed_${Date.now()}`,
                  type: "full_sync",
                  revision: localPendingRevisionRef.current,
                  timestamp: new Date().toISOString()
                });
                executeCloudSync();
              }
            }
          } catch (e) {
            console.warn("Initial cloud hydration notice:", e);
          } finally {
            isInitialHydrationPendingRef.current = false;
            setApplyingRemoteSnapshot(false, "Auth onAuthStateChanged - Initial cloud hydration completed");
          }
        } else {
          isInitialHydrationPendingRef.current = false;
          setApplyingRemoteSnapshot(false, "Auth onAuthStateChanged - Local guest/anon hydration completed");
        }

        const pending = getPendingOperations(newUid);
        if (pending.length > 0) {
          setCloudSyncStatus("Saved locally, pending cloud sync");
        } else {
          setCloudSyncStatus(user.isAnonymous ? "Cloud Synced (Anon)" : "Cloud Synced (Firebase)");
        }

        // Run non-destructive Schema Version 2 migration in background if needed
        if (!user.isAnonymous && newUid && newUid !== "guest") {
          migrationService.runMigration(newUid).catch(() => {});
        }
      } else {
        setFirebaseUser(null);
        setIsAuthModalOpen(true);
        setCloudSyncStatus("Offline mode");
        const guestData = loadScopedUserData("guest", INITIAL_DEFAULTS);
        setWorkouts(guestData.workouts);
        setPrograms(guestData.programs);
        setMatrixPlans(guestData.matrixPlans);
        setActiveProgramId(guestData.activeProgramId);
        setCompletedDaysRecord(guestData.completedDaysRecord);
        setBodyCompRecords(guestData.bodyCompRecords);
        setUserProfile(guestData.userProfile);
        setHealthMetrics(guestData.healthMetrics);
        setSupplements(guestData.supplements);
        setSupplementCategories(guestData.supplementCategories);
        setProgressPhotos(guestData.progressPhotos);
        setSessionFeelings(guestData.sessionFeelings);
        isInitialHydrationPendingRef.current = false;
        setApplyingRemoteSnapshot(false, "Auth onAuthStateChanged - Unauthenticated guest fallback completed");
      }
    });
    return () => unsubscribe();
  }, []);

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      setFirebaseUser(null);
      previousUidRef.current = "guest";
      setIsAuthModalOpen(true);
      showToast("Signed out successfully.");
    } catch (err: any) {
      console.error("Sign out error:", err);
      showToast("Sign out failed.");
    }
  };

  // Unified Remote Snapshot / SSE Update Handler
  const handleApplyRemoteUpdate = useCallback((
    data: any,
    remoteDeviceId: string,
    remoteRevision: number,
    source: string
  ) => {
    if (!data) return;
    const uid = firebaseUser?.uid || "guest";
    const isFromLocalDevice = remoteDeviceId === getDeviceId();

    // 1. Server confirmation for write authored by THIS local device
    if (isFromLocalDevice) {
      lastConfirmedRevisionRef.current = Math.max(lastConfirmedRevisionRef.current, remoteRevision);
      markSyncConfirmed(uid, remoteRevision);
      const currentPending = getPendingOperations(uid);
      if (currentPending.length === 0 && localPendingRevisionRef.current <= remoteRevision) {
        setCloudSyncStatus("Synced to cloud");
        firestoreTracker.setStatus("Synced to cloud");
        setIsCloudSyncing(false);
        setLastSyncedTime(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
      }
      return;
    }

    // 2. Remote update authored by another device (e.g. PC -> Phone or Phone -> PC)
    setApplyingRemoteSnapshot(true, `Remote update received from ${source} (rev ${remoteRevision})`, 2500);

    const localTombstones = getTombstones(uid);
    const mergedTombstones = mergeTombstones(localTombstones, data.tombstones);

    let mergedWorkouts = syncPayloadRef.current.workouts;
    let mergedPrograms = syncPayloadRef.current.programs;
    let mergedMatrix = syncPayloadRef.current.matrixPlans;
    let mergedBodyComp = syncPayloadRef.current.bodyCompRecords;
    let mergedProfile = syncPayloadRef.current.userProfile;
    let mergedHealth = syncPayloadRef.current.healthMetrics;
    let mergedSupplements = syncPayloadRef.current.supplements;
    let mergedCategories = syncPayloadRef.current.supplementCategories;
    let mergedPhotos = syncPayloadRef.current.progressPhotos;
    let mergedFeelings = syncPayloadRef.current.sessionFeelings;
    let mergedDays = syncPayloadRef.current.completedDaysRecord;
    let mergedActiveProgId = syncPayloadRef.current.activeProgramId;

    const pendingOps = getPendingOperations(uid);
    const hasUncommittedLocalEdits = pendingOps.length > 0 || localPendingRevisionRef.current > lastConfirmedRevisionRef.current;

    if (!hasUncommittedLocalEdits) {
      // Device has no uncommitted edits: cleanly adopt authoritative remote state
      if (data.workouts && Array.isArray(data.workouts)) mergedWorkouts = data.workouts;
      if (data.programs && Array.isArray(data.programs)) mergedPrograms = data.programs;
      if (data.matrixPlans && Array.isArray(data.matrixPlans)) mergedMatrix = data.matrixPlans;
      if (data.bodyCompRecords && Array.isArray(data.bodyCompRecords)) mergedBodyComp = data.bodyCompRecords;
      if (data.userProfile) mergedProfile = data.userProfile;
      if (data.healthMetrics) mergedHealth = data.healthMetrics;
      if (data.supplements) mergedSupplements = data.supplements;
      if (data.supplementCategories && Array.isArray(data.supplementCategories)) mergedCategories = data.supplementCategories;
      if (data.progressPhotos && Array.isArray(data.progressPhotos)) mergedPhotos = data.progressPhotos;
      if (data.sessionFeelings && Array.isArray(data.sessionFeelings)) mergedFeelings = data.sessionFeelings;
      if (data.completedDaysRecord) mergedDays = data.completedDaysRecord;
      if (data.activeProgramId) mergedActiveProgId = data.activeProgramId;
    } else {
      // Concurrent edits on both devices: deep item-by-item merge
      if (data.workouts && Array.isArray(data.workouts)) {
        mergedWorkouts = mergeWorkouts(syncPayloadRef.current.workouts, data.workouts, mergedTombstones.workouts);
      }
      if (data.programs && Array.isArray(data.programs)) {
        mergedPrograms = mergePrograms(syncPayloadRef.current.programs, data.programs, mergedTombstones.programs);
      }
      if (data.matrixPlans && Array.isArray(data.matrixPlans)) {
        mergedMatrix = mergeWeeklyMatrixPlans(syncPayloadRef.current.matrixPlans, data.matrixPlans);
      }
      if (data.bodyCompRecords && Array.isArray(data.bodyCompRecords)) {
        mergedBodyComp = mergeBodyCompRecords(syncPayloadRef.current.bodyCompRecords, data.bodyCompRecords, mergedTombstones.bodyComp);
      }
      if (data.userProfile) mergedProfile = { ...syncPayloadRef.current.userProfile, ...data.userProfile };
      if (data.healthMetrics) mergedHealth = { ...syncPayloadRef.current.healthMetrics, ...data.healthMetrics };
      if (data.supplements) mergedSupplements = data.supplements;
      if (data.supplementCategories && Array.isArray(data.supplementCategories)) {
        mergedCategories = Array.from(new Set([...syncPayloadRef.current.supplementCategories, ...data.supplementCategories]));
      }
      if (data.progressPhotos && Array.isArray(data.progressPhotos)) mergedPhotos = data.progressPhotos;
      if (data.sessionFeelings && Array.isArray(data.sessionFeelings)) {
        const combined = [...data.sessionFeelings, ...(syncPayloadRef.current.sessionFeelings || [])];
        const seen = new Set<string>();
        mergedFeelings = combined.filter((f) => {
          const k = `${f.workoutId || ""}_${f.loggedAt || ""}`;
          if (seen.has(k)) return false;
          seen.add(k);
          return true;
        });
      }
      if (data.completedDaysRecord) mergedDays = { ...syncPayloadRef.current.completedDaysRecord, ...data.completedDaysRecord };
      if (data.activeProgramId) mergedActiveProgId = data.activeProgramId;
    }

    // Apply to React state
    setWorkouts(mergedWorkouts);
    setPrograms(mergedPrograms);
    setMatrixPlans(mergedMatrix);
    setBodyCompRecords(mergedBodyComp);
    setUserProfile(mergedProfile);
    setHealthMetrics(mergedHealth);
    setSupplements(mergedSupplements);
    setSupplementCategories(mergedCategories);
    setProgressPhotos(mergedPhotos);
    setSessionFeelings(mergedFeelings);
    setCompletedDaysRecord(mergedDays);
    setActiveProgramId(mergedActiveProgId);

    // Save to local storage
    saveScopedField(uid, "fitness_workouts", mergedWorkouts);
    saveScopedField(uid, "training_programs", mergedPrograms);
    saveScopedField(uid, "matrix_plans", mergedMatrix);
    saveScopedField(uid, "body_comp_records", mergedBodyComp);
    saveScopedField(uid, "user_profile", mergedProfile);
    saveScopedField(uid, "health_metrics", mergedHealth);
    saveScopedField(uid, "supplements", mergedSupplements);
    saveScopedField(uid, "supplement_categories", mergedCategories);
    saveScopedField(uid, "progress_photos", mergedPhotos);
    saveScopedField(uid, "session_feelings", mergedFeelings);
    saveScopedField(uid, "completed_days_record", mergedDays);
    saveScopedField(uid, "active_program_id", mergedActiveProgId);
    if (data.gyms && Array.isArray(data.gyms)) {
      const localGyms = getStoredGyms(uid);
      const gymMap = new Map<string, Gym>();
      for (const g of localGyms) if (g && g.id) gymMap.set(g.id, g);
      for (const g of data.gyms) if (g && g.id) gymMap.set(g.id, g);
      saveStoredGyms(uid, Array.from(gymMap.values()));
    }
    safeSetItem(getUserStorageKey(uid, "tombstones"), JSON.stringify(mergedTombstones));

    const canonicalOfMerged = computeCanonicalDataHash({
      workouts: mergedWorkouts,
      matrixPlans: mergedMatrix,
      bodyCompRecords: mergedBodyComp,
      userProfile: mergedProfile,
      healthMetrics: mergedHealth,
      supplements: mergedSupplements,
      supplementCategories: mergedCategories,
      progressPhotos: mergedPhotos,
      sessionFeelings: mergedFeelings,
      programs: mergedPrograms,
      activeProgramId: mergedActiveProgId,
      completedDaysRecord: mergedDays,
      customExercises: data.customExercises || getStoredCustomExercises(),
      gyms: getStoredGyms(uid)
    });

    if (hasUncommittedLocalEdits) {
      lastConfirmedRevisionRef.current = Math.max(lastConfirmedRevisionRef.current, remoteRevision);
      localPendingRevisionRef.current = Math.max(localPendingRevisionRef.current, remoteRevision) + 1;
      enqueuePendingOperation(uid, {
        id: `merge_reconcile_${Date.now()}`,
        type: "full_sync",
        revision: localPendingRevisionRef.current,
        timestamp: new Date().toISOString()
      });
      setCloudSyncStatus("Saved locally");
      firestoreTracker.setStatus("Saved locally");
      scheduleCloudSync(1500);
    } else {
      lastSyncedJsonRef.current = canonicalOfMerged;
      lastConfirmedRevisionRef.current = Math.max(lastConfirmedRevisionRef.current, remoteRevision);
      localPendingRevisionRef.current = Math.max(localPendingRevisionRef.current, remoteRevision);
      clearPendingOperations(uid);
      markSyncConfirmed(uid, remoteRevision);

      setLastSyncedTime(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
      setCloudSyncStatus("Synced to cloud");
      firestoreTracker.setStatus("Synced to cloud");
      setIsCloudSyncing(false);
    }

    setApplyingRemoteSnapshot(false, `Remote update applied from ${source} (rev ${remoteRevision})`);
  }, [firebaseUser?.uid, scheduleCloudSync, setApplyingRemoteSnapshot]);

  // Real-Time Full-Stack Server-Sent Events (SSE) Listener (< 300ms cross-device latency)
  useEffect(() => {
    const uid = firebaseUser?.uid || "guest";
    if (!uid || uid === "guest") return;

    const unsubscribeSse = subscribeServerSyncEvents(uid, (remoteData, remoteDeviceId, revision) => {
      handleApplyRemoteUpdate(remoteData, remoteDeviceId, revision, "Server SSE");
    });

    return () => {
      unsubscribeSse();
    };
  }, [firebaseUser?.uid, handleApplyRemoteUpdate]);

  // Firestore Snapshot Listener with Tombstones & Independent Edits
  useEffect(() => {
    const uid = firebaseUser?.uid || "guest";
    const docRef = doc(db, "users", uid, "data", "fitnessStore");

    const unsubscribeSnapshot = onSnapshot(docRef, { includeMetadataChanges: true }, (snapshot) => {
      // 1. Ignore local latency-compensation echo writes
      if (snapshot.metadata.hasPendingWrites) {
        return;
      }

      // 2. Ignore offline cache miss - do not overwrite real records
      if (snapshot.metadata.fromCache && !snapshot.exists()) {
        return;
      }

      if (snapshot.exists()) {
        firestoreTracker.recordRead(1, "Snapshot remote update");
        const data = snapshot.data();
        const remoteDeviceId = data.deviceId;
        const remoteRevision = data.revision || 0;
        handleApplyRemoteUpdate(data, remoteDeviceId, remoteRevision, "Firestore Snapshot");
      }
    }, (err) => {
      const isQuota =
        err?.code === "resource-exhausted" ||
        err?.message?.includes("resource-exhausted") ||
        err?.message?.includes("Quota");

      if (isQuota) {
        firestoreTracker.recordQuotaError();
        const resetTime = calculateDailyQuotaResetTime();
        quotaCooldownUntilRef.current = resetTime;
        setStoredQuotaCooldown(resetTime);
        setCloudSyncStatus("Cloud quota reached, pending sync");
        firestoreTracker.setStatus("Cloud quota reached, pending sync");
        savePersistentSyncState(uid, {
          isDirty: true,
          status: "Cloud quota reached, pending sync",
          quotaCooldownUntil: resetTime,
          lastError: err?.message
        });
      } else {
        console.warn("Firestore snapshot listener notice:", err?.message || err);
      }
    });

    return () => {
      unsubscribeSnapshot();
    };
  }, [firebaseUser?.uid, handleApplyRemoteUpdate]);

  // Debounced Auto-Sync Trigger on State Change
  const isInitialMountRef = useRef<boolean>(true);
  useEffect(() => {
    if (isInitialMountRef.current) {
      isInitialMountRef.current = false;
      return;
    }
    // Strict Anti-Loop Guard: Remote hydration or unhydrated state must never trigger a cloud write
    if (isInitialHydrationPendingRef.current) {
      console.log("[SyncEngine] Auto-sync skipped: isInitialHydrationPendingRef is TRUE");
      return;
    }
    if (isApplyingRemoteSnapshotRef.current) {
      console.log("[SyncEngine] Auto-sync skipped: isApplyingRemoteSnapshotRef is TRUE (remote snapshot in progress)");
      return;
    }
    if (programs.length === 0 && workouts.length === 0) return;

    const currentCanonical = computeCanonicalDataHash({
      workouts,
      matrixPlans,
      bodyCompRecords,
      userProfile,
      healthMetrics,
      supplements,
      supplementCategories,
      progressPhotos,
      sessionFeelings,
      programs,
      activeProgramId,
      completedDaysRecord,
      customExercises: getStoredCustomExercises()
    });

    // If local state matches last verified snapshot, prevent unnecessary write
    if (currentCanonical === lastSyncedJsonRef.current) {
      return;
    }

    localPendingRevisionRef.current += 1;
    const uid = firebaseUser?.uid || "guest";
    enqueuePendingOperation(uid, {
      id: `op_${Date.now()}_${localPendingRevisionRef.current}`,
      type: "full_sync",
      revision: localPendingRevisionRef.current,
      timestamp: new Date().toISOString()
    });
    markModuleDirty(uid, "workouts");

    if (!navigator.onLine) {
      setCloudSyncStatus("Offline, pending sync");
      firestoreTracker.setStatus("Offline, pending sync");
    } else {
      setCloudSyncStatus("Saved locally");
      firestoreTracker.setStatus("Saved locally");
      scheduleCloudSync(2500);
    }
  }, [
    workouts,
    matrixPlans,
    bodyCompRecords,
    userProfile,
    healthMetrics,
    supplements,
    supplementCategories,
    progressPhotos,
    sessionFeelings,
    programs,
    activeProgramId,
    completedDaysRecord
  ]);

  const handleForcePushToCloud = async () => {
    let currentUser = firebaseUser;
    if (!currentUser) {
      try {
        const cred = await signInAnonymously(auth);
        currentUser = cred.user;
        setFirebaseUser(currentUser);
      } catch (e) {
        // Fallback to guest UID which is supported by firestore.rules
      }
    }
    const uid = currentUser?.uid || "guest";
    setIsCloudSyncing(true);
    setCloudSyncStatus("Syncing");
    firestoreTracker.setStatus("Syncing");

    try {
      // Clear quota cooldown and re-enable network to check if quota has rolled over or reset
      quotaCooldownUntilRef.current = 0;
      clearStoredQuotaCooldown();
      await enableNetwork(db).catch(() => {});

      localPendingRevisionRef.current += 1;
      const targetRev = localPendingRevisionRef.current;
      const customExercises = getStoredCustomExercises();
      const tombstones = getTombstones(uid);

      const localSnapshot: LocalSyncSnapshot = {
        workouts,
        matrixPlans,
        bodyCompRecords,
        userProfile,
        healthMetrics,
        supplements,
        supplementCategories,
        progressPhotos,
        sessionFeelings,
        programs,
        activeProgramId,
        completedDaysRecord,
        customExercises
      };

      // Atomic transaction: reads latest server document, merges, and saves
      const { finalPayload, mergedData, mergedTombstones } = await executeTransactionalSync(
        db,
        uid,
        doc,
        runTransaction,
        localSnapshot,
        tombstones,
        getDeviceId(),
        targetRev
      );

      // Update local state with merged server + local state
      setWorkouts(mergedData.workouts);
      saveScopedField(uid, "fitness_workouts", mergedData.workouts);
      setPrograms(mergedData.programs);
      saveScopedField(uid, "training_programs", mergedData.programs);
      setMatrixPlans(mergedData.matrixPlans);
      saveScopedField(uid, "matrix_plans", mergedData.matrixPlans);
      setBodyCompRecords(mergedData.bodyCompRecords);
      saveScopedField(uid, "body_comp_records", mergedData.bodyCompRecords);
      setCompletedDaysRecord(mergedData.completedDaysRecord);
      saveScopedField(uid, "completed_days_record", mergedData.completedDaysRecord);
      safeSetItem(getUserStorageKey(uid, "tombstones"), JSON.stringify(mergedTombstones));

      firestoreTracker.recordWrite(1, "Manual transactional force push");

      quotaCooldownUntilRef.current = 0;
      clearStoredQuotaCooldown();
      lastConfirmedRevisionRef.current = Math.max(lastConfirmedRevisionRef.current, finalPayload.revision || targetRev);
      lastSyncedJsonRef.current = computeCanonicalDataHash({
        workouts: mergedData.workouts,
        matrixPlans: mergedData.matrixPlans,
        bodyCompRecords: mergedData.bodyCompRecords,
        userProfile: mergedData.userProfile,
        healthMetrics: mergedData.healthMetrics,
        supplements: mergedData.supplements,
        supplementCategories: mergedData.supplementCategories,
        progressPhotos: mergedData.progressPhotos,
        sessionFeelings: mergedData.sessionFeelings,
        programs: mergedData.programs,
        activeProgramId: mergedData.activeProgramId,
        completedDaysRecord: mergedData.completedDaysRecord,
        customExercises: mergedData.customExercises
      });

      clearPendingOperations(uid);
      markSyncConfirmed(uid, finalPayload.revision || targetRev);
      setIsCloudSyncing(false);
      setCloudSyncStatus("Synced to cloud");
      firestoreTracker.setStatus("Synced to cloud");
      setLastSyncedTime(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
      showToast("Verified: All programs, matrix plans & workout logs pushed to Cloud successfully!");
    } catch (err: any) {
      setIsCloudSyncing(false);
      const isQuotaError =
        err?.code === "resource-exhausted" ||
        err?.message?.includes("resource-exhausted") ||
        err?.message?.includes("Quota limit exceeded") ||
        err?.message?.includes("Quota exceeded");

      if (isQuotaError) {
        firestoreTracker.recordQuotaError();
        const resetTime = calculateDailyQuotaResetTime();
        quotaCooldownUntilRef.current = resetTime;
        setStoredQuotaCooldown(resetTime);
        setCloudSyncStatus("Cloud quota reached, pending sync");
        firestoreTracker.setStatus("Cloud quota reached, pending sync");
        savePersistentSyncState(uid, {
          isDirty: true,
          status: "Cloud quota reached, pending sync",
          quotaCooldownUntil: resetTime,
          lastError: err?.message
        });
        showToast("Firestore daily write quota reached. All your workout & program data is safely saved on this device!");
      } else {
        setCloudSyncStatus("Sync failed");
        firestoreTracker.setStatus("Sync failed");
        savePersistentSyncState(uid, {
          isDirty: true,
          status: "Sync failed",
          lastError: err?.message
        });
        console.error("Firestore manual push error", err);
        showToast(`Cloud push failed: ${err?.message || "Unknown error"}. Click Retry to push changes.`);
      }
    }
  };

  const handleForcePullFromCloud = async () => {
    if (!firebaseUser) {
      showToast("Please sign in to pull cloud records.");
      return;
    }
    setIsCloudSyncing(true);
    setCloudSyncStatus("Syncing");
    firestoreTracker.setStatus("Syncing");

    try {
      await enableNetwork(db).catch(() => {});
      const uid = firebaseUser.uid;
      const docRef = doc(db, "users", uid, "data", "fitnessStore");
      const snapshot = await getDoc(docRef);
      firestoreTracker.recordRead(1, "Manual force pull");

      if (snapshot.exists()) {
        setApplyingRemoteSnapshot(true, "Manual force pull from cloud started", 3000);
        const data = snapshot.data();
        const localTombstones = getTombstones(uid);
        const mergedTombstones = mergeTombstones(localTombstones, data.tombstones);

        if (data.workouts && Array.isArray(data.workouts)) {
          setWorkouts((prev) => {
            const merged = mergeWorkouts(prev, data.workouts, mergedTombstones.workouts);
            saveScopedField(uid, "fitness_workouts", merged);
            return merged;
          });
        }
        if (data.bodyCompRecords && Array.isArray(data.bodyCompRecords)) {
          setBodyCompRecords((prev) => {
            const merged = mergeBodyCompRecords(prev, data.bodyCompRecords, mergedTombstones.bodyComp);
            saveScopedField(uid, "body_comp_records", merged);
            return merged;
          });
        }
        if (data.programs && Array.isArray(data.programs)) {
          setPrograms((prev) => {
            const merged = mergePrograms(prev, data.programs, mergedTombstones.programs);
            saveScopedField(uid, "training_programs", merged);
            return merged;
          });
        }
        if (data.activeProgramId) {
          setActiveProgramId(data.activeProgramId);
          saveScopedField(uid, "active_program_id", data.activeProgramId);
        }
        if (data.matrixPlans && Array.isArray(data.matrixPlans)) {
          setMatrixPlans((prev) => {
            const merged = mergeWeeklyMatrixPlans(prev, data.matrixPlans);
            saveScopedField(uid, "matrix_plans", merged);
            return merged;
          });
        }
        if (data.userProfile) {
          setUserProfile(data.userProfile);
          saveScopedField(uid, "user_profile", data.userProfile);
        }
        if (data.healthMetrics) {
          setHealthMetrics(data.healthMetrics);
          saveScopedField(uid, "health_metrics", data.healthMetrics);
        }
        if (data.supplements) {
          setSupplements(data.supplements);
          saveScopedField(uid, "supplements", data.supplements);
        }
        if (data.supplementCategories && Array.isArray(data.supplementCategories)) {
          setSupplementCategories(data.supplementCategories);
          saveScopedField(uid, "supplement_categories", data.supplementCategories);
        }
        if (data.progressPhotos) {
          setProgressPhotos(data.progressPhotos);
          saveScopedField(uid, "progress_photos", data.progressPhotos);
        }
        if (data.sessionFeelings && Array.isArray(data.sessionFeelings)) {
          setSessionFeelings(data.sessionFeelings);
          saveScopedField(uid, "session_feelings", data.sessionFeelings);
        }
        if (data.completedDaysRecord) {
          setCompletedDaysRecord(data.completedDaysRecord);
          saveScopedField(uid, "completed_days_record", data.completedDaysRecord);
        }

        safeSetItem(getUserStorageKey(uid, "tombstones"), JSON.stringify(mergedTombstones));
        lastSyncedJsonRef.current = computeCanonicalDataHash({
          workouts: data.workouts || [],
          matrixPlans: data.matrixPlans || [],
          bodyCompRecords: data.bodyCompRecords || [],
          userProfile: data.userProfile,
          healthMetrics: data.healthMetrics,
          supplements: data.supplements || [],
          supplementCategories: data.supplementCategories || [],
          progressPhotos: data.progressPhotos || [],
          sessionFeelings: data.sessionFeelings || [],
          programs: data.programs || [],
          activeProgramId: data.activeProgramId,
          completedDaysRecord: data.completedDaysRecord || {},
          customExercises: data.customExercises || []
        });

        markSyncConfirmed(uid, data.revision || 0);
        setLastSyncedTime(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
        setCloudSyncStatus("Synced to cloud");
        firestoreTracker.setStatus("Synced to cloud");
        showToast("Successfully pulled latest verified records from Cloud!");
        setApplyingRemoteSnapshot(false, "Manual force pull from cloud completed");
      } else {
        showToast("No existing cloud document found for this account.");
        setCloudSyncStatus("Saved locally");
        firestoreTracker.setStatus("Saved locally");
      }
    } catch (err: any) {
      const isQuotaError =
        err?.code === "resource-exhausted" ||
        err?.message?.includes("resource-exhausted") ||
        err?.message?.includes("Quota");

      if (isQuotaError) {
        firestoreTracker.recordQuotaError();
        const resetTime = calculateDailyQuotaResetTime();
        quotaCooldownUntilRef.current = resetTime;
        setStoredQuotaCooldown(resetTime);
        setCloudSyncStatus("Cloud quota reached, pending sync");
        firestoreTracker.setStatus("Cloud quota reached, pending sync");
        showToast("Cloud quota limit reached. Using local device data.");
      } else {
        console.error("Firestore pull error:", err);
        showToast("Failed to pull data from cloud.");
        setCloudSyncStatus("Sync failed");
        firestoreTracker.setStatus("Sync failed");
      }
    } finally {
      setIsCloudSyncing(false);
    }
  };

  const handleGoogleLogin = async () => {
    setIsCloudSyncModalOpen(true);
  };

  // Active program resolution
  const currentProgram =
    programs.find((p) => p.id === activeProgramId) || programs[0] || createPreplannedPrograms()[0];

  const handleSelectProgram = (programId: string) => {
    const targetProgId = programId === "prog-hypertrophy-5day" ? "prog-single-muscle" : programId;
    setActiveProgramId(targetProgId);
    saveScopedField(currentUid, "active_program_id", targetProgId);
    safeSetItem(getUserStorageKey(currentUid, "active_program_id_explicit"), "true");
    const prog = programs.find((p) => p.id === targetProgId) || createPreplannedPrograms().find((p) => p.id === targetProgId);
    if (prog && prog.matrixPlans && prog.matrixPlans.length > 0) {
      const sanitized = targetProgId === "prog-single-muscle" ? sanitizeSingleMuscleMatrix(prog.matrixPlans) : prog.matrixPlans;
      setMatrixPlans(sanitized);
      saveScopedField(currentUid, "matrix_plans", sanitized);
      sanitized.forEach((pl) => planRepository.savePlan(currentUid, pl).catch(() => {}));
    }
    showToast(`Switched active training program to "${prog?.name || targetProgId}".`);
  };

  const handleUpdateMatrixPlans = (updated: WeeklyMatrixPlan[], toastMessage?: string) => {
    setMatrixPlans(updated);
    updated.forEach((pl) => planRepository.savePlan(currentUid, pl).catch(() => {}));
    setPrograms((prev) =>
      prev.map((p) => {
        if (p.id === activeProgramId) {
          const updatedProg = { ...p, matrixPlans: updated };
          programRepository.saveProgram(currentUid, updatedProg).catch(() => {});
          return updatedProg;
        }
        return p;
      })
    );
    if (toastMessage) {
      showToast(toastMessage);
    }
  };

  const handleUpdateProgramObjectives = (programId: string, primary: string, secondary?: string) => {
    setPrograms((prev) =>
      prev.map((p) => {
        if (p.id === programId) {
          const updatedProg = { ...p, primaryObjective: primary, secondaryObjective: secondary };
          programRepository.saveProgram(currentUid, updatedProg).catch(() => {});
          return updatedProg;
        }
        return p;
      })
    );
    showToast("Program objectives updated & locked in.");
  };

  const handleUpdateProgramName = (programId: string, newName: string) => {
    setPrograms((prev) =>
      prev.map((p) => {
        if (p.id === programId) {
          const updatedProg = { ...p, name: newName };
          programRepository.saveProgram(currentUid, updatedProg).catch(() => {});
          return updatedProg;
        }
        return p;
      })
    );
    showToast(`Program name updated to "${newName}".`);
  };

  const handleUpdateProgram = (updatedProgram: TrainingProgram) => {
    setPrograms((prev) =>
      prev.map((p) => (p.id === updatedProgram.id ? updatedProgram : p))
    );
    programRepository.saveProgram(currentUid, updatedProgram).catch(() => {});
    if (updatedProgram.id === activeProgramId) {
      if (updatedProgram.daysPerWeek) {
        setUserProfile((prev) => {
          const nextProfile = {
            ...prev,
            daysPerWeek: updatedProgram.daysPerWeek || prev.daysPerWeek,
            goal: updatedProgram.goal || prev.goal
          };
          saveScopedField(currentUid, "user_profile", nextProfile);
          return nextProfile;
        });
      }
    }
    showToast(`Program "${updatedProgram.name}" saved (${updatedProgram.daysPerWeek || 6} Days/Wk).`);
  };

  const handleCreateCustomProgram = (newProg: TrainingProgram) => {
    setPrograms((prev) => [newProg, ...prev]);
    programRepository.saveProgram(currentUid, newProg).catch(() => {});
    setActiveProgramId(newProg.id);
    if (newProg.matrixPlans && newProg.matrixPlans.length > 0) {
      setMatrixPlans(newProg.matrixPlans);
    }
    showToast(`Custom program "${newProg.name}" created and activated!`);
  };

  const handleDeleteProgram = (programId: string) => {
    const progToDelete = programs.find((p) => p.id === programId);
    if (!progToDelete) return;

    const remaining = programs.filter((p) => p.id !== programId);
    if (remaining.length === 0) {
      showToast("Cannot delete the only remaining program.");
      return;
    }

    addTombstone(currentUid, "programs", programId);
    programRepository.deleteProgram(currentUid, programId).catch(() => {});
    setPrograms(remaining);
    saveScopedField(currentUid, "training_programs", remaining);

    // If active program was deleted, switch to first remaining program
    if (activeProgramId === programId) {
      const nextProg = remaining[0];
      setActiveProgramId(nextProg.id);
      saveScopedField(currentUid, "active_program_id", nextProg.id);
      if (nextProg.matrixPlans && nextProg.matrixPlans.length > 0) {
        setMatrixPlans(nextProg.matrixPlans);
        saveScopedField(currentUid, "matrix_plans", nextProg.matrixPlans);
      }
    }

    showToast(`Deleted program "${progToDelete.name}".`);
  };

  const handleSaveDayCompleted = (weekOrKey: number | string, dayOrCompleted?: DayOfWeek | boolean, isCompletedVal?: boolean) => {
    let key: string;
    let dayName: DayOfWeek | undefined;
    let weekNum: number | undefined;
    if (typeof weekOrKey === "number") {
      weekNum = weekOrKey;
      dayName = dayOrCompleted as DayOfWeek;
      key = `w${weekOrKey}-${dayOrCompleted}`;
    } else {
      key = weekOrKey;
      const m = String(key).match(/w?(\d+)-([A-Za-z]+)/);
      if (m) {
        weekNum = parseInt(m[1], 10);
        dayName = m[2] as DayOfWeek;
      }
    }
    const isCompleted = typeof isCompletedVal === "boolean"
      ? isCompletedVal
      : typeof dayOrCompleted === "boolean"
      ? dayOrCompleted
      : true;

    const baseStart = matrixPlans[0]?.startDate || CANONICAL_PROGRAM_START_DATE;
    const dateStr = weekNum && dayName ? computeDateForDay(baseStart, weekNum, dayName) : undefined;

    setCompletedDaysRecord((prev) => {
      const next = { ...prev, [key]: isCompleted };
      if (dateStr) next[dateStr] = isCompleted;
      saveScopedField(currentUid, "completed_days_record", next);
      return next;
    });

    if (isCompleted && weekNum && dayName) {
      const existing = workouts.find(
        (w) =>
          (dateStr && w.date === dateStr) ||
          (w.weekNumber === weekNum && w.dayOfWeek === dayName) ||
          w.dayKey === key
      );
      const planWeek = matrixPlans.find((p) => p.weekNumber === weekNum);
      const dayCell = planWeek?.days?.[dayName];
      if (dayCell && !dayCell.isRestDay && dayCell.exercises && dayCell.exercises.length > 0) {
        const sessionToSave: WorkoutSession = {
          id: existing?.id || `workout-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          date: dateStr || existing?.date || new Date().toISOString().split("T")[0],
          dayOfWeek: dayName,
          weekNumber: weekNum,
          dayKey: key,
          title: dayCell.workoutTitle || existing?.title || `${dayName} Workout`,
          durationMinutes: existing?.durationMinutes || 60,
          rpe: existing?.rpe || 8.5,
          sessionRpe: existing?.sessionRpe || 8.5,
          notes: existing?.notes || `[Week ${weekNum} • ${dayName}] Completed session.`,
          programId: activeProgramId,
          gymId: dayCell.gymId || existing?.gymId,
          gymName: dayCell.gymName || existing?.gymName,
          exercises: dayCell.exercises.map((e, idx) => {
            const prevEx = existing?.exercises?.[idx];
            return {
              id: prevEx?.id || `ex-${idx}`,
              exerciseName: e.exerciseName,
              muscleGroup: (e.muscleGroup as MuscleGroup) || prevEx?.muscleGroup || "Chest",
              equipmentType: e.equipmentType || prevEx?.equipmentType,
              machineId: e.machineId || prevEx?.machineId,
              sets: (e.sets && e.sets.length > 0 ? e.sets : prevEx?.sets || Array.from({ length: e.targetSets || 3 })).map((s, sIdx) => ({
                id: `set-${idx}-${sIdx + 1}`,
                setNumber: sIdx + 1,
                weight: cleanNumber((s as any)?.weight ?? e.targetWeight ?? 0),
                reps: typeof (s as any)?.reps === "number" ? (s as any).reps : parseInt(String((s as any)?.reps || e.targetReps || "10")) || 10,
                rpe: (s as any)?.rpe || 9,
                completed: true
              }))
            };
          }),
          updatedAt: new Date().toISOString()
        };
        const updated = deduplicateWorkouts([sessionToSave, ...workouts]);
        setWorkouts(updated);
        saveScopedField(currentUid, "fitness_workouts", updated);
        workoutRepository.saveCompletedWorkout(currentUid, sessionToSave).catch(console.warn);
      }
    } else if (!isCompleted && (key || dateStr)) {
      setCompletedDaysRecord((prev) => {
        const next = { ...prev };
        delete next[key];
        if (dateStr) delete next[dateStr];
        saveScopedField(currentUid, "completed_days_record", next);
        return next;
      });
      const remaining = workouts.filter((w) => w.dayKey !== key && (!dateStr || w.date !== dateStr));
      setWorkouts(remaining);
      saveScopedField(currentUid, "fitness_workouts", remaining);
    }

    scheduleCloudSync(50);
    showToast(`Day "${key}" updated in Matrix, Diary & Cloud!`);
  };

  const handleSaveSessionFeeling = (feeling: SessionFeeling) => {
    setSessionFeelings((prev) => {
      const nextFeelings = [
        feeling,
        ...prev.filter(
          (f) =>
            (feeling.workoutId && f.workoutId !== feeling.workoutId) ||
            (!feeling.workoutId && f.loggedAt !== feeling.loggedAt)
        )
      ];
      saveScopedField(currentUid, "session_feelings", nextFeelings);
      return nextFeelings;
    });
    scheduleCloudSync(50);
  };

  const handleFinishSessionDiary = (session: WorkoutSession, feeling?: SessionFeeling) => {
    const sessionWithStableId: WorkoutSession = {
      ...session,
      id: session.id || generateStableId("sess")
    };

    // Auto-mark completed in completedDaysRecord so dashboard, planner, and diary reflect it immediately
    let matchedDayKey: string | undefined = sessionWithStableId.dayKey;
    if (!matchedDayKey && sessionWithStableId.weekNumber && sessionWithStableId.dayOfWeek) {
      matchedDayKey = `w${sessionWithStableId.weekNumber}-${sessionWithStableId.dayOfWeek}`;
    }
    if (!matchedDayKey && sessionWithStableId.date) {
      const match = findPlannedSessionForDate(matrixPlans, sessionWithStableId.date, currentProgram.name);
      if (match) {
        matchedDayKey = `w${match.weekNumber}-${match.dayOfWeek}`;
      }
    }
    if (matchedDayKey || sessionWithStableId.date) {
      setCompletedDaysRecord((prev) => {
        const next = { ...prev };
        if (matchedDayKey) next[matchedDayKey] = true;
        if (sessionWithStableId.date) next[sessionWithStableId.date] = true;
        saveScopedField(currentUid, "completed_days_record", next);
        return next;
      });
    }

    const updated = deduplicateWorkouts([sessionWithStableId, ...workouts]);
    setWorkouts(updated);
    saveScopedField(currentUid, "fitness_workouts", updated);

    // Persist via workoutRepository so IndexedDB + SQLite/Scoped storage is updated immediately without competing Firestore stream
    workoutRepository.saveCompletedWorkout(currentUid, sessionWithStableId, { skipCloud: true }).catch((err) => {
      console.warn("Failed to persist completed workout in repository:", err);
    });

    // Remove active draft safely
    const draftKey = sessionWithStableId.planId ? `plan_${sessionWithStableId.planId}` : "free_workout";
    removeWorkoutDraft(currentUid, draftKey);
    removeWorkoutDraft(currentUid, "free_workout");
    if (sessionWithStableId.dayKey) {
      removeWorkoutDraft(currentUid, sessionWithStableId.dayKey);
      removeWorkoutDraft(currentUid, `plan_${sessionWithStableId.dayKey}`);
    }

    if (feeling) {
      setSessionFeelings((prev) => {
        const nextFeelings = [feeling, ...prev.filter((f) => f.workoutId !== feeling.workoutId)];
        saveScopedField(currentUid, "session_feelings", nextFeelings);
        return nextFeelings;
      });
    }

    // Trigger cloud sync to Firestore after local writes settle cleanly
    scheduleCloudSync(300);

    showToast(`Workout "${session.title}" recorded in diary, planner, and cloud!`);
  };

  // First time onboarding check
  useEffect(() => {
    try {
      const trigger = sessionStorage.getItem("pulse_trigger_onboarding");
      if (trigger === "true" || !userProfile.onboardingCompleted) {
        sessionStorage.removeItem("pulse_trigger_onboarding");
        setIsOnboardingOpen(true);
      }
    } catch (e) {
      if (!userProfile.onboardingCompleted) {
        setIsOnboardingOpen(true);
      }
    }
  }, [userProfile.onboardingCompleted, firebaseUser]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 3500);
  };

  const handleManualSessionRecovery = async (): Promise<SessionRecoveryReport> => {
    const report = await sessionRecoveryService.scanAndRecover(currentUid, workouts);
    if (report.injectedSessions.length > 0) {
      setWorkouts((prev) => {
        const combined = deduplicateWorkouts([...report.injectedSessions, ...prev]);
        saveScopedField(currentUid, "fitness_workouts", combined);
        return combined;
      });
      setCompletedDaysRecord((prev) => {
        const next = { ...prev };
        report.injectedSessions.forEach((s) => {
          if (s.dayKey) next[s.dayKey] = true;
          if (s.date) next[s.date] = true;
        });
        saveScopedField(currentUid, "completed_days_record", next);
        return next;
      });
      scheduleCloudSync(50);
    }
    showToast(report.message);
    return report;
  };

  const handleToggleUnit = () => {
    const next = unit === "kg" ? "lbs" : "kg";
    setUnit(next);
    showToast(`Switched weight display unit to ${next.toUpperCase()}`);
  };

  const handleSaveWorkout = (newWorkout: WorkoutSession) => {
    const sessionWithStableId: WorkoutSession = {
      ...newWorkout,
      id: newWorkout.id || generateStableId("workout")
    };

    // Auto-mark completed in completedDaysRecord so dashboard and diary reflect it immediately
    let matchedDayKey: string | undefined = sessionWithStableId.dayKey;
    if (!matchedDayKey && sessionWithStableId.weekNumber && sessionWithStableId.dayOfWeek) {
      matchedDayKey = `w${sessionWithStableId.weekNumber}-${sessionWithStableId.dayOfWeek}`;
    }
    if (!matchedDayKey && sessionWithStableId.date) {
      const match = findPlannedSessionForDate(matrixPlans, sessionWithStableId.date, currentProgram.name);
      if (match) {
        matchedDayKey = `w${match.weekNumber}-${match.dayOfWeek}`;
      }
    }
    if (matchedDayKey || sessionWithStableId.date) {
      setCompletedDaysRecord((prev) => {
        const next = { ...prev };
        if (matchedDayKey) next[matchedDayKey] = true;
        if (sessionWithStableId.date) next[sessionWithStableId.date] = true;
        saveScopedField(currentUid, "completed_days_record", next);
        return next;
      });
    }

    // Step 1: Commit to local storage and state FIRST before removing draft
    const updatedWorkouts = deduplicateWorkouts([sessionWithStableId, ...workouts]);
    saveScopedField(currentUid, "fitness_workouts", updatedWorkouts);
    setWorkouts(updatedWorkouts);
    workoutRepository.saveCompletedWorkout(currentUid, sessionWithStableId).catch(() => {});

    // Step 2: Now that local persistence succeeded, remove the draft safely
    const draftKey = sessionWithStableId.planId ? `plan_${sessionWithStableId.planId}` : "free_workout";
    removeWorkoutDraft(currentUid, draftKey);
    removeWorkoutDraft(currentUid, "free_workout");

    const vol = calculateSessionVolume(sessionWithStableId);
    const displayVol = unit === "lbs" ? Math.round(vol * 2.20462) : vol;
    showToast(`Workout logged! ${displayVol.toLocaleString()} ${unit} added to volume stats.`);
    setCurrentPlanToLog(null);
    setActiveTab("dashboard");

    // Prompt user for how the session felt (addressing user request)
    setTimeout(() => {
      setIsSessionFeelingOpen(true);
    }, 800);
  };

  const handleUpdateWorkoutQuietly = (updatedWorkout: WorkoutSession) => {
    const sessionWithStableId: WorkoutSession = {
      ...updatedWorkout,
      id: updatedWorkout.id || generateStableId("workout")
    };
    const updatedWorkouts = workouts.map((w) => (w.id === sessionWithStableId.id ? sessionWithStableId : w));
    const finalWorkouts = updatedWorkouts.some((w) => w.id === sessionWithStableId.id)
      ? updatedWorkouts
      : deduplicateWorkouts([sessionWithStableId, ...workouts]);

    setWorkouts(finalWorkouts);
    saveScopedField(currentUid, "fitness_workouts", finalWorkouts);
    workoutRepository.saveCompletedWorkout(currentUid, sessionWithStableId).catch(() => {});
    scheduleCloudSync(100);
  };

  const handleDeleteWorkout = (id: string) => {
    addTombstone(currentUid, "workouts", id);
    workoutRepository.deleteWorkout(currentUid, id).catch(() => {});
    const remaining = workouts.filter((w) => w.id !== id);
    setWorkouts(remaining);
    saveScopedField(currentUid, "fitness_workouts", remaining);
    setImportedSessionIds((prev) => {
      const next = prev.filter((i) => i !== id);
      saveScopedField(currentUid, "imported_ids", next);
      return next;
    });
    showToast("Workout removed from history.");
  };

  const handleBulkDeleteWorkouts = (ids: string[]) => {
    ids.forEach((id) => addTombstone(currentUid, "workouts", id));
    workoutRepository.deleteWorkoutsBulk(currentUid, ids).catch(() => {});
    const idSet = new Set(ids);
    const remaining = workouts.filter((w) => !idSet.has(w.id));
    setWorkouts(remaining);
    saveScopedField(currentUid, "fitness_workouts", remaining);
    setImportedSessionIds((prev) => {
      const next = prev.filter((i) => !idSet.has(i));
      saveScopedField(currentUid, "imported_ids", next);
      return next;
    });
    showToast(`Deleted ${ids.length} selected workout session(s).`);
  };

  const handleImportWorkouts = (imported: WorkoutSession[]) => {
    const prepared = imported.map((w) => ({
      ...w,
      id: w.id || generateStableId("import")
    }));
    const newIds = prepared.map((w) => w.id);
    setImportedSessionIds((prev) => [...newIds, ...prev]);
    setWorkouts((prev) => deduplicateWorkouts([...prepared, ...prev]));
    showToast(`Successfully imported ${prepared.length} sessions from spreadsheet.`);
  };

  const handleClearImportedWorkouts = () => {
    setWorkouts((prev) => prev.filter((w) => !importedSessionIds.includes(w.id)));
    setImportedSessionIds([]);
    saveScopedField(currentUid, "imported_ids", []);
    saveScopedField(currentUid, "fitness_workouts", workouts.filter((w) => !importedSessionIds.includes(w.id)));
    showToast("Cleared imported CSV data.");
  };

  const handleClearAllWorkouts = () => {
    setWorkouts([]);
    setImportedSessionIds([]);
    saveScopedField(currentUid, "imported_ids", []);
    saveScopedField(currentUid, "fitness_workouts", []);
    showToast("All workout logs cleared.");
  };

  const handleResetToSampleWorkouts = () => {
    setWorkouts([]);
    setImportedSessionIds([]);
    saveScopedField(currentUid, "imported_ids", []);
    saveScopedField(currentUid, "fitness_workouts", []);
    showToast("Cleared workouts list.");
  };

  const handleStartPlannedWorkout = (plan: WorkoutPlan) => {
    setCurrentPlanToLog(plan);
    setActiveTab("log");
    showToast(`Loaded "${plan.name}" into live session tracker.`);
  };

  const handleUpdateProfile = (updated: Partial<UserProfile>) => {
    setUserProfile((prev) => {
      const nextWeight = updated.weightKg !== undefined ? updated.weightKg : prev.weightKg;
      const nextGender = updated.gender || prev.gender;
      const nextGoal = updated.goal || prev.goal;

      let nextTargetCalories = updated.targetCalories;
      let nextMacroSplit = updated.macroSplit;

      if (!nextTargetCalories || updated.weightKg !== undefined || updated.goal !== undefined || updated.gender !== undefined) {
        const macros = calculateHormoneAndMacroPlan(nextGender, nextGoal, nextWeight);
        nextTargetCalories = updated.targetCalories || macros.totalCalories;
        nextMacroSplit = updated.macroSplit || {
          proteinG: macros.proteinGrams,
          carbsG: macros.carbsGrams,
          fatsG: macros.fatGrams
        };
      }

      const merged: UserProfile = {
        ...prev,
        ...updated,
        weightKg: nextWeight,
        targetCalories: nextTargetCalories,
        macroSplit: nextMacroSplit
      };

      if (updated.weightKg && updated.weightKg > 0 && updated.weightKg !== prev.weightKg) {
        setHealthMetrics((hm) => ({
          ...hm,
          googleHealth: { ...hm.googleHealth, bodyWeightKg: updated.weightKg! },
          fitbit: { ...hm.fitbit, bodyWeightKg: updated.weightKg! },
          beurer: { ...hm.beurer, scaleWeightKg: updated.weightKg! }
        }));
        const today = new Date().toISOString().split("T")[0];
        const bcRec: BodyCompositionRecord = {
          id: `bc-${Date.now()}`,
          date: today,
          weightKg: updated.weightKg,
          source: "manual",
          notes: "Updated from Profile"
        };
        setBodyCompRecords((prevBc) => mergeBodyCompRecords(prevBc, [bcRec]));
        measurementRepository.saveMeasurement(currentUid, bcRec).catch(() => {});
      }

      return merged;
    });
  };

  const handleOnboardingComplete = (updatedProfile: Partial<UserProfile>, selectedProgramId?: string) => {
    try {
      localStorage.setItem(getUserStorageKey(currentUid, "onboarding_completed"), "true");
    } catch (e) {}

    let finalProfile: UserProfile = userProfile;
    setUserProfile((prev) => {
      finalProfile = {
        ...prev,
        ...updatedProfile,
        onboardingCompleted: true
      };
      saveScopedField(currentUid, "user_profile", finalProfile);
      return finalProfile;
    });

    if (selectedProgramId) {
      setActiveProgramId(selectedProgramId);
      saveScopedField(currentUid, "active_program_id", selectedProgramId);

      const targetProgram = programs.find((p) => p.id === selectedProgramId) ||
        createPreplannedPrograms().find((p) => p.id === selectedProgramId);
      if (targetProgram && targetProgram.matrixPlans && targetProgram.matrixPlans.length > 0) {
        setMatrixPlans(targetProgram.matrixPlans);
        saveScopedField(currentUid, "matrix_plans", targetProgram.matrixPlans);
      }
    }

    setIsOnboardingOpen(false);
    scheduleCloudSync(300);
    const chosenProg = programs.find((p) => p.id === selectedProgramId);
    showToast(`AI Coach calibrated! ${chosenProg ? `Activated "${chosenProg.name}".` : "Program suggested & activated."}`);
  };

  const [isSyncingHealthData, setIsSyncingHealthData] = useState(false);

  const handleRefreshHealthData = async (isManual: boolean = false) => {
    setIsSyncingHealthData(true);
    const todayStr = new Date().toISOString().split("T")[0];
    try {
      const res = await fetch("/api/fitness/health-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: "all" })
      });
      if (res.ok) {
        const json = await res.json();
        const payload = json.data || json.metrics;
        if (payload) {
          const gh = payload.googleHealth;
          if (gh && typeof gh.bodyWeightKg === "number" && gh.bodyWeightKg > 20) {
            const w = gh.bodyWeightKg;
            const bf = typeof gh.bodyFatPercent === "number" ? gh.bodyFatPercent : undefined;
            const muscle = typeof gh.muscleMassPercent === "number" ? gh.muscleMassPercent : undefined;
            const water = typeof gh.bodyWaterPercent === "number" ? gh.bodyWaterPercent : undefined;
            const bone = typeof gh.boneMassKg === "number" ? gh.boneMassKg : undefined;
            const visc = typeof gh.visceralFatRating === "number" ? gh.visceralFatRating : undefined;
            const bmr = typeof gh.bmrKcal === "number" ? gh.bmrKcal : undefined;

            setBodyCompRecords((prev) => {
              const existingTodayIndex = prev.findIndex((r) => r.date === todayStr);
              if (existingTodayIndex >= 0) {
                const updated = [...prev];
                updated[existingTodayIndex] = {
                  ...updated[existingTodayIndex],
                  weightKg: Number(w.toFixed(1)),
                  ...(bf !== undefined ? { bodyFatPercent: bf } : {}),
                  ...(muscle !== undefined ? { muscleMassPercent: muscle } : {}),
                  ...(water !== undefined ? { waterPercent: water } : {}),
                  ...(bone !== undefined ? { boneMassKg: bone } : {}),
                  ...(visc !== undefined ? { visceralFat: visc } : {}),
                  ...(bmr !== undefined ? { bmrKcal: bmr } : {}),
                  source: "google_health"
                };
                return updated;
              } else {
                return [
                  ...prev,
                  {
                    id: `bc-${Date.now()}`,
                    date: todayStr,
                    weightKg: Number(w.toFixed(1)),
                    ...(bf !== undefined ? { bodyFatPercent: bf } : {}),
                    ...(muscle !== undefined ? { muscleMassPercent: muscle } : {}),
                    ...(water !== undefined ? { waterPercent: water } : {}),
                    ...(bone !== undefined ? { boneMassKg: bone } : {}),
                    ...(visc !== undefined ? { visceralFat: visc } : {}),
                    ...(bmr !== undefined ? { bmrKcal: bmr } : {}),
                    notes: "Synced via Google Health Smart Scale",
                    source: "google_health"
                  }
                ];
              }
            });
            setUserProfile((prev) => ({
              ...prev,
              weightKg: Number(w.toFixed(1))
            }));
          }

          setHealthMetrics((prev) => {
            const next = {
              ...prev,
              ...payload,
              googleHealth: payload.googleHealth ? { ...prev.googleHealth, ...payload.googleHealth } : prev.googleHealth,
              fitbit: payload.fitbit ? { ...prev.fitbit, ...payload.fitbit } : prev.fitbit
            };
            try {
              localStorage.setItem("pulse_health_metrics", JSON.stringify(next));
              localStorage.setItem("lifeos_last_health_sync_date", todayStr);
              localStorage.setItem("lifeos_last_health_sync_time", Date.now().toString());
            } catch (e) {}
            return next;
          });
        }
        if (isManual) {
          showToast("Synchronized with Google Health API & biometrics!");
        }
      }
    } catch (err) {
      if (isManual) {
        showToast("Health data updated from local sensors.");
      }
    } finally {
      setIsSyncingHealthData(false);
    }
  };

  // Automated Background Polling: Once a day on launch or cross-day rollover
  useEffect(() => {
    const todayStr = new Date().toISOString().split("T")[0];
    const lastSyncDate = localStorage.getItem("lifeos_last_health_sync_date");
    
    // Only auto-poll if we haven't synced yet today
    if (lastSyncDate !== todayStr) {
      handleRefreshHealthData(false);
    }

    // Check every 30 minutes if day has rolled over to trigger daily sync once
    const dailyInterval = setInterval(() => {
      const currentDay = new Date().toISOString().split("T")[0];
      const recordedDay = localStorage.getItem("lifeos_last_health_sync_date");
      if (recordedDay !== currentDay) {
        handleRefreshHealthData(false);
      }
    }, 30 * 60 * 1000);

    return () => clearInterval(dailyInterval);
  }, []);

  const handleSaveFeeling = (feeling: SessionFeeling) => {
    setSessionFeelings((prev) => [feeling, ...prev]);
    showToast("Session feeling recorded! AI Coach updated recovery index.");
  };

  // Today's scheduled session computation for Dashboard
  const todayDateObj = new Date();
  const todayDateStr = formatLocalDateISO(todayDateObj);
  const dayNamesList: DayOfWeek[] = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday"
  ];
  const todayDayName: DayOfWeek = dayNamesList[todayDateObj.getDay()];
  const formattedTodayDate = todayDateObj.toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
    year: "numeric"
  });

  const cycleBaseMonday = getWeekStartMonday(
    matrixPlans[0]?.startDate ||
    matrixPlans[0]?.days?.Monday?.date ||
    CANONICAL_PROGRAM_START_DATE
  );
  const diffDaysFromCycle = getDifferenceInDays(cycleBaseMonday, todayDateStr);
  const currentCalendarWeek = diffDaysFromCycle >= 0 ? Math.floor(diffDaysFromCycle / 7) + 1 : 1;

  const activeWeekMatrixPlan =
    matrixPlans.find((w) => w.weekNumber === currentCalendarWeek) ||
    matrixPlans[0] ||
    currentProgram.matrixPlans[0];
  const todayPlannedDay = activeWeekMatrixPlan?.days?.[todayDayName];
  const isTodaySessionCompleted = !!(
    completedDaysRecord[`w${currentCalendarWeek}-${todayDayName}`] ||
    completedDaysRecord[todayDateStr] ||
    workouts.some(
      (w) =>
        w.date === todayDateStr ||
        (w.weekNumber === currentCalendarWeek && w.dayOfWeek === todayDayName)
    )
  );

  const handleStartTodaySessionNow = () => {
    setDiaryTarget({ week: currentCalendarWeek, day: todayDayName, date: todayDateStr, timestamp: Date.now() });
    setActiveTab("diary");
  };

  return (
    <div className={isDarkMode ? "min-h-screen bg-[#090a0f] text-slate-100 flex flex-col font-sans selection:bg-rose-500/20 selection:text-rose-400 dark" : "min-h-screen bg-[#ECECEB] text-[#222222] flex flex-col font-sans selection:bg-[#AD314D]/20 selection:text-[#AD314D]"}>
      {/* Top Header Navigation */}
      <Navigation
        activeTab={activeTab}
        onSelectTab={(tab) => {
          if (tab === "sync") {
            setIsSyncModalOpen(true);
          } else if (tab === "diary") {
            setActiveTab("diary");
          } else {
            setActiveTab(tab);
          }
        }}
        unit={unit}
        onToggleUnit={handleToggleUnit}
        isSheetConnected={true}
        onOpenSync={() => setIsSyncModalOpen(true)}
        onOpenHealthModal={() => setIsHealthModalOpen(true)}
        onOpenVideoModal={() => setIsVideoModalOpen(true)}
        onOpenPhotosModal={() => setIsPhotosModalOpen(true)}
        userProfile={userProfile}
        isDarkMode={isDarkMode}
        onToggleDarkMode={handleToggleDarkMode}
        cloudSyncStatus={cloudSyncStatus}
        isCloudSyncing={isCloudSyncing}
        onForceCloudSync={() => setIsCloudSyncModalOpen(true)}
        firebaseUser={firebaseUser}
        onSignOut={handleSignOut}
        onOpenAuth={() => setIsAuthModalOpen(true)}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-7">
        {/* TAB 1: DASHBOARD VIEW */}
        {activeTab === "dashboard" && (
          <div className="space-y-7 animate-fadeIn">
            {/* Logged-in Account Banner */}
            <div className="p-3.5 sm:p-4 rounded-2xl bg-white border border-black/[0.08] shadow-xs flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 rounded-xl bg-neutral-100 border border-black/[0.06] text-[#AD314D] flex items-center justify-center shrink-0">
                  <User className="w-4 h-4" />
                </div>
                <div className="flex items-center gap-2 flex-wrap min-w-0">
                  <span className="text-xs font-semibold text-neutral-500">
                    Logged in account:
                  </span>
                  <span className="text-xs font-bold text-[#222222] truncate">
                    {firebaseUser?.email || userProfile.email || "user"}
                  </span>
                </div>
              </div>
            </div>

            {/* Quick Athlete Header Strip */}
            <div className="p-4 rounded-2xl bg-white border border-black/[0.06] shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-[#AD314D] text-white flex items-center justify-center font-bold text-xs">
                  {userProfile.name ? userProfile.name.charAt(0) : "A"}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-xs text-[#222222]">
                      {userProfile.name}
                    </span>
                    <span className="text-[10px] uppercase font-bold px-2 py-0.2 rounded-full bg-rose-50 text-[#AD314D] border border-rose-100">
                      {userProfile.goal}
                    </span>
                    <span className="text-[10px] capitalize px-2 py-0.2 rounded-full bg-black/[0.04] text-[#4A4A4A]">
                      {userProfile.gender}
                    </span>
                  </div>
                  <div className="text-[11px] text-[#777777] mt-0.5">
                    Target: {userProfile.targetCalories || calculateHormoneAndMacroPlan(userProfile.gender, userProfile.goal, userProfile.weightKg || 78.1).totalCalories} kcal • Steps: {healthMetrics.googleHealth.dailySteps.toLocaleString()} • Weight: {unit === "lbs" ? ((userProfile.weightKg || 78.1) * 2.20462).toFixed(1) : (userProfile.weightKg || 78.1)} {unit}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 self-end sm:self-auto">
                <button
                  type="button"
                  onClick={() => setIsSessionFeelingOpen(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-rose-50 hover:bg-rose-100 text-[#AD314D] text-xs font-semibold border border-rose-200 transition-colors"
                >
                  <Smile className="w-3.5 h-3.5" />
                  <span>Log Session Feeling</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCoachInitialSection("overview");
                    setActiveTab("coach");
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-black/[0.08] hover:bg-neutral-50 text-[#222222] text-xs font-semibold shadow-sm transition-all"
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                  <span>Open AI Coach</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCoachInitialSection("report");
                    setActiveTab("coach");
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gradient-to-r from-[#AD314D] to-[#68172C] hover:opacity-95 text-white text-xs font-semibold shadow-sm transition-all"
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                  <span>AI Health Report</span>
                </button>
              </div>
            </div>

            {/* ============================================================= */}
            {/* SCHEDULED PROGRAM SESSION (With Date Selector & Upcoming Workout Detection) */}
            {/* ============================================================= */}
            <DashboardScheduledSessionCard
              matrixPlans={matrixPlans}
              currentProgramName={currentProgram.name}
              completedDaysRecord={completedDaysRecord}
              unit={unit}
              workouts={workouts}
              userId={currentUid}
              onStartSession={(plan) => {
                setActiveTab("diary");
                showToast(`Opened "${plan.name}" in Today's Session Diary!`);
              }}
              onOpenCompletedWorkout={(session) => {
                if (session) {
                  setDiaryTarget({
                    week: session.weekNumber,
                    day: session.dayOfWeek as any,
                    date: session.date,
                    timestamp: Date.now()
                  });
                }
                setActiveTab("diary");
                showToast(`Viewing completed session "${session.title || "Workout"}" (${session.date || ""}) in Diary!`);
              }}
              onSaveDayCompleted={handleSaveDayCompleted}
              onUpdateMatrixPlans={handleUpdateMatrixPlans}
              onUpdateWorkout={handleSaveWorkout}
              onNavigateTab={(tab) => {
                if (tab === "matrix") setActiveTab("matrix");
                else if (tab === "diary") setActiveTab("diary");
                else setActiveTab(tab as NavTab);
              }}
              isDarkMode={isDarkMode}
            />

            {/* 1. Feature Summary Gradient Cards */}
            <SummaryCards
              workouts={workouts}
              unit={unit}
              userProfile={userProfile}
              completedDaysRecord={completedDaysRecord}
              onOpenLog={() => {
                setCurrentPlanToLog(null);
                setActiveTab("log");
              }}
              onOpenExecutiveSummary={() => setIsExecutiveSummaryOpen(true)}
              healthMetrics={healthMetrics}
              onOpenHealthIntegrations={() => setIsHealthModalOpen(true)}
              onRefreshHealthData={() => handleRefreshHealthData(true)}
              isRefreshingHealthData={isSyncingHealthData}
              isDarkMode={isDarkMode}
            />

            {/* Quick Action Navigation Bar */}
            <div className={`flex flex-wrap items-center justify-between gap-3 p-4 rounded-[18px] border transition-colors duration-300 ${
              isDarkMode 
                ? "bg-zinc-900 border-zinc-800 text-slate-100 shadow-xs" 
                : "bg-white border-black/[0.06] text-[#222222] shadow-[0_2px_12px_rgba(0,0,0,0.02)]"
            }`}>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[#AD314D]" />
                <span className="text-xs font-semibold uppercase tracking-wider">
                  Command Quick Actions
                </span>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => {
                    setCurrentPlanToLog(null);
                    setActiveTab("log");
                  }}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#AD314D] hover:bg-[#942740] text-white text-xs font-semibold shadow-sm transition-all"
                >
                  <PlusCircle className="w-3.5 h-3.5" />
                  <span>Log Workout</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab("diary")}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border transition-colors ${
                    isDarkMode 
                      ? "bg-indigo-950/60 hover:bg-indigo-900 text-indigo-300 border-indigo-800/80" 
                      : "bg-indigo-50 hover:bg-indigo-100 text-indigo-950 border-indigo-200"
                  }`}
                >
                  <BookOpen className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Today&apos;s Session Diary</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab("matrix")}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-colors ${
                    isDarkMode 
                      ? "bg-zinc-800 hover:bg-zinc-700 text-slate-200" 
                      : "bg-[#F0F0EE] hover:bg-[#E4E4E1] text-[#222222]"
                  }`}
                >
                  <CalendarRange className="w-3.5 h-3.5 text-[#AD314D]" />
                  <span>Planner</span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsVideoModalOpen(true)}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-colors ${
                    isDarkMode 
                      ? "bg-zinc-800 hover:bg-zinc-700 text-slate-200" 
                      : "bg-[#F0F0EE] hover:bg-[#E4E4E1] text-[#222222]"
                  }`}
                >
                  <Play className="w-3.5 h-3.5 text-[#AD314D]" />
                  <span>Exercise Videos</span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsPhotosModalOpen(true)}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-colors ${
                    isDarkMode 
                      ? "bg-zinc-800 hover:bg-zinc-700 text-slate-200" 
                      : "bg-[#F0F0EE] hover:bg-[#E4E4E1] text-[#222222]"
                  }`}
                >
                  <Camera className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Progress Photos</span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsExecutiveSummaryOpen(true)}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-colors ${
                    isDarkMode 
                      ? "bg-zinc-800 hover:bg-zinc-700 text-slate-200" 
                      : "bg-[#F0F0EE] hover:bg-[#E4E4E1] text-[#222222]"
                  }`}
                >
                  <Printer className="w-3.5 h-3.5 text-[#AD314D]" />
                  <span>PDF Summary</span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsSyncModalOpen(true)}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-colors ${
                    isDarkMode 
                      ? "bg-zinc-800 hover:bg-zinc-700 text-slate-200" 
                      : "bg-[#F0F0EE] hover:bg-[#E4E4E1] text-[#222222]"
                  }`}
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-500" />
                  <span>Spreadsheet Hub</span>
                </button>
              </div>
            </div>

            {/* 2. Progression Analytics Charts */}
            <ProgressionCharts workouts={workouts} unit={unit} isDarkMode={isDarkMode} />

            {/* 3. Recent Workouts Preview */}
            <div className="space-y-3">
              <div className="flex items-center justify-between px-1">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#4A4A4A]">
                  Recent Completed Workouts
                </h3>
                <button
                  type="button"
                  onClick={() => setActiveTab("history")}
                  className="text-xs font-semibold text-[#AD314D] hover:underline flex items-center gap-1"
                >
                  <span>View All Sessions ({workouts.length})</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>

              <WorkoutHistory
                workouts={workouts.slice(0, 3)}
                unit={unit}
                onDeleteWorkout={handleDeleteWorkout}
                onOpenSync={() => setIsSyncModalOpen(true)}
                onClearImportedWorkouts={handleClearImportedWorkouts}
                onResetToSampleWorkouts={handleResetToSampleWorkouts}
              />
            </div>
          </div>
        )}

        {/* TAB: HEALTH HUB & LIVE GOOGLE HEALTH DATA */}
        {activeTab === "health" && (
          <div className="animate-fadeIn">
            <HealthView
              healthMetrics={healthMetrics}
              bodyCompRecords={bodyCompRecords}
              unit={unit}
              onRefreshHealthData={() => handleRefreshHealthData(true)}
              isRefreshing={isSyncingHealthData}
              onOpenHealthIntegrations={() => setIsHealthModalOpen(true)}
              onAddBodyCompRecord={handleAddBodyCompRecord}
              onUpdateBodyCompRecord={handleUpdateBodyCompRecord}
              onDeleteBodyCompRecord={handleDeleteBodyCompRecord}
              isDarkMode={isDarkMode}
            />
          </div>
        )}

        {/* TAB: BODY COMPOSITION LAB */}
        {activeTab === "body_composition" && (
          <div className="animate-fadeIn">
            <BodyCompositionView
              records={bodyCompRecords}
              unit={unit}
              onAddRecord={handleAddBodyCompRecord}
              onUpdateRecord={handleUpdateBodyCompRecord}
              onDeleteRecord={handleDeleteBodyCompRecord}
              onOpenHealthModal={() => setIsHealthModalOpen(true)}
            />
          </div>
        )}

        {/* TAB 2: WEEKLY MATRIX PLANNER (Days Down, Weeks Right, Auto-Fill, 4-12 Weeks) */}
        {activeTab === "matrix" && (
          <div className="animate-fadeIn">
            <WeeklyMatrixPlanner
              matrixPlans={matrixPlans}
              onUpdatePlans={(updated) => {
                handleUpdateMatrixPlans(updated, "Matrix routine updated & saved.");
              }}
              unit={unit}
              userProfile={userProfile}
              programs={programs}
              activeProgramId={activeProgramId}
              workouts={workouts}
              completedDaysRecord={completedDaysRecord}
              onSaveDayCompleted={handleSaveDayCompleted}
              onUpdateWorkout={handleUpdateWorkoutQuietly}
              onSelectProgram={handleSelectProgram}
              onUpdateProgramName={handleUpdateProgramName}
              onUpdateProgramObjectives={handleUpdateProgramObjectives}
              onUpdateProgram={handleUpdateProgram}
              onCreateCustomProgram={handleCreateCustomProgram}
              onDeleteProgram={handleDeleteProgram}
              onNavigateToDiary={(target) => {
                if (target) {
                  setDiaryTarget({
                    week: target.week ?? currentCalendarWeek,
                    day: target.day ?? todayDayName,
                    date: target.date,
                    timestamp: Date.now()
                  });
                }
                setActiveTab("diary");
              }}
              onOpenAiGenerator={() => setIsAiGeneratorOpen(true)}
              onOpenOnboarding={() => setIsOnboardingOpen(true)}
              onStartSession={(dayPlan) => {
                const convertedPlan = convertDayCellToWorkoutPlan(
                  dayPlan,
                  undefined,
                  undefined,
                  currentProgram.name
                );
                handleStartPlannedWorkout(convertedPlan);
              }}
            />
          </div>
        )}

        {/* TAB: TODAY'S SESSION DIARY (Live logging aligned with Planner) */}
        {activeTab === "diary" && (
          <div className="animate-fadeIn">
            <TodaySessionDiary
              activeProgram={currentProgram}
              matrixPlans={matrixPlans}
              onUpdatePlans={(updated) => handleUpdateMatrixPlans(updated)}
              programs={programs}
              activeProgramId={activeProgramId}
              unit={unit}
              workouts={workouts}
              sessionFeelings={sessionFeelings}
              onUpdateSessionFeeling={handleSaveSessionFeeling}
              completedDaysRecord={completedDaysRecord}
              onFinishSession={handleFinishSessionDiary}
              onSavePlannedDayCompleted={handleSaveDayCompleted}
              onMarkDayCompleted={handleSaveDayCompleted}
              onDeleteWorkout={handleDeleteWorkout}
              onNavigateToPlanner={() => setActiveTab("matrix")}
              showGlobalToast={showToast}
              userId={currentUid}
              cloudSyncStatus={cloudSyncStatus}
              onOpenSync={() => setIsCloudSyncModalOpen(true)}
              diaryTarget={diaryTarget}
            />
          </div>
        )}

        {/* TAB 3: AI COACH & MACROS & 14-DAY COOLDOWN */}
        {activeTab === "coach" && (
          <div className="animate-fadeIn">
            <AiCoachPanel
              userProfile={userProfile}
              healthMetrics={healthMetrics}
              workouts={workouts}
              bodyCompRecords={bodyCompRecords}
              unit={unit}
              feelings={sessionFeelings}
              programs={programs}
              activeProgramId={activeProgramId}
              supplements={supplements}
              initialSection={coachInitialSection}
              onSelectProgram={handleSelectProgram}
              onNavigateToPlanner={() => setActiveTab("matrix")}
              onNavigateToDiary={() => setActiveTab("diary")}
              onOpenHealthModal={() => setIsHealthModalOpen(true)}
              onUpdateProfile={handleUpdateProfile}
              onOpenSessionFeelingModal={() => setIsSessionFeelingOpen(true)}
            />
          </div>
        )}

        {/* TAB 4: LOG WORKOUT VIEW */}
        {activeTab === "log" && (
          <div className="animate-fadeIn">
            <WorkoutLogger
              unit={unit}
              onSaveWorkout={handleSaveWorkout}
              onCancel={() => {
                setCurrentPlanToLog(null);
                setActiveTab("dashboard");
              }}
              initialPlan={currentPlanToLog}
              matrixPlans={matrixPlans}
              currentProgramName={currentProgram.name}
              activeProgramId={activeProgramId}
              userId={currentUid}
              workouts={workouts}
              completedDaysRecord={completedDaysRecord}
            />
          </div>
        )}

        {/* TAB 5: SUPPLEMENTS TRACKER (Manual, Not Protein) */}
        {activeTab === "supplements" && (
          <div className="animate-fadeIn">
            <SupplementsTracker
              supplements={supplements}
              workouts={workouts}
              categories={supplementCategories}
              onUpdateCategories={handleUpdateSupplementCategories}
              onUpdateSupplements={(updated) => {
                setSupplements(updated);
                showToast("Supplement tracking updated.");
              }}
            />
          </div>
        )}

        {/* TAB 7: PROFILE & CONNECTED APPS */}
        {activeTab === "profile" && (
          <div className="animate-fadeIn">
            <ProfilePage
              userProfile={userProfile}
              healthMetrics={healthMetrics}
              unit={unit}
              onUpdateProfile={handleUpdateProfile}
              onOpenOnboarding={() => setIsOnboardingOpen(true)}
              onOpenHealthModal={() => setIsHealthModalOpen(true)}
              activeProgram={currentProgram}
              programs={programs}
              matrixPlans={matrixPlans}
              cloudSyncStatus={cloudSyncStatus}
              isCloudSyncing={isCloudSyncing}
              onForceSyncCloud={handleForcePushToCloud}
              onNavigateToPlanner={() => setActiveTab("matrix")}
              onNavigateToDiary={() => setActiveTab("diary")}
              onUpdateProgram={handleUpdateProgram}
              firebaseUser={firebaseUser}
              onSignOut={handleSignOut}
              onOpenAuth={() => setIsAuthModalOpen(true)}
            />
          </div>
        )}

        {/* TAB 8: HISTORY VIEW */}
        {activeTab === "history" && (
          <div className="animate-fadeIn">
            <WorkoutHistory
              workouts={workouts}
              unit={unit}
              onDeleteWorkout={handleDeleteWorkout}
              onBulkDeleteWorkouts={handleBulkDeleteWorkouts}
              onOpenSync={() => setIsSyncModalOpen(true)}
              onClearImportedWorkouts={handleClearImportedWorkouts}
              onResetToSampleWorkouts={handleResetToSampleWorkouts}
            />
          </div>
        )}
      </main>

      {/* 5-Question Onboarding Modal */}
      <OnboardingModal
        isOpen={isOnboardingOpen}
        onClose={() => setIsOnboardingOpen(false)}
        initialProfile={userProfile}
        initialProgramId={activeProgramId}
        onCompleteOnboarding={handleOnboardingComplete}
      />

      {/* Google Health Platform Modal */}
      <HealthIntegrationsModal
        isOpen={isHealthModalOpen}
        onClose={() => setIsHealthModalOpen(false)}
        healthMetrics={healthMetrics}
        onRefreshData={handleRefreshHealthData}
        unit={unit}
        firebaseUser={firebaseUser}
        cloudSyncStatus={cloudSyncStatus}
        onSignInWithGoogle={async () => {
          try {
            await signInWithPopup(auth, googleProvider);
            showToast("Signed in with Google successfully!");
          } catch (err: any) {
            const msg = err?.message || String(err);
            const code = err?.code || "";
            if (code === "auth/popup-closed-by-user" || msg.includes("popup-closed-by-user")) {
              return;
            }
            console.warn("Google sign in notice:", err);
            showToast(err.message || "Google sign in was cancelled.");
          }
        }}
        onSignOut={async () => {
          try {
            await signOut(auth);
            showToast("Signed out successfully.");
          } catch (err: any) {
            console.error("Sign out error", err);
          }
        }}
      />

      {/* Exercise Video & Form Guide Modal */}
      <ExerciseVideoModal
        isOpen={isVideoModalOpen}
        onClose={() => setIsVideoModalOpen(false)}
      />

      {/* Progress Photos & Transformations Modal */}
      <ProgressPhotosModal
        isOpen={isPhotosModalOpen}
        onClose={() => setIsPhotosModalOpen(false)}
        photos={progressPhotos}
        onUpdatePhotos={(updated) => {
          setProgressPhotos(updated);
          showToast("Progress photo gallery updated.");
        }}
        unit={unit}
      />

      {/* Session Feeling Logger Modal */}
      <SessionFeelingModal
        isOpen={isSessionFeelingOpen}
        onClose={() => setIsSessionFeelingOpen(false)}
        onSaveFeeling={handleSaveFeeling}
      />

      {/* AI Program Generator Modal */}
      <AiProgramGeneratorModal
        isOpen={isAiGeneratorOpen}
        onClose={() => setIsAiGeneratorOpen(false)}
        userProfile={userProfile}
        onApplyGeneratedProgram={(newPlans) => {
          setMatrixPlans(newPlans);
          showToast(`Generated and applied ${newPlans.length}-week periodization matrix!`);
        }}
      />

      {/* Spreadsheet Sync & Template Download Modal */}
      <SpreadsheetSyncModal
        isOpen={isSyncModalOpen}
        onClose={() => setIsSyncModalOpen(false)}
        workouts={workouts}
        unit={unit}
        onImportWorkouts={handleImportWorkouts}
        onClearImportedWorkouts={handleClearImportedWorkouts}
        onClearAllWorkouts={handleClearAllWorkouts}
        onResetToSampleWorkouts={handleResetToSampleWorkouts}
      />

      {/* Executive Summary & PDF Export Modal */}
      <ExecutiveSummaryModal
        isOpen={isExecutiveSummaryOpen}
        onClose={() => setIsExecutiveSummaryOpen(false)}
        workouts={workouts}
        unit={unit}
      />

      {/* Cloud Sync & Cross-Device Account Modal */}
      <CloudSyncModal
        isOpen={isCloudSyncModalOpen}
        onClose={() => setIsCloudSyncModalOpen(false)}
        firebaseUser={firebaseUser}
        cloudSyncStatus={cloudSyncStatus}
        isCloudSyncing={isCloudSyncing}
        onForcePushToCloud={handleForcePushToCloud}
        onForcePullFromCloud={handleForcePullFromCloud}
        lastSyncedTime={lastSyncedTime}
        localStats={{
          programsCount: programs.length,
          workoutsCount: workouts.length,
          matrixWeeksCount: matrixPlans.length,
          activeProgramName: programs.find(p => p.id === activeProgramId)?.name || "Single Muscle Split 5 Day Program"
        }}
        showToast={showToast}
        isDarkMode={isDarkMode}
        onRunSessionRecovery={handleManualSessionRecovery}
      />

      {/* Mandatory Auth Login & Sign-Up Gate */}
      <AuthModal
        isOpen={isAuthModalOpen || (!firebaseUser && !isInitialHydrationPendingRef.current)}
        onClose={() => {
          if (firebaseUser) setIsAuthModalOpen(false);
        }}
        onSuccess={() => setIsAuthModalOpen(false)}
      />

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 bg-[#222222] text-white text-xs font-medium px-4 py-3 rounded-xl shadow-2xl border border-white/10 animate-bounce-short">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
}

export default App;
