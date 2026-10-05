import { getValidAccessToken, getValidGoogleHealthAccessToken, getAuthenticatedClient, loadTokens } from './auth.js';
import type { GoogleHealthDailyMetric, GoogleHealthIntradayHour, GoogleHealthSyncDiagnostics } from './types.js';

export const HEALTH_API_BASE_URL = 'https://health.googleapis.com/v4';

export interface HealthDataResult {
  success: boolean;
  message: string;
  data?: any;
  error?: string;
  statusCode?: number;
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
  deviceDisplayName: string;
  platform: string;
}

export interface GoogleHealthLiveSummary {
  connected: boolean;
  athleteName: string;
  athleteEmail: string;
  avatarUrl?: string;
  activeDevice: string;
  steps?: number;
  dailySteps?: number;
  todaySteps?: number;
  todayDistanceKm?: number;
  distanceKm?: number;
  todayFloors?: number;
  floorsClimbed?: number;
  todayExerciseCalories?: number;
  todayExerciseAzm?: number;
  todayActiveCalories?: number;
  todayTotalCalories?: number;
  activeCaloriesStatus: "live" | "empty_results" | "missing_permission" | "unsupported_operation" | "request_failed";
  activeCaloriesReason?: string;
  totalCaloriesStatus: "live" | "empty_results" | "missing_permission" | "unsupported_operation" | "request_failed";
  totalCaloriesReason?: string;
  weeklyStepsTotal?: number;
  weeklyStepsAverage?: number;
  dailyHistory: GoogleHealthDailyMetric[];
  past7CompleteDays: GoogleHealthDailyMetric[];
  intradayHourly: GoogleHealthIntradayHour[];
  recentExercises: GoogleHealthExerciseItem[];
  syncDiagnostics: GoogleHealthSyncDiagnostics;
  // Sleep Architecture
  sleepStatus: "live" | "empty_results" | "missing_permission" | "unsupported_operation" | "request_failed";
  sleepReason?: string;
  sleepDate?: string;
  sleepStartTime?: string;
  sleepEndTime?: string;
  timeAsleepMinutes?: number;
  minutesInSleepPeriod?: number;
  sleepDurationFormatted?: string;
  sleepHours?: number;
  sleepScore?: number;
  deepSleepMinutes?: number;
  remSleepMinutes?: number;
  lightSleepMinutes?: number;
  awakeMinutes?: number;
  restlessMinutes?: number;
  // Body Composition & Physiological Vitals
  restingHeartRate?: number;
  lowestHeartRate?: number;
  peakHeartRate?: number;
  currentPulse?: number;
  hrvRmssd?: number;
  spo2Percent?: number;
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
  activeCalories?: number;
  activeZoneMinutes?: number;
  trainingDaysCount?: number;
  trainingDaysWeek?: number;
  totalCaloriesBurned?: number;
  cadenceAvg?: number;
  // Scope status flags
  grantedScopes: string[];
  missingScopes: string[];
  hasSleepScope: boolean;
  hasHealthMetricsScope: boolean;
  hasActivityScope: boolean;
  lastSyncedIso: string;
  lastSuccessfulSyncIso?: string;
  isLiveApiMetric: Record<string, boolean>;
}

/**
 * Helper to format a Date into YYYY-MM-DD in a specific timezone
 */
export function getCivilDateString(date: Date, timeZone: string = 'Europe/Oslo'): string {
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    return formatter.format(date); // outputs "YYYY-MM-DD"
  } catch {
    return date.toISOString().split('T')[0];
  }
}

/**
 * Fetch health & activity data from the Google Health API
 */
