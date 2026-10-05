import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  WorkoutSession,
  WeightUnit,
  UserProfile,
  SyncedHealthMetrics,
  WeeklyMatrixPlan,
  SupplementEntry,
  ProgressPhoto,
  SessionFeeling,
  TrainingProgram,
  BodyCompositionRecord
} from "../types";
import {
  INITIAL_WORKOUTS,
  deduplicateWorkouts
} from "../utils/calculations";
import {
  DEFAULT_USER_PROFILE,
  INITIAL_HEALTH_METRICS,
  INITIAL_SUPPLEMENTS,
  INITIAL_PROGRESS_PHOTOS,
  DEFAULT_SUPPLEMENT_CATEGORIES,
  createInitialMatrixPlan,
  createPreplannedPrograms,
  shiftAllMatrixDates,
  getStoredCustomExercises
} from "../utils/fitnessData";
import {
  auth,
  db,
  signInAnonymously,
  onAuthStateChanged,
  doc,
  setDoc,
  onSnapshot,
  disableNetwork,
  User as FirebaseUser
} from "../lib/firebase";
import {
  isFirestoreQuotaCooldownActive,
  calculateDailyQuotaResetTime,
  setStoredQuotaCooldown
} from "../utils/syncManager";

export type SyncState = "synced" | "syncing" | "error" | "offline" | "connecting" | "saved";

export interface FitnessStoreState {
  workouts: WorkoutSession[];
  programs: TrainingProgram[];
  activeProgramId: string;
  matrixPlans: WeeklyMatrixPlan[];
  userProfile: UserProfile;
  healthMetrics: SyncedHealthMetrics;
  bodyCompRecords: BodyCompositionRecord[];
  supplements: SupplementEntry[];
  supplementCategories: string[];
  progressPhotos: ProgressPhoto[];
  sessionFeelings: SessionFeeling[];
  completedDaysRecord: Record<string, boolean>;
  unit: WeightUnit;
  firebaseUser: FirebaseUser | null;
  syncState: SyncState;
  syncStatusLabel: string;
  lastSyncedTime: string | null;
  lastSyncError: string | null;
}

export interface FitnessStoreActions {
  // Unit
  setUnit: (unit: WeightUnit) => void;
  // Workouts
  addWorkout: (workout: WorkoutSession) => void;
  updateWorkout: (id: string, updated: Partial<WorkoutSession>) => void;
  deleteWorkout: (id: string) => void;
  archiveWorkout: (id: string) => void;
  setWorkouts: React.Dispatch<React.SetStateAction<WorkoutSession[]>>;
  // Programs & Matrix
  setActiveProgramId: (id: string) => void;
  updateProgram: (program: TrainingProgram) => void;
  addProgram: (program: TrainingProgram) => void;
  setPrograms: React.Dispatch<React.SetStateAction<TrainingProgram[]>>;
  setMatrixPlans: React.Dispatch<React.SetStateAction<WeeklyMatrixPlan[]>>;
  updateMatrixPlan: (weekNumber: number, plan: WeeklyMatrixPlan) => void;
  toggleCompletedDay: (dayKey: string) => void;
  // User Profile
  updateUserProfile: (profile: UserProfile | ((prev: UserProfile) => UserProfile)) => void;
  // Health Metrics
  updateHealthMetrics: (metrics: SyncedHealthMetrics | ((prev: SyncedHealthMetrics) => SyncedHealthMetrics)) => void;
  // Body Composition
  addBodyCompRecord: (record: BodyCompositionRecord) => void;
  updateBodyCompRecord: (id: string, updated: Partial<BodyCompositionRecord>) => void;
  deleteBodyCompRecord: (id: string) => void;
  setBodyCompRecords: React.Dispatch<React.SetStateAction<BodyCompositionRecord[]>>;
  // Supplements
  toggleSupplement: (id: string) => void;
  addSupplement: (supplement: SupplementEntry) => void;
  deleteSupplement: (id: string) => void;
  updateSupplementCategories: (categories: string[]) => void;
  // Progress Photos
  addProgressPhoto: (photo: ProgressPhoto) => void;
  deleteProgressPhoto: (id: string) => void;
  // Feelings
  addSessionFeeling: (feeling: SessionFeeling) => void;
  // Cloud Sync
  forceSyncToCloud: () => Promise<boolean>;
  setFirebaseUser: (user: FirebaseUser | null) => void;
}