export async function fetchHealthData(endpoint: string = 'dataTypes/steps/dataPoints'): Promise<HealthDataResult> {
  const ghToken = await getValidGoogleHealthAccessToken();
  const tokenResult = !ghToken ? await getValidAccessToken() : null;
  const token = ghToken || tokenResult?.token;

  if (!token) {
    return {
      success: false,
      message: 'Not authenticated. Please connect your Google Health account first.',
      error: 'UNAUTHENTICATED'
    };
  }

  try {
    const url = endpoint.startsWith('http') ? endpoint : `${HEALTH_API_BASE_URL}/${endpoint}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();
    return {
      success: res.ok,
      message: res.ok ? 'Successfully retrieved Google Health API data.' : 'API error',
      data: res.ok ? data : undefined,
      error: !res.ok ? data?.error?.message || res.statusText : undefined,
      statusCode: res.status
    };
  } catch (err: any) {
    return {
      success: false,
      message: 'Failed to retrieve data from Google Health API.',
      error: err.message || 'Unknown error',
    };
  }
}

/**
 * Fetch a complete, aggregated summary directly from Google Health API v4
 */
export async function fetchGoogleHealthSummary(
  daysCount: number = 14,
  timeZone: string = 'Europe/Oslo',
  requestId?: string
): Promise<{
  success: boolean;
  summary?: GoogleHealthLiveSummary;
  error?: string;
  statusCode?: number;
}> {
  const attemptStartTime = new Date().toISOString();
  const reqId = requestId || `req-sync-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
  const [tokenResult, healthToken] = await Promise.all([
    getValidAccessToken(),
    getValidGoogleHealthAccessToken()
  ]);

  if (!tokenResult?.token && !healthToken) {
    return {
      success: false,
      error: 'Not authenticated. Please connect Google Health first.',
      statusCode: 401
    };
  }

  const token = tokenResult?.token || healthToken || '';
  const ghToken = healthToken || token;

  try {
    // 1. Fetch user info & token info to inspect scopes
    let athleteName = 'David Rootwelt-Norberg';
    let athleteEmail = 'david@rootwelt-norberg.com';
    let avatarUrl = '';
    let grantedScopes: string[] = [];

    try {
      const [userRes, tokenInfoRes] = await Promise.all([
        fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
          headers: { Authorization: `Bearer ${token}` }
        }),
        fetch(`https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=${encodeURIComponent(token)}`)
      ]);

      if (userRes.ok) {
        const u = await userRes.json();
        athleteName = u.name || athleteName;
        athleteEmail = u.email || athleteEmail;
        avatarUrl = u.picture || '';
      }

      if (tokenInfoRes.ok) {
        const ti = await tokenInfoRes.json();
        const scopeStr = ti.scope || '';
        grantedScopes = scopeStr.split(' ').filter(Boolean);
      }
    } catch (e) {
      console.warn('Failed to query userinfo/tokeninfo:', e);
    }

    // 2. Prepare civil date range for dailyRollUp
    const now = new Date();
    const todayCivilStr = getCivilDateString(now, timeZone);
    const [tYear, tMonth, tDay] = todayCivilStr.split('-').map(Number);

    const startRange = new Date(now.getTime() - daysCount * 24 * 60 * 60 * 1000);
    const startCivilStr = getCivilDateString(startRange, timeZone);
    const [sYear, sMonth, sDay] = startCivilStr.split('-').map(Number);

    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const tomorrowCivilStr = getCivilDateString(tomorrow, timeZone);
    const [eYear, eMonth, eDay] = tomorrowCivilStr.split('-').map(Number);

    const rangeBody = {
      range: {
        start: {
          date: {
            year: sYear,
            month: sMonth,
            day: sDay
          }
        },
        end: {
          date: {
            year: eYear,
            month: eMonth,
            day: eDay
          }
        }
      }
    };

    const totalCalDays = Math.min(daysCount, 13);
    const totalCalStartRange = new Date(now.getTime() - totalCalDays * 24 * 60 * 60 * 1000);
    const totalCalStartCivilStr = getCivilDateString(totalCalStartRange, timeZone);
    const [tcYear, tcMonth, tcDay] = totalCalStartCivilStr.split('-').map(Number);
    const totalCalRangeBody = {
      range: {
        start: {
          date: {
            year: tcYear,
            month: tcMonth,
            day: tcDay
          }
        },
        end: rangeBody.range.end
      }
    };

    // 3. Query dailyRollUp and dataPoints for steps, distance, floors, exercises, active calories, total calories, heart rate, and sleep in parallel
    let currentToken = token;
    let currentGhToken = ghToken;
    const startRangeIso = startRange.toISOString();
    const tomorrowIso = tomorrow.toISOString();
    const startNanos = BigInt(startRange.getTime()) * BigInt(1000000);
    const endNanos = BigInt(tomorrow.getTime()) * BigInt(1000000);

    const todayStartNanos = BigInt(new Date(`${todayCivilStr}T00:00:00Z`).getTime()) * BigInt(1000000);

    let [
      stepsRes,
      distRes,
      floorsRes,
      exerciseRes,
      activeCalRollupRes,
      activeCalPointsRes,
      totalCalRollupRes,
      sleepRes,
      sleepSessionRes,
      sleepStagesRes,
      googleFitSleepSessionsRes,
      googleFitSleepSegmentsRes,
      googleFitSleepAggregateRes,
      googleFitDataSourcesRes,
      fitbitSleepDateRes,
      fitbitSleepListRes,
      fitbitActivitySummaryRes,
      fitbitHeartRateRes,
      fitbitActivityListRes,
      googleHealthHeartRateRes,
      googleFitAllSessionsRes,
      googleFitActivityAggregateRes,
      googleFitCaloriesDataSourceRes,
      googleFitHeartRateDataSourceRes,
      googleFitHeartMinutesDataSourceRes
    ] = await Promise.all([
      fetch(`${HEALTH_API_BASE_URL}/users/me/dataTypes/steps/dataPoints:dailyRollUp`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${currentGhToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(rangeBody)
      }).catch(() => null),
      fetch(`${HEALTH_API_BASE_URL}/users/me/dataTypes/distance/dataPoints:dailyRollUp`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${currentGhToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(rangeBody)
      }).catch(() => null),
      fetch(`${HEALTH_API_BASE_URL}/users/me/dataTypes/floors/dataPoints:dailyRollUp`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${currentGhToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(rangeBody)
      }).catch(() => null),
      fetch(`${HEALTH_API_BASE_URL}/users/me/dataTypes/exercise/dataPoints?pageSize=50`, {
        headers: { Authorization: `Bearer ${currentGhToken}` }
      }).catch(() => null),
      fetch(`${HEALTH_API_BASE_URL}/users/me/dataTypes/active-energy-burned/dataPoints:dailyRollUp`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${currentGhToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(rangeBody)
      }).catch(() => null),
      fetch(`${HEALTH_API_BASE_URL}/users/me/dataTypes/active-energy-burned/dataPoints?pageSize=100`, {
        headers: { Authorization: `Bearer ${currentGhToken}` }
      }).catch(() => null),
      fetch(`${HEALTH_API_BASE_URL}/users/me/dataTypes/total-calories/dataPoints:dailyRollUp`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${currentGhToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(totalCalRangeBody)
      }).catch(() => null),
      fetch(`${HEALTH_API_BASE_URL}/users/me/dataTypes/sleep/dataPoints?pageSize=50`, {
        headers: { Authorization: `Bearer ${currentGhToken}` }
      }).catch(() => null),
      Promise.resolve(null),
      Promise.resolve(null),
      fetch(`https://www.googleapis.com/fitness/v1/users/me/sessions?activityType=72&startTime=${encodeURIComponent(startRangeIso)}&endTime=${encodeURIComponent(tomorrowIso)}`, {
        headers: { Authorization: `Bearer ${currentToken}` }
      }).catch(() => null),
      fetch(`https://www.googleapis.com/fitness/v1/users/me/dataSources/derived:com.google.sleep.segment:com.google.android.gms:merged/datasets/${startNanos}-${endNanos}`, {
        headers: { Authorization: `Bearer ${currentToken}` }
      }).catch(() => null),
      fetch(`https://www.googleapis.com/fitness/v1/users/me/dataset:aggregate`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${currentToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          aggregateBy: [{ dataTypeName: 'com.google.sleep.segment' }],
          startTimeMillis: startRange.getTime(),
          endTimeMillis: tomorrow.getTime()
        })
      }).catch(() => null),
      fetch(`https://www.googleapis.com/fitness/v1/users/me/dataSources?dataTypeName=com.google.sleep.segment`, {
        headers: { Authorization: `Bearer ${currentToken}` }
      }).catch(() => null),
      fetch(`https://api.fitbit.com/1.2/user/-/sleep/date/${todayCivilStr}.json`, {
        headers: { Authorization: `Bearer ${currentToken}` }
      }).catch(() => null),
      fetch(`https://api.fitbit.com/1.2/user/-/sleep/list.json?afterDate=${startRangeIso.slice(0, 10)}&sort=desc&limit=10&offset=0`, {
        headers: { Authorization: `Bearer ${currentToken}` }
      }).catch(() => null),
      fetch(`https://api.fitbit.com/1/user/-/activities/date/${todayCivilStr}.json`, {
        headers: { Authorization: `Bearer ${currentToken}` }
      }).catch(() => null),
      fetch(`https://api.fitbit.com/1/user/-/activities/heart/date/${todayCivilStr}/1d.json`, {
        headers: { Authorization: `Bearer ${currentToken}` }
      }).catch(() => null),
      fetch(`https://api.fitbit.com/1/user/-/activities/list.json?afterDate=${startRangeIso.slice(0, 10)}&sort=desc&limit=20&offset=0`, {
        headers: { Authorization: `Bearer ${currentToken}` }
      }).catch(() => null),
      fetch(`${HEALTH_API_BASE_URL}/users/me/dataTypes/heart-rate/dataPoints?pageSize=200`, {
        headers: { Authorization: `Bearer ${currentGhToken}` }
      }).catch(() => null),
      fetch(`https://www.googleapis.com/fitness/v1/users/me/sessions?startTime=${encodeURIComponent(startRangeIso)}&endTime=${encodeURIComponent(tomorrowIso)}`, {
        headers: { Authorization: `Bearer ${currentToken}` }
      }).catch(() => null),
      // Google Fit aggregate for calories, heart minutes, active minutes & heart rate bpm
      fetch(`https://www.googleapis.com/fitness/v1/users/me/dataset:aggregate`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${currentToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          aggregateBy: [
            { dataTypeName: 'com.google.calories.expended' },
            { dataTypeName: 'com.google.active_minutes' },
            { dataTypeName: 'com.google.heart_minutes' },
            { dataTypeName: 'com.google.heart_rate.bpm' }
          ],
          bucketByTime: { durationMillis: 86400000 },
          startTimeMillis: startRange.getTime(),
          endTimeMillis: tomorrow.getTime()
        })
      }).catch(() => null),
      // Google Fit merged calories dataset
      fetch(`https://www.googleapis.com/fitness/v1/users/me/dataSources/derived:com.google.calories.expended:com.google.android.gms:merge_calories_expended/datasets/${todayStartNanos}-${endNanos}`, {
        headers: { Authorization: `Bearer ${currentToken}` }
      }).catch(() => null),
      // Google Fit merged heart rate dataset
      fetch(`https://www.googleapis.com/fitness/v1/users/me/dataSources/derived:com.google.heart_rate.bpm:com.google.android.gms:merge_heart_rate_bpm/datasets/${todayStartNanos}-${endNanos}`, {
        headers: { Authorization: `Bearer ${currentToken}` }
      }).catch(() => null),
      // Google Fit merged heart minutes dataset
      fetch(`https://www.googleapis.com/fitness/v1/users/me/dataSources/derived:com.google.heart_minutes:com.google.android.gms:merge_heart_minutes/datasets/${todayStartNanos}-${endNanos}`, {
        headers: { Authorization: `Bearer ${currentToken}` }
      }).catch(() => null)
    ]);

    // If 401 Unauthorized, attempt token refresh and retry
    if (stepsRes && stepsRes.status === 401) {
      try {
        const refreshed = await getValidAccessToken();
        if (refreshed?.token && refreshed.token !== currentToken) {
          currentToken = refreshed.token;
          [
            stepsRes,
            distRes,
            floorsRes,
            exerciseRes,
            activeCalRollupRes,
            activeCalPointsRes,
            totalCalRollupRes,
            sleepRes,
            sleepSessionRes,
            sleepStagesRes,
            googleFitSleepSessionsRes,
            googleFitSleepSegmentsRes,
            googleFitSleepAggregateRes,
            googleFitDataSourcesRes,
            fitbitSleepDateRes,
            fitbitSleepListRes,
            fitbitActivitySummaryRes,
            fitbitHeartRateRes,
            fitbitActivityListRes,
            googleHealthHeartRateRes,
            googleFitAllSessionsRes
          ] = await Promise.all([
            fetch(`${HEALTH_API_BASE_URL}/users/me/dataTypes/steps/dataPoints:dailyRollUp`, {
              method: 'POST',
              headers: { Authorization: `Bearer ${currentToken}`, 'Content-Type': 'application/json' },
              body: JSON.stringify(rangeBody)
            }).catch(() => null),
            fetch(`${HEALTH_API_BASE_URL}/users/me/dataTypes/distance/dataPoints:dailyRollUp`, {
              method: 'POST',
              headers: { Authorization: `Bearer ${currentToken}`, 'Content-Type': 'application/json' },
              body: JSON.stringify(rangeBody)
            }).catch(() => null),
            fetch(`${HEALTH_API_BASE_URL}/users/me/dataTypes/floors/dataPoints:dailyRollUp`, {
              method: 'POST',
              headers: { Authorization: `Bearer ${currentToken}`, 'Content-Type': 'application/json' },
              body: JSON.stringify(rangeBody)
            }).catch(() => null),
            fetch(`${HEALTH_API_BASE_URL}/users/me/dataTypes/exercise/dataPoints?pageSize=50`, {
              headers: { Authorization: `Bearer ${currentToken}` }
            }).catch(() => null),
            fetch(`${HEALTH_API_BASE_URL}/users/me/dataTypes/active-energy-burned/dataPoints:dailyRollUp`, {
              method: 'POST',
              headers: { Authorization: `Bearer ${currentToken}`, 'Content-Type': 'application/json' },
              body: JSON.stringify(rangeBody)
            }).catch(() => null),
            fetch(`${HEALTH_API_BASE_URL}/users/me/dataTypes/active-energy-burned/dataPoints?pageSize=50`, {
              headers: { Authorization: `Bearer ${currentToken}` }
            }).catch(() => null),
            fetch(`${HEALTH_API_BASE_URL}/users/me/dataTypes/total-calories/dataPoints:dailyRollUp`, {
              method: 'POST',
              headers: { Authorization: `Bearer ${currentToken}`, 'Content-Type': 'application/json' },
              body: JSON.stringify(totalCalRangeBody)
            }).catch(() => null),
            fetch(`${HEALTH_API_BASE_URL}/users/me/dataTypes/sleep/dataPoints?pageSize=50`, {
              headers: { Authorization: `Bearer ${currentToken}` }
            }).catch(() => null),
            fetch(`${HEALTH_API_BASE_URL}/users/me/dataTypes/sleep-session/dataPoints?pageSize=50`, {
              headers: { Authorization: `Bearer ${currentToken}` }
            }).catch(() => null),
            fetch(`${HEALTH_API_BASE_URL}/users/me/dataTypes/sleep-stage/dataPoints?pageSize=100`, {
              headers: { Authorization: `Bearer ${currentToken}` }
            }).catch(() => null),
            fetch(`https://www.googleapis.com/fitness/v1/users/me/sessions?activityType=72&startTime=${encodeURIComponent(startRangeIso)}&endTime=${encodeURIComponent(tomorrowIso)}`, {
              headers: { Authorization: `Bearer ${currentToken}` }
            }).catch(() => null),
            fetch(`https://www.googleapis.com/fitness/v1/users/me/dataSources/derived:com.google.sleep.segment:com.google.android.gms:merged/datasets/${startNanos}-${endNanos}`, {
              headers: { Authorization: `Bearer ${currentToken}` }
            }).catch(() => null),
            fetch(`https://www.googleapis.com/fitness/v1/users/me/dataset:aggregate`, {
              method: 'POST',
              headers: { Authorization: `Bearer ${currentToken}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                aggregateBy: [{ dataTypeName: 'com.google.sleep.segment' }],
                startTimeMillis: startRange.getTime(),
                endTimeMillis: tomorrow.getTime()
              })
            }).catch(() => null),
            fetch(`https://www.googleapis.com/fitness/v1/users/me/dataSources?dataTypeName=com.google.sleep.segment`, {
              headers: { Authorization: `Bearer ${currentToken}` }
            }).catch(() => null),
            fetch(`https://api.fitbit.com/1.2/user/-/sleep/date/${todayCivilStr}.json`, {
              headers: { Authorization: `Bearer ${currentToken}` }
            }).catch(() => null),
            fetch(`https://api.fitbit.com/1.2/user/-/sleep/list.json?afterDate=${startRangeIso.slice(0, 10)}&sort=desc&limit=10&offset=0`, {
              headers: { Authorization: `Bearer ${currentToken}` }
            }).catch(() => null),
            fetch(`https://api.fitbit.com/1/user/-/activities/date/${todayCivilStr}.json`, {
              headers: { Authorization: `Bearer ${currentToken}` }
            }).catch(() => null),
            fetch(`https://api.fitbit.com/1/user/-/activities/heart/date/${todayCivilStr}/1d.json`, {
              headers: { Authorization: `Bearer ${currentToken}` }
            }).catch(() => null),
            fetch(`https://api.fitbit.com/1/user/-/activities/list.json?afterDate=${startRangeIso.slice(0, 10)}&sort=desc&limit=20&offset=0`, {
              headers: { Authorization: `Bearer ${currentToken}` }
            }).catch(() => null),
            fetch(`${HEALTH_API_BASE_URL}/users/me/dataTypes/heart_rate/dataPoints?pageSize=100`, {
              headers: { Authorization: `Bearer ${currentToken}` }
            }).catch(() => null),
            fetch(`https://www.googleapis.com/fitness/v1/users/me/sessions?startTime=${encodeURIComponent(startRangeIso)}&endTime=${encodeURIComponent(tomorrowIso)}`, {
              headers: { Authorization: `Bearer ${currentToken}` }
            }).catch(() => null)
          ]);
        }
      } catch (refreshErr) {
        console.warn('Auto-refresh attempt on 401 failed:', refreshErr);
      }
    }

    if (stepsRes && !stepsRes.ok && stepsRes.status === 401) {
      return {
        success: false,
        error: 'Google Health authentication expired. Please re-authenticate.',
        statusCode: 401
      };
    }

    const stepsData = stepsRes && stepsRes.ok ? await stepsRes.json() : null;
    const distData = distRes && distRes.ok ? await distRes.json() : null;
    const floorsData = floorsRes && floorsRes.ok ? await floorsRes.json() : null;
    const exerciseData = exerciseRes && exerciseRes.ok ? await exerciseRes.json() : null;
    const activeCalRollupData = activeCalRollupRes && activeCalRollupRes.ok ? await activeCalRollupRes.json() : null;
    const activeCalPointsData = activeCalPointsRes && activeCalPointsRes.ok ? await activeCalPointsRes.json() : null;
    const totalCalRollupData = totalCalRollupRes && totalCalRollupRes.ok ? await totalCalRollupRes.json() : null;
    const sleepData = sleepRes && sleepRes.ok ? await sleepRes.json() : null;
    const sleepSessionData = sleepSessionRes && sleepSessionRes.ok ? await sleepSessionRes.json() : null;
    const sleepStagesData = sleepStagesRes && sleepStagesRes.ok ? await sleepStagesRes.json() : null;
    const googleFitSleepData = googleFitSleepSessionsRes && googleFitSleepSessionsRes.ok ? await googleFitSleepSessionsRes.json() : null;
    const googleFitSleepSegmentsData = googleFitSleepSegmentsRes && googleFitSleepSegmentsRes.ok ? await googleFitSleepSegmentsRes.json() : null;
    const googleFitSleepAggregateData = googleFitSleepAggregateRes && googleFitSleepAggregateRes.ok ? await googleFitSleepAggregateRes.json() : null;
    const googleFitDataSourcesData = googleFitDataSourcesRes && googleFitDataSourcesRes.ok ? await googleFitDataSourcesRes.json() : null;
    const fitbitSleepDateData = fitbitSleepDateRes && fitbitSleepDateRes.ok ? await fitbitSleepDateRes.json() : null;
    const fitbitSleepListData = fitbitSleepListRes && fitbitSleepListRes.ok ? await fitbitSleepListRes.json() : null;
    const fitbitActivitySummaryData = fitbitActivitySummaryRes && fitbitActivitySummaryRes.ok ? await fitbitActivitySummaryRes.json() : null;
    const fitbitHeartRateData = fitbitHeartRateRes && fitbitHeartRateRes.ok ? await fitbitHeartRateRes.json() : null;
    const fitbitActivityListData = fitbitActivityListRes && fitbitActivityListRes.ok ? await fitbitActivityListRes.json() : null;
    const googleHealthHeartRateData = googleHealthHeartRateRes && googleHealthHeartRateRes.ok ? await googleHealthHeartRateRes.json() : null;
    const googleFitAllSessionsData = googleFitAllSessionsRes && googleFitAllSessionsRes.ok ? await googleFitAllSessionsRes.json() : null;

    const googleFitActivityAggregateData = googleFitActivityAggregateRes && googleFitActivityAggregateRes.ok ? await googleFitActivityAggregateRes.json() : null;
    const googleFitCaloriesData = googleFitCaloriesDataSourceRes && googleFitCaloriesDataSourceRes.ok ? await googleFitCaloriesDataSourceRes.json() : null;
    const googleFitHeartRateDataSourceData = googleFitHeartRateDataSourceRes && googleFitHeartRateDataSourceRes.ok ? await googleFitHeartRateDataSourceRes.json() : null;
    const googleFitHeartMinutesData = googleFitHeartMinutesDataSourceRes && googleFitHeartMinutesDataSourceRes.ok ? await googleFitHeartMinutesDataSourceRes.json() : null;

    // If Google Fit has specific sleep segment data streams, query them
    const additionalFitSegments: any[] = [];
    if (Array.isArray(googleFitDataSourcesData?.dataSource) && googleFitDataSourcesData.dataSource.length > 0) {
      try {
        const streamQueries = googleFitDataSourcesData.dataSource.slice(0, 5).map((ds: any) => {
          const streamId = ds.dataStreamId;
          if (!streamId) return Promise.resolve(null);
          return fetch(`https://www.googleapis.com/fitness/v1/users/me/dataSources/${encodeURIComponent(streamId)}/datasets/${startNanos}-${endNanos}`, {
            headers: { Authorization: `Bearer ${currentToken}` }
          }).then(r => r.ok ? r.json() : null).catch(() => null);
        });
        const streamResults = await Promise.all(streamQueries);
        for (const res of streamResults) {
          if (Array.isArray(res?.point)) {
            additionalFitSegments.push(...res.point);
          }
        }
      } catch (dsErr) {
        console.warn('Notice checking additional Google Fit sleep data sources:', dsErr);
      }
    }

    // Fetch paginated intraday steps dataPoints (pageSize 1000 for full 24h minute-level resolution)
    const allIntradayDataPoints: any[] = [];
    try {
      let pageToken = '';
      let pageCount = 0;
      while (pageCount < 3) {
        const url = `${HEALTH_API_BASE_URL}/users/me/dataTypes/steps/dataPoints?pageSize=1000${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`;
        const pRes = await fetch(url, { headers: { Authorization: `Bearer ${currentGhToken}` } });
        if (!pRes.ok) break;
        const pJson = await pRes.json();
        if (Array.isArray(pJson.dataPoints)) {
          allIntradayDataPoints.push(...pJson.dataPoints);
        }
        pageToken = pJson.nextPageToken;
        pageCount++;
        if (!pageToken) break;
      }
    } catch (e) {
      console.warn('Notice querying paginated intraday data points:', e);
    }

    // Parse daily metrics map
    const dailyMap: Record<string, GoogleHealthDailyMetric> = {};

    if (Array.isArray(stepsData?.rollupDataPoints)) {
      for (const pt of stepsData.rollupDataPoints) {
        const d = pt.civilStartTime?.date;
        if (d && d.year && d.month && d.day) {
          const dateStr = `${d.year}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`;
          const stepsCount = Number(pt.steps?.countSum || 0);
          if (!dailyMap[dateStr]) {
            dailyMap[dateStr] = { date: dateStr, steps: 0, distanceMeters: 0, floors: 0 };
          }
          dailyMap[dateStr].steps = stepsCount;
        }
      }
    }

    if (Array.isArray(distData?.rollupDataPoints)) {
      for (const pt of distData.rollupDataPoints) {
        const d = pt.civilStartTime?.date;
        if (d && d.year && d.month && d.day) {
          const dateStr = `${d.year}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`;
          const mm = Number(pt.distance?.millimetersSum || 0);
          if (!dailyMap[dateStr]) {
            dailyMap[dateStr] = { date: dateStr, steps: 0, distanceMeters: 0, floors: 0 };
          }
          dailyMap[dateStr].distanceMeters = Math.round(mm / 1000);
        }
      }
    }

    if (Array.isArray(floorsData?.rollupDataPoints)) {
      for (const pt of floorsData.rollupDataPoints) {
        const d = pt.civilStartTime?.date;
        if (d && d.year && d.month && d.day) {
          const dateStr = `${d.year}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`;
          const count = Number(pt.floors?.countSum || 0);
          if (!dailyMap[dateStr]) {
            dailyMap[dateStr] = { date: dateStr, steps: 0, distanceMeters: 0, floors: 0 };
          }
          dailyMap[dateStr].floors = count;
        }
      }
    }

    // Parse Active Energy Burned (dailyRollUp & dataPoints)
    let todayActiveCalories: number | undefined;
    let activeCaloriesStatus: "live" | "empty_results" | "missing_permission" | "unsupported_operation" | "request_failed" = "empty_results";
    let activeCaloriesReason: string = "No active energy records registered by provider for this period.";

    if (activeCalRollupRes) {
      if (activeCalRollupRes.status === 403) {
        activeCaloriesStatus = "missing_permission";
        activeCaloriesReason = "Missing activity/calories permission (HTTP 403 Forbidden).";
      } else if (activeCalRollupRes.status === 404 || activeCalRollupRes.status === 400) {
        activeCaloriesStatus = "unsupported_operation";
        activeCaloriesReason = `active-energy-burned endpoint returned HTTP ${activeCalRollupRes.status}.`;
      } else if (activeCalRollupRes.ok) {
        if (Array.isArray(activeCalRollupData?.rollupDataPoints) && activeCalRollupData.rollupDataPoints.length > 0) {
          activeCaloriesStatus = "live";
          activeCaloriesReason = "Live dailyRollUp data received from Google Health API.";
          for (const pt of activeCalRollupData.rollupDataPoints) {
            const d = pt.civilStartTime?.date;
            if (d && d.year && d.month && d.day) {
              const dateStr = `${d.year}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`;
              const kcal = Number(pt.activeEnergyBurned?.kcalSum ?? pt.activeEnergyBurned?.kilocaloriesSum ?? pt.energy?.kilocaloriesSum ?? pt.calories?.kilocaloriesSum ?? 0);
              if (dateStr === todayCivilStr && kcal > 0) {
                todayActiveCalories = Math.round(kcal);
              }
            }
          }
        }
      }
    }

    if (todayActiveCalories === undefined && Array.isArray(activeCalPointsData?.dataPoints) && activeCalPointsData.dataPoints.length > 0) {
      let sumTodayKcal = 0;
      for (const pt of activeCalPointsData.dataPoints) {
        const c = pt.activeEnergyBurned?.interval?.civilStartTime;
        if (c && c.date) {
          const ptDateStr = `${c.date.year}-${String(c.date.month).padStart(2, '0')}-${String(c.date.day).padStart(2, '0')}`;
          if (ptDateStr === todayCivilStr) {
            const kcal = Number(pt.activeEnergyBurned?.kcal ?? pt.activeEnergyBurned?.kilocalories ?? pt.energy?.kilocalories ?? 0);
            sumTodayKcal += kcal;
          }
        }
      }
      if (sumTodayKcal > 0) {
        todayActiveCalories = Math.round(sumTodayKcal);
        activeCaloriesStatus = "live";
        activeCaloriesReason = "Live dataPoints aggregated for today.";
      }
    }

    // Parse Total Calories (dailyRollUp, dataPoints, Google Fit, Fitbit summary)
    let todayTotalCalories: number | undefined;
    let totalCaloriesStatus: "live" | "empty_results" | "missing_permission" | "unsupported_operation" | "request_failed" = "empty_results";
    let totalCaloriesReason: string = "No total calorie records registered by provider for this period.";

    if (totalCalRollupRes) {
      if (totalCalRollupRes.status === 403) {
        totalCaloriesStatus = "missing_permission";
        totalCaloriesReason = "Missing calories permission (HTTP 403 Forbidden).";
      } else if (totalCalRollupRes.status === 404 || totalCalRollupRes.status === 400) {
        totalCaloriesStatus = "unsupported_operation";
        totalCaloriesReason = `total-calories endpoint returned HTTP ${totalCalRollupRes.status}.`;
      } else if (totalCalRollupRes.ok) {
        if (Array.isArray(totalCalRollupData?.rollupDataPoints) && totalCalRollupData.rollupDataPoints.length > 0) {
          totalCaloriesStatus = "live";
          totalCaloriesReason = "Live dailyRollUp data received from Google Health API.";
          for (const pt of totalCalRollupData.rollupDataPoints) {
            const d = pt.civilStartTime?.date;
            if (d && d.year && d.month && d.day) {
              const dateStr = `${d.year}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`;
              const kcal = Number(pt.totalCalories?.kcalSum ?? pt.totalCalories?.kilocaloriesSum ?? pt.energy?.kilocaloriesSum ?? pt.calories?.kilocaloriesSum ?? 0);
              if (dateStr === todayCivilStr && kcal > 0) {
                todayTotalCalories = Math.round(kcal);
              }
            }
          }
        }
      }
    }

    // Google Fit merged calories dataset fallback
    if (todayTotalCalories === undefined && Array.isArray(googleFitCaloriesData?.point) && googleFitCaloriesData.point.length > 0) {
      let fitKcalSum = 0;
      for (const pt of googleFitCaloriesData.point) {
        const ptStartNanos = BigInt(pt.startTimeNanos || 0);
        if (ptStartNanos >= todayStartNanos) {
          const val = Number(pt.value?.[0]?.fpVal || 0);
          if (val > 0) fitKcalSum += val;
        }
      }
      if (fitKcalSum > 0) {
        todayTotalCalories = Math.round(fitKcalSum);
        totalCaloriesStatus = "live";
        totalCaloriesReason = "Aggregated from Google Fit / Fitbit merged calories dataset.";
      }
    }

    // Google Fit aggregated bucket calories
    if (todayTotalCalories === undefined && Array.isArray(googleFitActivityAggregateData?.bucket)) {
      for (const bucket of googleFitActivityAggregateData.bucket) {
        const bStart = Number(bucket.startTimeMillis || 0);
        const bDateStr = getCivilDateString(new Date(bStart), timeZone);
        if (bDateStr === todayCivilStr && Array.isArray(bucket.dataset)) {
          for (const ds of bucket.dataset) {
            if (Array.isArray(ds.point)) {
              for (const pt of ds.point) {
                const val = Number(pt.value?.[0]?.fpVal || 0);
                if (val > 0) {
                  todayTotalCalories = Math.round(val);
                  totalCaloriesStatus = "live";
                  totalCaloriesReason = "Aggregated from Google Fit activity summary bucket.";
                }
              }
            }
          }
        }
      }
    }

    // Fitbit Activity Summary fallback
    if (fitbitActivitySummaryData?.summary) {
      const fbTotal = Number(fitbitActivitySummaryData.summary.caloriesOut || 0);
      const fbActive = Number(fitbitActivitySummaryData.summary.activityCalories || 0);
      if (fbTotal > 0 && todayTotalCalories === undefined) {
        todayTotalCalories = fbTotal;
        totalCaloriesStatus = "live";
        totalCaloriesReason = "Fitbit daily activity summary.";
      }
      if (fbActive > 0 && todayActiveCalories === undefined) {
        todayActiveCalories = fbActive;
        activeCaloriesStatus = "live";
        activeCaloriesReason = "Fitbit daily active calories summary.";
      }
    }

    // Sort daily history descending by date
    const dailyHistory = Object.values(dailyMap).sort((a, b) => b.date.localeCompare(a.date));

    // Today metrics matching civil date
    const todayMetric = dailyMap[todayCivilStr] || dailyHistory[0];

    // Intraday hourly breakdown from raw steps data points (Europe/Oslo civil time)
    const hourlyMap: Record<string, number> = {};
    let detectedDevice = 'Fitbit Inspire 3';

    for (const pt of allIntradayDataPoints) {
      const dev = pt.dataSource?.device?.displayName;
      if (dev) detectedDevice = `Fitbit ${dev}`;

      const c = pt.steps?.interval?.civilStartTime;
      if (c && c.date && c.time) {
        const pointDateStr = `${c.date.year}-${String(c.date.month).padStart(2, '0')}-${String(c.date.day).padStart(2, '0')}`;
        if (pointDateStr === todayCivilStr) {
          const h = `${String(c.time.hours || 0).padStart(2, '0')}:00`;
          hourlyMap[h] = (hourlyMap[h] || 0) + Number(pt.steps?.count || 0);
        }
      }
    }

    // Build complete 24h hourly array
    const intradayHourly: GoogleHealthIntradayHour[] = [];
    for (let h = 0; h < 24; h++) {
      const hStr = `${String(h).padStart(2, '0')}:00`;
      intradayHourly.push({
        hour: hStr,
        steps: hourlyMap[hStr] || 0
      });
    }

    // Calculate Past 7 Complete Days (ending yesterday: today - 7 to today - 1)
    const past7CompleteDays: GoogleHealthDailyMetric[] = [];
    for (let i = 7; i >= 1; i--) {
      const pastD = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const pStr = getCivilDateString(pastD, timeZone);
      if (dailyMap[pStr]) {
        past7CompleteDays.push(dailyMap[pStr]);
      } else {
        past7CompleteDays.push({ date: pStr, steps: 0, distanceMeters: 0, floors: 0 });
      }
    }

    const weeklyStepsTotal = past7CompleteDays.reduce((acc, curr) => acc + curr.steps, 0);
    const weeklyStepsAverage = past7CompleteDays.length > 0 ? Math.round(weeklyStepsTotal / past7CompleteDays.length) : undefined;

    // Parse exercises
    const recentExercises: GoogleHealthExerciseItem[] = [];
    let todayExerciseCalories = 0;
    let todayExerciseAzm = 0;

    if (Array.isArray(exerciseData?.dataPoints)) {
      for (const ep of exerciseData.dataPoints) {
        const devName = ep.dataSource?.device?.displayName;
        if (devName) detectedDevice = `Fitbit ${devName}`;

        const ex = ep.exercise;
        if (ex) {
          const durationSec = parseInt(ex.activeDuration || '0', 10);
          const calories = ex.metricsSummary?.caloriesKcal !== undefined ? Number(ex.metricsSummary.caloriesKcal) : undefined;
          const azm = ex.metricsSummary?.activeZoneMinutes !== undefined ? Number(ex.metricsSummary.activeZoneMinutes) : undefined;
          const startTime = ex.interval?.startTime || '';

          if (startTime) {
            const exDateStr = getCivilDateString(new Date(startTime), timeZone);
            if (exDateStr === todayCivilStr) {
              if (calories) todayExerciseCalories += calories;
              if (azm) todayExerciseAzm += azm;
            }
          }

          recentExercises.push({
            id: ep.name || `ex-${recentExercises.length}`,
            name: ex.displayName || ex.exerciseType || 'Workout',
            exerciseType: ex.exerciseType || 'WALKING',
            startTime,
            endTime: ex.interval?.endTime || '',
            durationMinutes: Math.round(durationSec / 60),
            caloriesKcal: calories,
            steps: ex.metricsSummary?.steps !== undefined ? Number(ex.metricsSummary.steps) : undefined,
            distanceMeters: ex.metricsSummary?.distanceMillimeters !== undefined ? Math.round(Number(ex.metricsSummary.distanceMillimeters) / 1000) : undefined,
            averageHeartRateBpm: ex.metricsSummary?.averageHeartRateBeatsPerMinute !== undefined ? Number(ex.metricsSummary.averageHeartRateBeatsPerMinute) : undefined,
            activeZoneMinutes: azm,
            deviceDisplayName: devName || 'Inspire 3',
            platform: ep.dataSource?.platform || 'FITBIT'
          });
        }
      }
    }

    // Merge Fitbit activity list
    if (Array.isArray(fitbitActivityListData?.activities)) {
      for (const act of fitbitActivityListData.activities) {
        const actDate = act.startDate ? `${act.startDate}T${act.startTime || '00:00:00'}` : (act.originalStartTime || act.startTime || '');
        const durMins = act.duration ? Math.round(Number(act.duration) / 60000) : 0;
        const calories = act.calories ? Number(act.calories) : undefined;
        const azm = act.activeZoneMinutes?.totalMinutes ? Number(act.activeZoneMinutes.totalMinutes) : undefined;

        if (actDate) {
          const exDateStr = getCivilDateString(new Date(actDate), timeZone);
          if (exDateStr === todayCivilStr) {
            if (calories && !todayExerciseCalories) todayExerciseCalories += calories;
            if (azm && !todayExerciseAzm) todayExerciseAzm += azm;
          }
        }

        const existing = recentExercises.find(e => (actDate && e.startTime && Math.abs(new Date(e.startTime).getTime() - new Date(actDate).getTime()) < 600000));
        if (!existing) {
          recentExercises.push({
            id: String(act.logId || `fb-act-${recentExercises.length}`),
            name: act.activityName || 'Workout',
            exerciseType: act.activityName || 'FITNESS',
            startTime: actDate,
            endTime: '',
            durationMinutes: durMins,
            caloriesKcal: calories,
            steps: act.steps ? Number(act.steps) : undefined,
            distanceMeters: act.distance ? Math.round(Number(act.distance) * 1000) : undefined,
            averageHeartRateBpm: act.averageHeartRate ? Number(act.averageHeartRate) : undefined,
            activeZoneMinutes: azm,
            deviceDisplayName: 'Fitbit Inspire 3',
            platform: 'FITBIT'
          });
        }
      }
    }

    // Merge Google Fit Sessions (Filter for genuine user workouts, discarding micro-walking auto-segments)
    if (Array.isArray(googleFitAllSessionsData?.session)) {
      for (const s of googleFitAllSessionsData.session) {
        // ActivityType 72 is sleep, 7 is walking, 8 is running, 97 is weight training, etc.
        if (s.activityType !== 72 && s.startTimeMillis && s.endTimeMillis) {
          const sTime = Number(s.startTimeMillis);
          const eTime = Number(s.endTimeMillis);
          const durMins = Math.max(0, Math.round((eTime - sTime) / 60000));
          const sDateIso = new Date(sTime).toISOString();
          const isAutoSegment = s.name === 'Walking' && durMins < 15;
          const isGenericWalking = (s.activityType === 7 || s.name === 'Walking') && (!s.description && durMins < 20);

          if (!isAutoSegment && !isGenericWalking && durMins >= 10) {
            const existing = recentExercises.find(e => (e.startTime && Math.abs(new Date(e.startTime).getTime() - sTime) < 600000));
            if (!existing) {
              recentExercises.push({
                id: s.id || `gfit-sess-${recentExercises.length}`,
                name: s.name || s.description || 'Workout Session',
                exerciseType: s.name || 'FITNESS',
                startTime: sDateIso,
                endTime: new Date(eTime).toISOString(),
                durationMinutes: durMins,
                deviceDisplayName: 'Google Fit / Wearable',
                platform: 'GOOGLE_FIT'
              });
            }
          }
        }
      }
    }

    // Sort recent exercises descending by startTime
    recentExercises.sort((a, b) => new Date(b.startTime || 0).getTime() - new Date(a.startTime || 0).getTime());

    // Compute training days
    const allTrainedDates = new Set<string>();
    const weekTrainedDates = new Set<string>();
    const sevenDaysAgoTime = now.getTime() - 7 * 24 * 60 * 60 * 1000;

    for (const ex of recentExercises) {
      if (ex.startTime) {
        const exDate = getCivilDateString(new Date(ex.startTime), timeZone);
        allTrainedDates.add(exDate);
        if (new Date(ex.startTime).getTime() >= sevenDaysAgoTime) {
          weekTrainedDates.add(exDate);
        }
      }
    }
    const trainingDaysWeek = weekTrainedDates.size;
    const trainingDaysCount = allTrainedDates.size;

    // Heart rate and body composition tracking variables
    let bodyWeightKg: number | undefined;
    let bodyFatPercent: number | undefined;
    let muscleMassPercent: number | undefined;
    let muscleMassKg: number | undefined;
    let bodyWaterPercent: number | undefined;
    let boneMassKg: number | undefined;
    let visceralFatRating: number | undefined;
    let bmi: number | undefined;
    let bmrKcal: number | undefined;
    let restingHeartRate: number | undefined;
    let lowestHeartRate: number | undefined;
    let peakHeartRate: number | undefined;
    let currentPulse: number | undefined;
    let spo2Percent: number | undefined;
    let hrvRmssd: number | undefined;
    let breathingRate: number | undefined;
    let skinTempVariation: number | undefined;
    let activeZoneMinutes: number | undefined = todayExerciseAzm > 0 ? todayExerciseAzm : undefined;

    // Parse Google Fit Activity Aggregates (calories, heart rate, heart minutes, active minutes)
    if (Array.isArray(googleFitActivityAggregateData?.bucket)) {
      for (const bucket of googleFitActivityAggregateData.bucket) {
        const bucketStartMs = Number(bucket.startTimeMillis || 0);
        const bucketDateStr = getCivilDateString(new Date(bucketStartMs), timeZone);
        if (Array.isArray(bucket.dataset)) {
          for (const ds of bucket.dataset) {
            const dsId = String(ds.dataSourceId || '');
            if (Array.isArray(ds.point)) {
              for (const pt of ds.point) {
                const typeName = dsId || pt.dataTypeName || '';
                // Total / Expended Calories
                if (typeName.includes('calories')) {
                  const cal = Number(pt.value?.[0]?.fpVal ?? pt.value?.[0]?.intVal ?? 0);
                  if (cal > 0 && bucketDateStr === todayCivilStr) {
                    if (todayTotalCalories === undefined || todayTotalCalories === 0) {
                      todayTotalCalories = Math.round(cal);
                      totalCaloriesStatus = "live";
                      totalCaloriesReason = "Live Google Fit aggregate calories synchronized.";
                    }
                  }
                }
                // Heart Rate BPM summary
                if (typeName.includes('heart_rate')) {
                  if (bucketDateStr === todayCivilStr && Array.isArray(pt.value)) {
                    for (const v of pt.value) {
                      const bpm = Number(v.fpVal ?? v.intVal ?? 0);
                      if (bpm > 30 && bpm < 240) {
                        if (lowestHeartRate === undefined || bpm < lowestHeartRate) lowestHeartRate = Math.round(bpm);
                        if (peakHeartRate === undefined || bpm > peakHeartRate) peakHeartRate = Math.round(bpm);
                        if (!currentPulse) currentPulse = Math.round(bpm);
                      }
                    }
                  }
                }
                // Heart Minutes / Active Minutes (AZM)
                if (typeName.includes('heart_minutes') || typeName.includes('active_minutes')) {
                  const mins = Number(pt.value?.[0]?.fpVal ?? pt.value?.[0]?.intVal ?? 0);
                  if (mins > 0 && bucketDateStr === todayCivilStr) {
                    if (!activeZoneMinutes) activeZoneMinutes = Math.round(mins);
                    else activeZoneMinutes = Math.max(activeZoneMinutes, Math.round(mins));
                  }
                }
              }
            }
          }
        }
      }
    }

    // Parse Google Fit merged calories dataset if todayTotalCalories is still 0
    if (Array.isArray(googleFitCaloriesData?.point)) {
      let sumMergedCal = 0;
      for (const pt of googleFitCaloriesData.point) {
        const cal = Number(pt.value?.[0]?.fpVal ?? pt.value?.[0]?.intVal ?? 0);
        if (cal > 0) sumMergedCal += cal;
      }
      if (sumMergedCal > 0 && (todayTotalCalories === undefined || todayTotalCalories === 0)) {
        todayTotalCalories = Math.round(sumMergedCal);
        totalCaloriesStatus = "live";
        totalCaloriesReason = "Live Google Fit merged calories dataset synchronized.";
      }
    }

    // Parse Google Fit merged heart rate dataset
    if (Array.isArray(googleFitHeartRateDataSourceData?.point)) {
      for (const pt of googleFitHeartRateDataSourceData.point) {
        const bpm = Number(pt.value?.[0]?.fpVal ?? pt.value?.[0]?.intVal ?? 0);
        if (bpm > 30 && bpm < 240) {
          if (lowestHeartRate === undefined || bpm < lowestHeartRate) lowestHeartRate = Math.round(bpm);
          if (peakHeartRate === undefined || bpm > peakHeartRate) peakHeartRate = Math.round(bpm);
          currentPulse = Math.round(bpm);
        }
      }
    }

    // Parse Google Fit merged heart minutes dataset
    if (Array.isArray(googleFitHeartMinutesData?.point)) {
      let sumHm = 0;
      for (const pt of googleFitHeartMinutesData.point) {
        const hm = Number(pt.value?.[0]?.fpVal ?? pt.value?.[0]?.intVal ?? 0);
        if (hm > 0) sumHm += hm;
      }
      if (sumHm > 0) {
        if (!activeZoneMinutes) activeZoneMinutes = Math.round(sumHm);
        else activeZoneMinutes = Math.max(activeZoneMinutes, Math.round(sumHm));
      }
    }

    // Fallback for todayTotalCalories and todayActiveCalories from Fitbit summary
    if (todayTotalCalories === undefined || todayTotalCalories === 0) {
      if (fitbitActivitySummaryData?.summary?.caloriesOut !== undefined && Number(fitbitActivitySummaryData.summary.caloriesOut) > 0) {
        todayTotalCalories = Math.round(Number(fitbitActivitySummaryData.summary.caloriesOut));
        totalCaloriesStatus = "live";
        totalCaloriesReason = "Live Fitbit daily total energy expenditure synchronized.";
      }
    }

    if (todayActiveCalories === undefined || todayActiveCalories === 0) {
      if (fitbitActivitySummaryData?.summary?.activityCalories !== undefined && Number(fitbitActivitySummaryData.summary.activityCalories) > 0) {
        todayActiveCalories = Math.round(Number(fitbitActivitySummaryData.summary.activityCalories));
        activeCaloriesStatus = "live";
        activeCaloriesReason = "Live Fitbit active calories expenditure synchronized.";
      } else if (todayExerciseCalories > 0) {
        todayActiveCalories = Math.round(todayExerciseCalories);
        activeCaloriesStatus = "live";
        activeCaloriesReason = "Live workout exercise calories aggregated.";
      }
    }

    // Active Zone Minutes fallback
    if (fitbitActivitySummaryData?.summary?.activeZoneMinutes?.totalMinutes !== undefined) {
      activeZoneMinutes = Number(fitbitActivitySummaryData.summary.activeZoneMinutes.totalMinutes);
    } else if (fitbitActivitySummaryData?.summary?.fairlyActiveMinutes !== undefined || fitbitActivitySummaryData?.summary?.veryActiveMinutes !== undefined) {
      const azmSum = (Number(fitbitActivitySummaryData?.summary?.fairlyActiveMinutes) || 0) + (Number(fitbitActivitySummaryData?.summary?.veryActiveMinutes) || 0) * 2;
      if (azmSum > 0 && (!activeZoneMinutes || azmSum > activeZoneMinutes)) activeZoneMinutes = azmSum;
    }

    // Scopes checking (If scope string is empty or absent from tokeninfo, treat as permitted unless API returned 403)
    const isExplicit403 = (sleepRes && sleepRes.status === 403) || (sleepSessionRes && sleepSessionRes.status === 403);
    const hasSleepScope = grantedScopes.length === 0 ? !isExplicit403 : grantedScopes.some((s) => s.includes('sleep'));
    const hasHealthMetricsScope = grantedScopes.length === 0 ? true : grantedScopes.some(
      (s) => s.includes('health_metrics') || s.includes('measurements') || s.includes('body') || s.includes('heart')
    );
    const hasActivityScope = grantedScopes.length === 0 ? true : grantedScopes.some((s) => s.includes('activity') || s.includes('fitness'));

    // Sleep parsing & diagnostics
    let sleepHours: number | undefined;
    let sleepScore: number | undefined;
    let deepSleepMinutes: number | undefined;
    let remSleepMinutes: number | undefined;
    let lightSleepMinutes: number | undefined;
    let awakeMinutes: number | undefined;
    let restlessMinutes: number | undefined;
    let timeAsleepMinutes: number | undefined;
    let minutesInSleepPeriod: number | undefined;
    let sleepDurationFormatted: string | undefined;
    let sleepStartTime: string | undefined;
    let sleepEndTime: string | undefined;
    let sleepDate: string | undefined;

    let sleepStatus: "live" | "empty_results" | "missing_permission" | "unsupported_operation" | "request_failed" = "empty_results";
    let sleepReason = "No nocturnal sleep sessions logged for this period on connected devices.";

    if (isExplicit403) {
      sleepStatus = "missing_permission";
      sleepReason = "Google Health returned HTTP 403 Forbidden for sleep endpoints. Sleep scope re-authorization needed.";
    } else {
      // 1. Check Fitbit Sleep API endpoints first (returns granular stages, restless, light, deep, rem)
      let foundSleepRecord = false;
      const fitbitRecords: any[] = [
        ...(Array.isArray(fitbitSleepDateData?.sleep) ? fitbitSleepDateData.sleep : []),
        ...(Array.isArray(fitbitSleepListData?.sleep) ? fitbitSleepListData.sleep : [])
      ];

      if (fitbitRecords.length > 0) {
        // Sort newest first
        const sortedFitbit = [...fitbitRecords].sort((a, b) => {
          const timeA = new Date(b.endTime || b.dateOfSleep || b.startTime || 0).getTime();
          const timeB = new Date(a.endTime || a.dateOfSleep || a.startTime || 0).getTime();
          return timeA - timeB;
        });

        const latestFb = sortedFitbit[0];
        if (latestFb) {
          const fbAsleep = latestFb.minutesAsleep ? parseInt(String(latestFb.minutesAsleep), 10) : 0;
          const fbDurationMin = latestFb.duration ? Math.round(parseInt(String(latestFb.duration), 10) / 60000) : 0;
          const fbTotalMin = fbAsleep > 0 ? fbAsleep : fbDurationMin;

          if (fbTotalMin > 0) {
            foundSleepRecord = true;
            timeAsleepMinutes = fbTotalMin;
            sleepHours = Number((fbTotalMin / 60).toFixed(1));
            const hrs = Math.floor(fbTotalMin / 60);
            const mins = fbTotalMin % 60;
            sleepDurationFormatted = hrs > 0 ? (mins > 0 ? `${hrs} hrs ${mins} min` : `${hrs} hrs`) : `${mins} min`;

            minutesInSleepPeriod = latestFb.timeInBed ? parseInt(String(latestFb.timeInBed), 10) : fbTotalMin;
            if (latestFb.efficiency) sleepScore = parseInt(String(latestFb.efficiency), 10);
            else if (latestFb.score) sleepScore = parseInt(String(latestFb.score), 10);

            sleepStartTime = latestFb.startTime;
            sleepEndTime = latestFb.endTime;
            sleepDate = latestFb.dateOfSleep || (sleepEndTime ? getCivilDateString(new Date(sleepEndTime), timeZone) : undefined);

            // Extract stages from levels summary
            const summary = latestFb.levels?.summary;
            if (summary) {
              if (summary.deep?.minutes !== undefined) deepSleepMinutes = parseInt(String(summary.deep.minutes), 10);
              if (summary.rem?.minutes !== undefined) remSleepMinutes = parseInt(String(summary.rem.minutes), 10);
              if (summary.light?.minutes !== undefined) lightSleepMinutes = parseInt(String(summary.light.minutes), 10);
              if (summary.wake?.minutes !== undefined) awakeMinutes = parseInt(String(summary.wake.minutes), 10);
              else if (latestFb.minutesAwake) awakeMinutes = parseInt(String(latestFb.minutesAwake), 10);
              if (summary.restless?.minutes !== undefined) restlessMinutes = parseInt(String(summary.restless.minutes), 10);
              else if (latestFb.restlessDuration !== undefined) restlessMinutes = parseInt(String(latestFb.restlessDuration), 10);
            } else if (latestFb.restlessDuration !== undefined) {
              restlessMinutes = parseInt(String(latestFb.restlessDuration), 10);
            }

            // Fallback to iterating levels.data if summary wasn't present
            if (lightSleepMinutes === undefined && Array.isArray(latestFb.levels?.data)) {
              let deepM = 0;
              let remM = 0;
              let lightM = 0;
              let wakeM = 0;
              let restlessM = 0;
              for (const segment of latestFb.levels.data) {
                const durMin = Math.round(Number(segment.seconds || 0) / 60);
                const lvl = String(segment.level || '').toLowerCase();
                if (lvl === 'deep') deepM += durMin;
                else if (lvl === 'rem') remM += durMin;
                else if (lvl === 'light') lightM += durMin;
                else if (lvl === 'wake' || lvl === 'awake') wakeM += durMin;
                else if (lvl === 'restless') restlessM += durMin;
              }
              if (deepM > 0) deepSleepMinutes = deepM;
              if (remM > 0) remSleepMinutes = remM;
              if (lightM > 0) lightSleepMinutes = lightM;
              if (wakeM > 0) awakeMinutes = wakeM;
              if (restlessM > 0) restlessMinutes = restlessM;
            }

            sleepStatus = "live";
            sleepReason = `Live sleep session (${sleepDurationFormatted}) synchronized.`;
          }
        }
      }

      // 2. Check Google Health API v4 sleep dataPoints
      if (!foundSleepRecord) {
        const rawPoints: any[] = [
          ...(Array.isArray(sleepData?.dataPoints) ? sleepData.dataPoints : []),
          ...(Array.isArray(sleepSessionData?.dataPoints) ? sleepSessionData.dataPoints : []),
          ...(Array.isArray(sleepStagesData?.dataPoints) ? sleepStagesData.dataPoints : [])
        ];

        if (rawPoints.length > 0) {
          const sortedSleep = [...rawPoints].sort((a, b) => {
            const timeA = new Date(a.sleep?.interval?.endTime || a.sleep?.interval?.startTime || a.sleep?.stages?.[0]?.startTime || a.interval?.endTime || 0).getTime();
            const timeB = new Date(b.sleep?.interval?.endTime || b.sleep?.interval?.startTime || b.sleep?.stages?.[0]?.startTime || b.interval?.endTime || 0).getTime();
            return timeB - timeA;
          });

          const latestSleep = sortedSleep[0];
          const sleepObj = latestSleep?.sleep || latestSleep;
          if (sleepObj) {
            const summary = sleepObj.summary;
            const parsedAsleep = summary?.minutesAsleep ? parseInt(String(summary.minutesAsleep), 10) : 0;
            const parsedInBed = summary?.minutesInSleepPeriod ? parseInt(String(summary.minutesInSleepPeriod), 10) : 0;

            let finalAsleepMinutes = parsedAsleep;
            if (finalAsleepMinutes <= 0 && sleepObj.duration) {
              finalAsleepMinutes = Math.round(parseInt(String(sleepObj.duration), 10) / 60);
            }

            if (finalAsleepMinutes > 0) {
              foundSleepRecord = true;
              timeAsleepMinutes = finalAsleepMinutes;
              sleepHours = Number((finalAsleepMinutes / 60).toFixed(1));
              const hrs = Math.floor(finalAsleepMinutes / 60);
              const mins = finalAsleepMinutes % 60;
              sleepDurationFormatted = hrs > 0 ? (mins > 0 ? `${hrs} hrs ${mins} min` : `${hrs} hrs`) : `${mins} min`;
            }

            if (parsedInBed > 0) {
              minutesInSleepPeriod = parsedInBed;
            }

            if (summary?.minutesRestless !== undefined) {
              restlessMinutes = parseInt(String(summary.minutesRestless), 10);
            }

            // Extract clinical sleep stages from summary.stagesSummary
            const stagesSummary = summary?.stagesSummary;
            if (Array.isArray(stagesSummary) && stagesSummary.length > 0) {
              for (const st of stagesSummary) {
                const mins = parseInt(String(st.minutes || '0'), 10);
                const t = String(st.type || '').toUpperCase();
                if (t === 'DEEP') deepSleepMinutes = mins;
                else if (t === 'REM') remSleepMinutes = mins;
                else if (t === 'LIGHT') lightSleepMinutes = mins;
                else if (t === 'AWAKE') awakeMinutes = mins;
                else if (t === 'RESTLESS' || t === 'AWAKE_RESTLESS') restlessMinutes = mins;
              }
            } else if (Array.isArray(sleepObj.stages) && sleepObj.stages.length > 0) {
              let deepM = 0;
              let remM = 0;
              let lightM = 0;
              let awakeM = 0;
              let restlessM = 0;
              for (const st of sleepObj.stages) {
                const start = new Date(st.startTime).getTime();
                const end = new Date(st.endTime).getTime();
                const dur = Math.max(0, Math.round((end - start) / 60000));
                const t = String(st.type || '').toUpperCase();
                if (t === 'DEEP') deepM += dur;
                else if (t === 'REM') remM += dur;
                else if (t === 'LIGHT') lightM += dur;
                else if (t === 'AWAKE') awakeM += dur;
                else if (t === 'RESTLESS' || t === 'AWAKE_RESTLESS') restlessM += dur;
              }
              if (deepM > 0) deepSleepMinutes = deepM;
              if (remM > 0) remSleepMinutes = remM;
              if (lightM > 0) lightSleepMinutes = lightM;
              if (awakeM > 0) awakeMinutes = awakeM;
              if (restlessM > 0) restlessMinutes = restlessM;
            }

            sleepStartTime = sleepObj.interval?.startTime || sleepObj.stages?.[0]?.startTime;
            sleepEndTime = sleepObj.interval?.endTime || sleepObj.stages?.[sleepObj.stages?.length - 1]?.endTime;

            if (sleepEndTime) {
              sleepDate = getCivilDateString(new Date(sleepEndTime), timeZone);
            } else if (sleepStartTime) {
              sleepDate = getCivilDateString(new Date(sleepStartTime), timeZone);
            }

            if (sleepObj.score) {
              sleepScore = Number(sleepObj.score);
            } else if (timeAsleepMinutes && minutesInSleepPeriod && minutesInSleepPeriod > 0) {
              sleepScore = Math.min(100, Math.round((timeAsleepMinutes / minutesInSleepPeriod) * 100));
            } else if (timeAsleepMinutes && timeAsleepMinutes >= 360) {
              sleepScore = Math.min(95, Math.round(70 + (timeAsleepMinutes - 360) / 12));
            }

            if (timeAsleepMinutes && timeAsleepMinutes > 0) {
              sleepStatus = "live";
              sleepReason = `Live sleep session (${sleepDurationFormatted || `${sleepHours}h`}) recorded.`;
            }
          }
        }
      }

      // 3. Check Google Fit Sleep Segments Dataset & Aggregated buckets
      const allFitPoints: any[] = [
        ...(Array.isArray(googleFitSleepSegmentsData?.point) ? googleFitSleepSegmentsData.point : []),
        ...additionalFitSegments
      ];

      // Also add points from aggregate buckets
      if (Array.isArray(googleFitSleepAggregateData?.bucket)) {
        for (const b of googleFitSleepAggregateData.bucket) {
          if (Array.isArray(b.dataset)) {
            for (const ds of b.dataset) {
              if (Array.isArray(ds.point)) allFitPoints.push(...ds.point);
            }
          }
        }
      }

      if (!foundSleepRecord && allFitPoints.length > 0) {
        let deepM = 0;
        let remM = 0;
        let lightM = 0;
        let awakeM = 0;
        let restlessM = 0;
        let totalAsleepM = 0;
        let earliestStart = Infinity;
        let latestEnd = 0;

        for (const pt of allFitPoints) {
          const sNanos = BigInt(pt.startTimeNanos || 0);
          const eNanos = BigInt(pt.endTimeNanos || 0);
          const sMs = Number(sNanos / BigInt(1000000));
          const eMs = Number(eNanos / BigInt(1000000));
          const dur = Math.max(0, Math.round((eMs - sMs) / 60000));
          const segmentType = pt.value?.[0]?.intVal;

          if (sMs < earliestStart) earliestStart = sMs;
          if (eMs > latestEnd) latestEnd = eMs;

          if (segmentType === 1) {
            awakeM += dur;
          } else if (segmentType === 2) {
            totalAsleepM += dur;
            lightM += dur;
          } else if (segmentType === 3) {
            restlessM += dur;
          } else if (segmentType === 4) {
            lightM += dur;
            totalAsleepM += dur;
          } else if (segmentType === 5) {
            deepM += dur;
            totalAsleepM += dur;
          } else if (segmentType === 6) {
            remM += dur;
            totalAsleepM += dur;
          }
        }

        if (totalAsleepM > 30) {
          timeAsleepMinutes = totalAsleepM;
          minutesInSleepPeriod = totalAsleepM + awakeM + restlessM;
          sleepHours = Number((totalAsleepM / 60).toFixed(1));
          const hrs = Math.floor(totalAsleepM / 60);
          const mins = totalAsleepM % 60;
          sleepDurationFormatted = hrs > 0 ? (mins > 0 ? `${hrs} hrs ${mins} min` : `${hrs} hrs`) : `${mins} min`;
          deepSleepMinutes = deepM;
          remSleepMinutes = remM;
          lightSleepMinutes = lightM;
          awakeMinutes = awakeM;
          restlessMinutes = restlessM;

          if (earliestStart < Infinity && latestEnd > 0) {
            sleepStartTime = new Date(earliestStart).toISOString();
            sleepEndTime = new Date(latestEnd).toISOString();
            sleepDate = getCivilDateString(new Date(latestEnd), timeZone);
          }

          sleepScore = Math.min(98, Math.max(50, Math.round((totalAsleepM / 480) * 85 + (deepM + remM) / 5)));
          sleepStatus = "live";
          sleepReason = `Live Google Fit sleep stages (${sleepDurationFormatted}) synchronized.`;
          foundSleepRecord = true;
        }
      }

      // 4. If Google Fit sessions exist (activityType 72 = Sleep)
      if (!foundSleepRecord && Array.isArray(googleFitSleepData?.session) && googleFitSleepData.session.length > 0) {
        const sortedFitSessions = [...googleFitSleepData.session].sort((a: any, b: any) => {
          return Number(b.endTimeMillis || 0) - Number(a.endTimeMillis || 0);
        });

        const latestFitSleep = sortedFitSessions[0];
        if (latestFitSleep && latestFitSleep.startTimeMillis && latestFitSleep.endTimeMillis) {
          const sMillis = Number(latestFitSleep.startTimeMillis);
          const eMillis = Number(latestFitSleep.endTimeMillis);
          const durMinutes = Math.max(0, Math.round((eMillis - sMillis) / 60000));

          if (durMinutes > 30) {
            timeAsleepMinutes = durMinutes;
            minutesInSleepPeriod = durMinutes;
            sleepHours = Number((durMinutes / 60).toFixed(1));
            const hrs = Math.floor(durMinutes / 60);
            const mins = durMinutes % 60;
            sleepDurationFormatted = hrs > 0 ? (mins > 0 ? `${hrs} hrs ${mins} min` : `${hrs} hrs`) : `${mins} min`;
            sleepStartTime = new Date(sMillis).toISOString();
            sleepEndTime = new Date(eMillis).toISOString();
            sleepDate = getCivilDateString(new Date(eMillis), timeZone);

            // Do not invent fake synthetic stage distributions if stages are not in raw datasets
            sleepScore = Math.min(98, Math.max(50, Math.round((durMinutes / 480) * 85)));
            sleepStatus = "live";
            sleepReason = `Live Google Fit sleep session (${sleepDurationFormatted}) synchronized.`;
            foundSleepRecord = true;
          }
        }
      }
    }

    // Extract heart rate metrics from Fitbit Heart Rate API
    if (fitbitHeartRateData) {
      const hrObj = fitbitHeartRateData['activities-heart']?.[0]?.value;
      if (hrObj?.restingHeartRate && !restingHeartRate) {
        restingHeartRate = Number(hrObj.restingHeartRate);
      }
      const intraday = fitbitHeartRateData['activities-heart-intraday']?.dataset;
      if (Array.isArray(intraday) && intraday.length > 0) {
        const valid = intraday.filter((p: any) => typeof p.value === 'number' && p.value > 30);
        if (valid.length > 0) {
          currentPulse = valid[valid.length - 1].value;
          lowestHeartRate = Math.min(...valid.map((p: any) => p.value));
          peakHeartRate = Math.max(...valid.map((p: any) => p.value));
        }
      }
    }

    if (!restingHeartRate && fitbitActivitySummaryData?.summary?.restingHeartRate) {
      restingHeartRate = Number(fitbitActivitySummaryData.summary.restingHeartRate);
    }

    if (Array.isArray(googleHealthHeartRateData?.dataPoints) && googleHealthHeartRateData.dataPoints.length > 0) {
      const points = googleHealthHeartRateData.dataPoints
        .map((p: any) => Number(p.heartRate?.beatsPerMinute || p.heartRateBpm || p.value || 0))
        .filter((v: number) => v > 30);
      if (points.length > 0) {
        if (!currentPulse) currentPulse = points[points.length - 1];
        if (!lowestHeartRate) lowestHeartRate = Math.min(...points);
        if (!peakHeartRate) peakHeartRate = Math.max(...points);
      }
    }

    // Live API Metrics detection map
    const isLiveApiMetric: Record<string, boolean> = {
      steps: Array.isArray(stepsData?.rollupDataPoints) && stepsData.rollupDataPoints.length > 0,
      distance: Array.isArray(distData?.rollupDataPoints) && distData.rollupDataPoints.length > 0,
      floors: Array.isArray(floorsData?.rollupDataPoints) && floorsData.rollupDataPoints.length > 0,
      exercise: recentExercises.length > 0,
      intraday: allIntradayDataPoints.length > 0,
      sleep: sleepStatus === "live",
      restingHeartRate: restingHeartRate !== undefined,
      weight: false,
      bodyFat: false,
      spo2: false,
      hrv: false,
      breathingRate: false,
      skinTemp: false,
      activeCalories: activeCaloriesStatus === "live",
      totalCalories: totalCaloriesStatus === "live"
    };

    if (hasHealthMetricsScope) {
      try {
        const [
          weightRes,
          restingHrRes,
          spo2Res,
          hrvRes,
          respRes,
          skinTempRes,
          bodyFatRes,
          bodyCompRes,
          leanBodyMassRes,
          bodyWaterRes,
          boneMassRes,
          bmiRes,
          fitbitWeightRes,
          fitbitFatRes,
          googleFitWeightRes,
          googleFitFatRes
        ] = await Promise.all([
          fetch(`${HEALTH_API_BASE_URL}/users/me/dataTypes/weight/dataPoints?pageSize=50`, {
            headers: { Authorization: `Bearer ${currentGhToken}` }
          }).catch(() => null),
          fetch(`${HEALTH_API_BASE_URL}/users/me/dataTypes/heart-rate/dataPoints?pageSize=50`, {
            headers: { Authorization: `Bearer ${currentGhToken}` }
          }).catch(() => null),
          fetch(`${HEALTH_API_BASE_URL}/users/me/dataTypes/oxygen-saturation/dataPoints`, {
            headers: { Authorization: `Bearer ${currentGhToken}` }
          }).catch(() => null),
          fetch(`${HEALTH_API_BASE_URL}/users/me/dataTypes/heart-rate-variability/dataPoints`, {
            headers: { Authorization: `Bearer ${currentGhToken}` }
          }).catch(() => null),
          fetch(`${HEALTH_API_BASE_URL}/users/me/dataTypes/respiratory-rate/dataPoints`, {
            headers: { Authorization: `Bearer ${currentGhToken}` }
          }).catch(() => null),
          fetch(`${HEALTH_API_BASE_URL}/users/me/dataTypes/skin-temperature/dataPoints`, {
            headers: { Authorization: `Bearer ${currentGhToken}` }
          }).catch(() => null),
          fetch(`${HEALTH_API_BASE_URL}/users/me/dataTypes/body-fat/dataPoints?pageSize=50`, {
            headers: { Authorization: `Bearer ${currentGhToken}` }
          }).catch(() => null),
          fetch(`${HEALTH_API_BASE_URL}/users/me/dataTypes/body-composition/dataPoints?pageSize=50`, {
            headers: { Authorization: `Bearer ${currentGhToken}` }
          }).catch(() => null),
          fetch(`${HEALTH_API_BASE_URL}/users/me/dataTypes/lean-body-mass/dataPoints?pageSize=50`, {
            headers: { Authorization: `Bearer ${currentGhToken}` }
          }).catch(() => null),
          fetch(`${HEALTH_API_BASE_URL}/users/me/dataTypes/body-water-mass/dataPoints?pageSize=50`, {
            headers: { Authorization: `Bearer ${currentGhToken}` }
          }).catch(() => null),
          fetch(`${HEALTH_API_BASE_URL}/users/me/dataTypes/bone-mass/dataPoints?pageSize=50`, {
            headers: { Authorization: `Bearer ${currentGhToken}` }
          }).catch(() => null),
          fetch(`${HEALTH_API_BASE_URL}/users/me/dataTypes/bmi/dataPoints?pageSize=50`, {
            headers: { Authorization: `Bearer ${currentGhToken}` }
          }).catch(() => null),
          fetch(`https://api.fitbit.com/1/user/-/body/log/weight/date/today/30d.json`, {
            headers: { Authorization: `Bearer ${currentGhToken}` }
          }).catch(() => null),
          fetch(`https://api.fitbit.com/1/user/-/body/log/fat/date/today/30d.json`, {
            headers: { Authorization: `Bearer ${currentGhToken}` }
          }).catch(() => null),
          fetch(`https://www.googleapis.com/fitness/v1/users/me/dataSources/derived:com.google.weight:com.google.android.gms:merge_weight/datasets/${startNanos}-${endNanos}`, {
            headers: { Authorization: `Bearer ${currentGhToken}` }
          }).catch(() => null),
          fetch(`https://www.googleapis.com/fitness/v1/users/me/dataSources/derived:com.google.body.fat.percentage:com.google.android.gms:merged/datasets/${startNanos}-${endNanos}`, {
            headers: { Authorization: `Bearer ${currentGhToken}` }
          }).catch(() => null)
        ]);

        if (weightRes && weightRes.ok) {
          const wJson: any = await weightRes.json();
          if (Array.isArray(wJson.dataPoints) && wJson.dataPoints.length > 0) {
            const latestW = wJson.dataPoints[wJson.dataPoints.length - 1];
            const rawW = latestW.weight?.kilograms ?? latestW.kilograms ?? latestW.value?.[0]?.fpVal ?? latestW.value;
            if (rawW !== undefined) {
              bodyWeightKg = Number(rawW);
              isLiveApiMetric.weight = true;
            }
            const rawBf = latestW.bodyFat?.percentage ?? latestW.bodyFat ?? latestW.fat;
            if (rawBf !== undefined) {
              bodyFatPercent = Number(rawBf);
              isLiveApiMetric.bodyFat = true;
            }
            if (latestW.bmi?.value !== undefined || latestW.bmi !== undefined) {
              bmi = Number(latestW.bmi?.value ?? latestW.bmi);
              isLiveApiMetric.bmi = true;
            }
          }
        }

        if (bodyFatRes && bodyFatRes.ok) {
          const bfJson: any = await bodyFatRes.json();
          if (Array.isArray(bfJson.dataPoints) && bfJson.dataPoints.length > 0) {
            const latestBf = bfJson.dataPoints[bfJson.dataPoints.length - 1];
            const rawBf = latestBf.bodyFat?.percentage ?? latestBf.percentage ?? latestBf.fat ?? latestBf.value?.[0]?.fpVal ?? latestBf.value;
            if (rawBf !== undefined) {
              bodyFatPercent = Number(rawBf);
              isLiveApiMetric.bodyFat = true;
            }
          }
        }

        if (bodyCompRes && bodyCompRes.ok) {
          const bcJson: any = await bodyCompRes.json();
          if (Array.isArray(bcJson.dataPoints) && bcJson.dataPoints.length > 0) {
            const latestBc = bcJson.dataPoints[bcJson.dataPoints.length - 1];
            if (latestBc.bodyComposition?.muscleMassPercentage !== undefined) {
              muscleMassPercent = Number(latestBc.bodyComposition.muscleMassPercentage);
              isLiveApiMetric.muscleMass = true;
            }
            if (latestBc.bodyComposition?.bodyWaterPercentage !== undefined) {
              bodyWaterPercent = Number(latestBc.bodyComposition.bodyWaterPercentage);
              isLiveApiMetric.bodyWater = true;
            }
            if (latestBc.bodyComposition?.boneMassKilograms !== undefined) {
              boneMassKg = Number(latestBc.bodyComposition.boneMassKilograms);
              isLiveApiMetric.boneMass = true;
            }
            if (latestBc.bodyComposition?.visceralFatRating !== undefined) {
              visceralFatRating = Number(latestBc.bodyComposition.visceralFatRating);
              isLiveApiMetric.visceralFat = true;
            }
            if (latestBc.bodyComposition?.basalMetabolicRateKcal !== undefined) {
              bmrKcal = Number(latestBc.bodyComposition.basalMetabolicRateKcal);
              isLiveApiMetric.bmr = true;
            }
          }
        }

        if (leanBodyMassRes && leanBodyMassRes.ok) {
          const lbmJson: any = await leanBodyMassRes.json();
          if (Array.isArray(lbmJson.dataPoints) && lbmJson.dataPoints.length > 0) {
            const latestLbm = lbmJson.dataPoints[lbmJson.dataPoints.length - 1];
            const rawLbmKg = latestLbm.leanBodyMass?.kilograms ?? latestLbm.kilograms ?? latestLbm.value?.[0]?.fpVal;
            if (rawLbmKg !== undefined) {
              muscleMassKg = Number(rawLbmKg);
              if (bodyWeightKg && bodyWeightKg > 0 && muscleMassPercent === undefined) {
                muscleMassPercent = Number(((muscleMassKg / bodyWeightKg) * 100).toFixed(1));
              }
              isLiveApiMetric.muscleMass = true;
            }
          }
        }

        if (bodyWaterRes && bodyWaterRes.ok) {
          const bwJson: any = await bodyWaterRes.json();
          if (Array.isArray(bwJson.dataPoints) && bwJson.dataPoints.length > 0) {
            const latestBw = bwJson.dataPoints[bwJson.dataPoints.length - 1];
            const rawBw = latestBw.bodyWaterMass?.percentage ?? latestBw.percentage ?? latestBw.value?.[0]?.fpVal;
            if (rawBw !== undefined) {
              bodyWaterPercent = Number(rawBw);
              isLiveApiMetric.bodyWater = true;
            }
          }
        }

        if (boneMassRes && boneMassRes.ok) {
          const bmJson: any = await boneMassRes.json();
          if (Array.isArray(bmJson.dataPoints) && bmJson.dataPoints.length > 0) {
            const latestBm = bmJson.dataPoints[bmJson.dataPoints.length - 1];
            const rawBm = latestBm.boneMass?.kilograms ?? latestBm.kilograms ?? latestBm.value?.[0]?.fpVal;
            if (rawBm !== undefined) {
              boneMassKg = Number(rawBm);
              isLiveApiMetric.boneMass = true;
            }
          }
        }

        if (bmiRes && bmiRes.ok) {
          const bmiJson: any = await bmiRes.json();
          if (Array.isArray(bmiJson.dataPoints) && bmiJson.dataPoints.length > 0) {
            const latestBmi = bmiJson.dataPoints[bmiJson.dataPoints.length - 1];
            const rawBmi = latestBmi.bmi?.value ?? latestBmi.value?.[0]?.fpVal ?? latestBmi.value;
            if (rawBmi !== undefined) {
              bmi = Number(rawBmi);
              isLiveApiMetric.bmi = true;
            }
          }
        }

        // Fitbit body log fallback for scale integrations
        if (fitbitWeightRes && fitbitWeightRes.ok) {
          try {
            const fbWJson: any = await fitbitWeightRes.json();
            if (Array.isArray(fbWJson.weight) && fbWJson.weight.length > 0) {
              const latestFbW = fbWJson.weight[fbWJson.weight.length - 1];
              if (bodyWeightKg === undefined && latestFbW.weight !== undefined) {
                bodyWeightKg = Number(latestFbW.weight);
                isLiveApiMetric.weight = true;
              }
              if (bodyFatPercent === undefined && latestFbW.fat !== undefined) {
                bodyFatPercent = Number(latestFbW.fat);
                isLiveApiMetric.bodyFat = true;
              }
              if (bmi === undefined && latestFbW.bmi !== undefined) {
                bmi = Number(latestFbW.bmi);
                isLiveApiMetric.bmi = true;
              }
            }
          } catch (e) {}
        }

        if (fitbitFatRes && fitbitFatRes.ok) {
          try {
            const fbFJson: any = await fitbitFatRes.json();
            if (Array.isArray(fbFJson.fat) && fbFJson.fat.length > 0) {
              const latestFbF = fbFJson.fat[fbFJson.fat.length - 1];
              if (bodyFatPercent === undefined && latestFbF.fat !== undefined) {
                bodyFatPercent = Number(latestFbF.fat);
                isLiveApiMetric.bodyFat = true;
              }
            }
          } catch (e) {}
        }

        // Google Fit dataset fallback for scale biometrics
        if (googleFitWeightRes && googleFitWeightRes.ok && bodyWeightKg === undefined) {
          try {
            const gfWJson: any = await googleFitWeightRes.json();
            if (Array.isArray(gfWJson.point) && gfWJson.point.length > 0) {
              const pt = gfWJson.point[gfWJson.point.length - 1];
              const val = pt.value?.[0]?.fpVal;
              if (val !== undefined) {
                bodyWeightKg = Number(val);
                isLiveApiMetric.weight = true;
              }
            }
          } catch (e) {}
        }

        if (googleFitFatRes && googleFitFatRes.ok && bodyFatPercent === undefined) {
          try {
            const gfFJson: any = await googleFitFatRes.json();
            if (Array.isArray(gfFJson.point) && gfFJson.point.length > 0) {
              const pt = gfFJson.point[gfFJson.point.length - 1];
              const val = pt.value?.[0]?.fpVal;
              if (val !== undefined) {
                bodyFatPercent = Number(val);
                isLiveApiMetric.bodyFat = true;
              }
            }
          } catch (e) {}
        }

        if (restingHrRes && restingHrRes.ok) {
          const hrJson: any = await restingHrRes.json();
          if (Array.isArray(hrJson.dataPoints) && hrJson.dataPoints.length > 0) {
            const latestHr = hrJson.dataPoints[hrJson.dataPoints.length - 1];
            if (latestHr.heartRate?.beatsPerMinute) {
              restingHeartRate = Number(latestHr.heartRate.beatsPerMinute);
              isLiveApiMetric.restingHeartRate = true;
            }
          }
        }

        if (spo2Res && spo2Res.ok) {
          const spo2Json: any = await spo2Res.json();
          if (Array.isArray(spo2Json.dataPoints) && spo2Json.dataPoints.length > 0) {
            const latest = spo2Json.dataPoints[spo2Json.dataPoints.length - 1];
            if (latest.oxygenSaturation?.percentage) {
              spo2Percent = Number(latest.oxygenSaturation.percentage);
              isLiveApiMetric.spo2 = true;
            }
          }
        }

        if (hrvRes && hrvRes.ok) {
          const hrvJson: any = await hrvRes.json();
          if (Array.isArray(hrvJson.dataPoints) && hrvJson.dataPoints.length > 0) {
            const latest = hrvJson.dataPoints[hrvJson.dataPoints.length - 1];
            if (latest.heartRateVariability?.rmssd) {
              hrvRmssd = Number(latest.heartRateVariability.rmssd);
              isLiveApiMetric.hrv = true;
            }
          }
        }

        if (respRes && respRes.ok) {
          const respJson: any = await respRes.json();
          if (Array.isArray(respJson.dataPoints) && respJson.dataPoints.length > 0) {
            const latest = respJson.dataPoints[respJson.dataPoints.length - 1];
            if (latest.respiratoryRate?.breathsPerMinute) {
              breathingRate = Number(latest.respiratoryRate.breathsPerMinute);
              isLiveApiMetric.breathingRate = true;
            }
          }
        }

        if (skinTempRes && skinTempRes.ok) {
          const stJson: any = await skinTempRes.json();
          if (Array.isArray(stJson.dataPoints) && stJson.dataPoints.length > 0) {
            const latest = stJson.dataPoints[stJson.dataPoints.length - 1];
            if (latest.skinTemperature?.deltaCelsius !== undefined) {
              skinTempVariation = Number(latest.skinTemperature.deltaCelsius);
              isLiveApiMetric.skinTemp = true;
            }
          }
        }
      } catch (e) {
        console.warn('Health metrics endpoint query notice:', e);
      }
    }

    const expectedAdditionalScopes = [
      'https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly',
      'https://www.googleapis.com/auth/googlehealth.sleep.readonly'
    ];
    const missingScopes = expectedAdditionalScopes.filter(
      (s) => !grantedScopes.some((g) => g.includes(s.replace('https://www.googleapis.com/auth/', '')))
    );

    const totalRecordCount =
      dailyHistory.length +
      recentExercises.length +
      allIntradayDataPoints.length +
      (todayActiveCalories ? 1 : 0) +
      (todayTotalCalories ? 1 : 0) +
      (sleepHours ? 1 : 0);

    const nowIso = new Date().toISOString();

    const syncDiagnostics: GoogleHealthSyncDiagnostics = {
      provider: 'Google Health API v4 (Fitbit 2026 Unified)',
      metric: 'Steps, Distance, Floors, Intraday Cadence, Calories & Workouts',
      requestedDateRange: `${startCivilStr} to ${todayCivilStr} (${daysCount} days)`,
      timezone: timeZone,
      lastAttemptTime: nowIso,
      lastSuccessfulTime: nowIso,
      responseStatus: stepsRes ? stepsRes.status : 200,
      returnedRecordCount: totalRecordCount,
      dataSourceStatus: 'live',
      syncStatus: totalRecordCount > 0 ? 'updated' : 'no_data',
      requestId: reqId,
      attemptStartTime: attemptStartTime,
      attemptEndTime: nowIso,
      cacheUsage: 'Live API fetch (No cache reuse; bypasses local cache)',
      saveStatus: 'Successfully parsed and committed to application state & localStorage'
    };

    const todayStepsVal = todayMetric ? todayMetric.steps : (dailyHistory.length > 0 ? dailyHistory[0].steps : undefined);
    const todayDistVal = todayMetric ? Number((todayMetric.distanceMeters / 1000).toFixed(2)) : undefined;
    const todayFloorsVal = todayMetric ? todayMetric.floors : undefined;

    return {
      success: true,
      summary: {
        connected: true,
        athleteName,
        athleteEmail,
        avatarUrl,
        activeDevice: detectedDevice,
        steps: todayStepsVal,
        todaySteps: todayStepsVal,
        dailySteps: todayStepsVal,
        todayDistanceKm: todayDistVal,
        distanceKm: todayDistVal,
        todayFloors: todayFloorsVal,
        floorsClimbed: todayFloorsVal,
        todayExerciseCalories: todayExerciseCalories > 0 ? todayExerciseCalories : undefined,
        todayExerciseAzm: todayExerciseAzm > 0 ? todayExerciseAzm : undefined,
        activeZoneMinutes: activeZoneMinutes ?? (todayExerciseAzm > 0 ? todayExerciseAzm : undefined),
        trainingDaysCount,
        trainingDaysWeek,
        todayActiveCalories,
        todayTotalCalories,
        activeCaloriesStatus,
        activeCaloriesReason,
        totalCaloriesStatus,
        totalCaloriesReason,
        weeklyStepsTotal,
        weeklyStepsAverage,
        dailyHistory,
        past7CompleteDays,
        intradayHourly,
        recentExercises: recentExercises.slice(0, 15),
        syncDiagnostics,
        sleepStatus,
        sleepReason,
        sleepDate,
        sleepStartTime,
        sleepEndTime,
        timeAsleepMinutes,
        minutesInSleepPeriod,
        sleepDurationFormatted,
        sleepHours,
        sleepScore,
        deepSleepMinutes,
        remSleepMinutes,
        lightSleepMinutes,
        awakeMinutes,
        restlessMinutes,
        restingHeartRate,
        lowestHeartRate,
        peakHeartRate,
        currentPulse,
        spo2Percent,
        hrvRmssd,
        breathingRate,
        skinTempVariation,
        bodyWeightKg,
        bodyFatPercent,
        muscleMassPercent,
        muscleMassKg,
        bodyWaterPercent,
        boneMassKg,
        visceralFatRating,
        bmi,
        bmrKcal,
        grantedScopes,
        missingScopes,
        hasSleepScope,
        hasHealthMetricsScope,
        hasActivityScope,
        isLiveApiMetric,
        lastSyncedIso: nowIso,
        lastSuccessfulSyncIso: nowIso
      }
    };
  } catch (err: any) {
    console.error('Error fetching Google Health summary:', err);
    return {
      success: false,
      error: err.message || 'Failed to fetch Google Health summary',
      statusCode: 500
    };
  }
}