export function useFitnessStore() {
  // 1. Workouts State
  const [workouts, setWorkouts] = useState<WorkoutSession[]>(() => {
    try {
      const resetKey = "pulse_sample_data_cleared_v5";
      if (!localStorage.getItem(resetKey)) {
        localStorage.removeItem("pulse_fitness_workouts");
        localStorage.removeItem("pulse_imported_ids");
        localStorage.setItem(resetKey, "true");
        localStorage.setItem("pulse_fitness_workouts", JSON.stringify(INITIAL_WORKOUTS));
        return INITIAL_WORKOUTS;
      }
      const saved = localStorage.getItem("pulse_fitness_workouts");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch (e) {
      console.warn("Failed to load workouts from localStorage", e);
    }
    return INITIAL_WORKOUTS;
  });

  // 2. Weight Unit State
  const [unit, setUnit] = useState<WeightUnit>(() => {
    try {
      const saved = localStorage.getItem("pulse_fitness_unit");
      if (saved === "lbs" || saved === "kg") return saved;
    } catch (e) {}
    return "kg";
  });

  // 3. User Profile State
  const [userProfile, setUserProfile] = useState<UserProfile>(() => {
    try {
      const saved = localStorage.getItem("pulse_user_profile");
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return DEFAULT_USER_PROFILE;
  });

  // 4. Health Metrics State
  const [healthMetrics, setHealthMetrics] = useState<SyncedHealthMetrics>(() => {
    try {
      const saved = localStorage.getItem("pulse_health_metrics");
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return INITIAL_HEALTH_METRICS;
  });

  // 5. Training Programs State
  const [programs, setPrograms] = useState<TrainingProgram[]>(() => {
    try {
      const resetKeyProgs = "pulse_progs_full_cycles_v8";
      if (!localStorage.getItem(resetKeyProgs)) {
        localStorage.removeItem("pulse_training_programs");
        localStorage.setItem(resetKeyProgs, "true");
        const initial = createPreplannedPrograms();
        localStorage.setItem("pulse_training_programs", JSON.stringify(initial));
        return initial;
      }
      const saved = localStorage.getItem("pulse_training_programs");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch (e) {}
    return createPreplannedPrograms();
  });

  // 6. Active Program ID
  const [activeProgramId, setActiveProgramId] = useState<string>(() => {
    try {
      const saved = localStorage.getItem("pulse_active_program_id");
      if (saved) return saved;
    } catch (e) {}
    return "prog-single-muscle";
  });

  // 7. Matrix Plans State
  const [matrixPlans, setMatrixPlans] = useState<WeeklyMatrixPlan[]>(() => {
    try {
      const resetKeyMatrix = "pulse_matrix_plans_v8";
      if (!localStorage.getItem(resetKeyMatrix)) {
        localStorage.removeItem("pulse_matrix_plans");
        localStorage.setItem(resetKeyMatrix, "true");
        const initial = createInitialMatrixPlan();
        localStorage.setItem("pulse_matrix_plans", JSON.stringify(initial));
        return initial;
      }
      const saved = localStorage.getItem("pulse_matrix_plans");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch (e) {}
    return createInitialMatrixPlan();
  });

  // 8. Completed Days Record
  const [completedDaysRecord, setCompletedDaysRecord] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem("pulse_completed_days_record");
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return {};
  });

  // 9. Supplements State
  const [supplements, setSupplements] = useState<SupplementEntry[]>(() => {
    try {
      const saved = localStorage.getItem("pulse_supplements");
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return INITIAL_SUPPLEMENTS;
  });

  // 10. Supplement Categories
  const [supplementCategories, setSupplementCategories] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem("pulse_supplement_categories");
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return DEFAULT_SUPPLEMENT_CATEGORIES;
  });

  // 11. Progress Photos
  const [progressPhotos, setProgressPhotos] = useState<ProgressPhoto[]>(() => {
    try {
      const saved = localStorage.getItem("pulse_progress_photos");
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return INITIAL_PROGRESS_PHOTOS;
  });

  // 12. Session Feelings
  const [sessionFeelings, setSessionFeelings] = useState<SessionFeeling[]>(() => {
    try {
      const saved = localStorage.getItem("pulse_session_feelings");
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return [
      {
        workoutId: "sess-01",
        rating: 4,
        soreness: 2,
        rpeAverage: 8,
        energyLevel: "high",
        loggedAt: "2026-03-24",
        notes: "Great leg pump, recovered well from previous squat session."
      }
    ];
  });

  // 13. Body Composition Records
  const [bodyCompRecords, setBodyCompRecords] = useState<BodyCompositionRecord[]>(() => {
    try {
      const saved = localStorage.getItem("pulse_body_comp_records");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.map((r: any) => ({
            ...r,
            muscleMassKg: r.muscleMassKg ?? (r.muscleMassPercent && r.weightKg ? Number(((r.muscleMassPercent / 100) * r.weightKg).toFixed(1)) : undefined),
            muscleMassPercent: r.muscleMassPercent ?? (r.muscleMassKg && r.weightKg ? Number(((r.muscleMassKg / r.weightKg) * 100).toFixed(1)) : undefined)
          }));
        }
      }
    } catch (e) {}
    return [
      { id: "bc-1", date: "2026-08-01", weightKg: 80.5, bodyFatPercent: 15.5, muscleMassKg: 35.3, muscleMassPercent: 43.8, boneMassKg: 3.4, waterPercent: 57.5, visceralFat: 5, bmrKcal: 1920, waistCm: 82, source: "seeded_demo", isDemo: true },
      { id: "bc-2", date: "2026-08-15", weightKg: 80.0, bodyFatPercent: 15.2, muscleMassKg: 35.3, muscleMassPercent: 44.1, boneMassKg: 3.4, waterPercent: 57.8, visceralFat: 5, bmrKcal: 1935, waistCm: 81.5, source: "seeded_demo", isDemo: true },
      { id: "bc-3", date: "2026-09-01", weightKg: 79.5, bodyFatPercent: 14.8, muscleMassKg: 35.4, muscleMassPercent: 44.5, boneMassKg: 3.5, waterPercent: 58.1, visceralFat: 4, bmrKcal: 1950, waistCm: 81.0, source: "seeded_demo", isDemo: true },
      { id: "bc-4", date: "2026-09-09", weightKg: 79.1, bodyFatPercent: 14.5, muscleMassKg: 35.4, muscleMassPercent: 44.8, boneMassKg: 3.5, waterPercent: 58.4, visceralFat: 4, bmrKcal: 1968, waistCm: 80.5, source: "seeded_demo", isDemo: true },
      { id: "bc-5", date: "2026-09-18", weightKg: 78.1, bodyFatPercent: 14.2, muscleMassKg: 35.5, muscleMassPercent: 45.4, boneMassKg: 3.5, waterPercent: 58.6, visceralFat: 4, bmrKcal: 1975, waistCm: 80.0, source: "manual" }
    ];
  });

  // Cloud Sync & Auth States
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [syncState, setSyncState] = useState<SyncState>("connecting");
  const [syncStatusLabel, setSyncStatusLabel] = useState<string>("Connecting to Cloud...");
  const [lastSyncedTime, setLastSyncedTime] = useState<string | null>(null);
  const [lastSyncError, setLastSyncError] = useState<string | null>(null);

  const isRemoteUpdateRef = useRef<boolean>(false);

  // LocalStorage Synchronization Effects
  useEffect(() => {
    try {
      localStorage.setItem("pulse_fitness_workouts", JSON.stringify(workouts));
    } catch (e) {}
  }, [workouts]);

  useEffect(() => {
    try {
      localStorage.setItem("pulse_fitness_unit", unit);
    } catch (e) {}
  }, [unit]);

  useEffect(() => {
    try {
      localStorage.setItem("pulse_user_profile", JSON.stringify(userProfile));
    } catch (e) {}
  }, [userProfile]);

  useEffect(() => {
    try {
      localStorage.setItem("pulse_health_metrics", JSON.stringify(healthMetrics));
    } catch (e) {}
  }, [healthMetrics]);

  useEffect(() => {
    try {
      localStorage.setItem("pulse_matrix_plans", JSON.stringify(matrixPlans));
    } catch (e) {}
  }, [matrixPlans]);

  useEffect(() => {
    try {
      localStorage.setItem("pulse_training_programs", JSON.stringify(programs));
    } catch (e) {}
  }, [programs]);

  useEffect(() => {
    try {
      localStorage.setItem("pulse_active_program_id", activeProgramId);
    } catch (e) {}
  }, [activeProgramId]);

  useEffect(() => {
    try {
      localStorage.setItem("pulse_completed_days_record", JSON.stringify(completedDaysRecord));
    } catch (e) {}
  }, [completedDaysRecord]);

  useEffect(() => {
    try {
      localStorage.setItem("pulse_supplements", JSON.stringify(supplements));
    } catch (e) {}
  }, [supplements]);

  useEffect(() => {
    try {
      localStorage.setItem("pulse_supplement_categories", JSON.stringify(supplementCategories));
    } catch (e) {}
  }, [supplementCategories]);

  useEffect(() => {
    try {
      localStorage.setItem("pulse_progress_photos", JSON.stringify(progressPhotos));
    } catch (e) {}
  }, [progressPhotos]);

  useEffect(() => {
    try {
      localStorage.setItem("pulse_session_feelings", JSON.stringify(sessionFeelings));
    } catch (e) {}
  }, [sessionFeelings]);

  useEffect(() => {
    try {
      localStorage.setItem("pulse_body_comp_records", JSON.stringify(bodyCompRecords));
    } catch (e) {}
  }, [bodyCompRecords]);

  // Network Connectivity
  useEffect(() => {
    const handleOnline = () => {
      setSyncState(firebaseUser ? "synced" : "offline");
      setSyncStatusLabel(firebaseUser && !firebaseUser.isAnonymous ? "Cloud Synced (Firebase)" : "Cloud Synced (Anon)");
    };
    const handleOffline = () => {
      setSyncState("offline");
      setSyncStatusLabel("Offline mode");
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    if (!navigator.onLine) {
      setSyncState("offline");
      setSyncStatusLabel("Offline mode");
    }

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [firebaseUser]);

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setFirebaseUser(user);
        setSyncState("synced");
        setSyncStatusLabel(user.isAnonymous ? "Cloud Synced (Anon)" : "Cloud Synced (Firebase)");
      } else {
        try {
          const cred = await signInAnonymously(auth);
          setFirebaseUser(cred.user);
          setSyncState("synced");
          setSyncStatusLabel("Cloud Synced (Anon)");
        } catch (err) {
          console.warn("Anonymous auth failed", err);
          setSyncState("offline");
          setSyncStatusLabel("Offline mode");
        }
      }
    });
    return () => unsubscribe();
  }, []);

  // Real-time Firestore Listener
  useEffect(() => {
    const effectiveUid = firebaseUser?.uid || "guest";
    const docRef = doc(db, "users", effectiveUid, "data", "fitnessStore");

    const unsubscribeSnapshot = onSnapshot(
      docRef,
      (snapshot) => {
        if (snapshot.exists()) {
          isRemoteUpdateRef.current = true;
          const data = snapshot.data();
          if (data.workouts && Array.isArray(data.workouts)) setWorkouts(data.workouts);
          if (data.customExercises && Array.isArray(data.customExercises)) {
            try {
              localStorage.setItem("pulse_custom_exercises", JSON.stringify(data.customExercises));
            } catch (e) {}
          }
          if (data.programs && Array.isArray(data.programs)) {
            const aligned = data.programs.map((p: TrainingProgram) => {
              const start = p.matrixPlans?.[0]?.startDate;
              if (start) {
                return {
                  ...p,
                  matrixPlans: shiftAllMatrixDates(p.matrixPlans || [], start)
                };
              }
              return p;
            });
            setPrograms(aligned);
          }
          if (data.activeProgramId) setActiveProgramId(data.activeProgramId);
          if (data.matrixPlans && Array.isArray(data.matrixPlans)) {
            const activeStart = data.matrixPlans?.[0]?.startDate;
            if (activeStart) {
              setMatrixPlans(shiftAllMatrixDates(data.matrixPlans, activeStart));
            } else {
              setMatrixPlans(data.matrixPlans);
            }
          }
          if (data.bodyCompRecords && Array.isArray(data.bodyCompRecords)) setBodyCompRecords(data.bodyCompRecords);
          if (data.userProfile) setUserProfile(data.userProfile);
          if (data.healthMetrics) setHealthMetrics(data.healthMetrics);
          if (data.supplements) setSupplements(data.supplements);
          if (data.supplementCategories && Array.isArray(data.supplementCategories)) setSupplementCategories(data.supplementCategories);
          if (data.progressPhotos) setProgressPhotos(data.progressPhotos);
          if (data.sessionFeelings) setSessionFeelings(data.sessionFeelings);
          if (data.completedDaysRecord) setCompletedDaysRecord(data.completedDaysRecord);

          setLastSyncedTime(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
          setSyncState("synced");
          setSyncStatusLabel("Cloud Synced");
          setLastSyncError(null);

          setTimeout(() => {
            isRemoteUpdateRef.current = false;
          }, 600);
        } else {
          // Document does not exist yet -> initial seed
          const customExercises = getStoredCustomExercises();
          if (programs.length > 0 || workouts.length > 0) {
            setDoc(
              docRef,
              {
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
                customExercises,
                updatedAt: new Date().toISOString()
              },
              { merge: true }
            ).catch((err) => console.warn("Initial cloud seed notice", err));
          }
        }
      },
      (err) => {
        console.warn("Firestore snapshot listener notice", err);
      }
    );

    return () => {
      unsubscribeSnapshot();
    };
  }, [firebaseUser?.uid]);

  // Debounced Auto-Sync to Cloud on Local State Changes
  useEffect(() => {
    const effectiveUid = firebaseUser?.uid || "guest";
    if (isRemoteUpdateRef.current) return;
    if (programs.length === 0 && workouts.length === 0) return;
    if (isFirestoreQuotaCooldownActive()) {
      setSyncState("saved");
      setSyncStatusLabel("Saved locally (Cloud quota reached)");
      return;
    }

    setSyncState("syncing");
    const handler = setTimeout(() => {
      if (isFirestoreQuotaCooldownActive()) {
        setSyncState("saved");
        setSyncStatusLabel("Saved locally (Cloud quota reached)");
        return;
      }
      const docRef = doc(db, "users", effectiveUid, "data", "fitnessStore");
      const customExercises = getStoredCustomExercises();
      setDoc(
        docRef,
        {
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
          customExercises,
          updatedAt: new Date().toISOString()
        },
        { merge: true }
      )
        .then(() => {
          setSyncState("synced");
          setSyncStatusLabel("Cloud Synced");
          setLastSyncedTime(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
          setLastSyncError(null);
        })
        .catch((err) => {
          const isQuota =
            err?.code === "resource-exhausted" ||
            err?.message?.includes("resource-exhausted") ||
            err?.message?.includes("Quota");
          if (isQuota) {
            const resetTime = calculateDailyQuotaResetTime();
            setStoredQuotaCooldown(resetTime);
            setSyncState("saved");
            setSyncStatusLabel("Saved locally (Cloud quota reached)");
          } else {
            console.warn("Firestore write notice", err);
            setSyncState("saved");
            setSyncStatusLabel("Saved locally");
          }
        });
    }, 1000);

    return () => clearTimeout(handler);
  }, [
    firebaseUser,
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

  // Actions
  const addWorkout = useCallback((newWorkout: WorkoutSession) => {
    setWorkouts((prev) => deduplicateWorkouts([newWorkout, ...prev]));
  }, []);

  const updateWorkout = useCallback((id: string, updated: Partial<WorkoutSession>) => {
    setWorkouts((prev) =>
      prev.map((w) => (w.id === id ? { ...w, ...updated } : w))
    );
  }, []);

  const deleteWorkout = useCallback((id: string) => {
    setWorkouts((prev) => prev.filter((w) => w.id !== id));
  }, []);

  const archiveWorkout = useCallback((id: string) => {
    setWorkouts((prev) =>
      prev.map((w) => (w.id === id ? { ...w, isArchived: true } : w))
    );
  }, []);

  const addBodyCompRecord = useCallback((record: BodyCompositionRecord) => {
    setBodyCompRecords((prev) => [...prev, record]);
  }, []);

  const updateBodyCompRecord = useCallback((id: string, updated: Partial<BodyCompositionRecord>) => {
    setBodyCompRecords((prev) =>
      prev.map((r) => (r.id === id ? { ...r, ...updated } : r))
    );
  }, []);

  const deleteBodyCompRecord = useCallback((id: string) => {
    setBodyCompRecords((prev) => prev.filter((r) => r.id !== id));
  }, []);

  const updateProgram = useCallback((updatedProg: TrainingProgram) => {
    setPrograms((prev) =>
      prev.map((p) => (p.id === updatedProg.id ? updatedProg : p))
    );
  }, []);

  const addProgram = useCallback((newProg: TrainingProgram) => {
    setPrograms((prev) => [newProg, ...prev]);
  }, []);

  const updateMatrixPlan = useCallback((weekNumber: number, plan: WeeklyMatrixPlan) => {
    setMatrixPlans((prev) =>
      prev.map((p) => (p.weekNumber === weekNumber ? plan : p))
    );
  }, []);

  const toggleCompletedDay = useCallback((dayKey: string) => {
    setCompletedDaysRecord((prev) => ({
      ...prev,
      [dayKey]: !prev[dayKey]
    }));
  }, []);

  const toggleSupplement = useCallback((id: string) => {
    setSupplements((prev) =>
      prev.map((s) => {
        if (s.id === id) {
          const nextTaken = !s.taken;
          return {
            ...s,
            taken: nextTaken,
            streakDays: nextTaken ? s.streakDays + 1 : Math.max(0, s.streakDays - 1),
            lastTakenDate: nextTaken ? new Date().toISOString().split("T")[0] : s.lastTakenDate
          };
        }
        return s;
      })
    );
  }, []);

  const addSupplement = useCallback((supplement: SupplementEntry) => {
    setSupplements((prev) => [...prev, supplement]);
  }, []);

  const deleteSupplement = useCallback((id: string) => {
    setSupplements((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const addProgressPhoto = useCallback((photo: ProgressPhoto) => {
    setProgressPhotos((prev) => [photo, ...prev]);
  }, []);

  const deleteProgressPhoto = useCallback((id: string) => {
    setProgressPhotos((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const addSessionFeeling = useCallback((feeling: SessionFeeling) => {
    setSessionFeelings((prev) => [feeling, ...prev]);
  }, []);

  const forceSyncToCloud = useCallback(async (): Promise<boolean> => {
    let currentUser = firebaseUser;
    if (!currentUser) {
      try {
        const cred = await signInAnonymously(auth);
        currentUser = cred.user;
        setFirebaseUser(currentUser);
      } catch (e: any) {
        setSyncState("error");
        setLastSyncError(e?.message || "Cloud sync requires network connection");
        return false;
      }
    }
    if (!currentUser) return false;

    setSyncState("syncing");
    setSyncStatusLabel("Syncing to Cloud...");
    try {
      const docRef = doc(db, "users", currentUser.uid, "data", "fitnessStore");
      const customExercises = getStoredCustomExercises();
      await setDoc(
        docRef,
        {
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
          customExercises,
          updatedAt: new Date().toISOString()
        },
        { merge: true }
      );
      setSyncState("synced");
      setSyncStatusLabel("Cloud Synced");
      setLastSyncedTime(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
      setLastSyncError(null);
      return true;
    } catch (err: any) {
      setSyncState("error");
      setSyncStatusLabel("Sync error");
      setLastSyncError(err?.message || "Failed to save state to cloud database");
      return false;
    }
  }, [
    firebaseUser,
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

  return {
    // State
    workouts,
    programs,
    activeProgramId,
    matrixPlans,
    userProfile,
    healthMetrics,
    bodyCompRecords,
    supplements,
    supplementCategories,
    progressPhotos,
    sessionFeelings,
    completedDaysRecord,
    unit,
    firebaseUser,
    syncState,
    syncStatusLabel,
    lastSyncedTime,
    lastSyncError,
    // Setters & Actions
    setUnit,
    addWorkout,
    updateWorkout,
    deleteWorkout,
    archiveWorkout,
    setWorkouts,
    setActiveProgramId,
    updateProgram,
    addProgram,
    setPrograms,
    setMatrixPlans,
    updateMatrixPlan,
    toggleCompletedDay,
    updateUserProfile: setUserProfile,
    updateHealthMetrics: setHealthMetrics,
    addBodyCompRecord,
    updateBodyCompRecord,
    deleteBodyCompRecord,
    setBodyCompRecords,
    toggleSupplement,
    addSupplement,
    deleteSupplement,
    updateSupplementCategories: setSupplementCategories,
    addProgressPhoto,
    deleteProgressPhoto,
    addSessionFeeling,
    forceSyncToCloud,
    setFirebaseUser
  };
}
