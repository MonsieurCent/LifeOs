import { z } from "zod";

/**
 * Zod schema for the Google Health Live API endpoint response (/api/fitness/google-health-live-test).
 */
export const GoogleHealthUserSchema = z.object({
  displayName: z.string().optional(),
  email: z.string().optional(),
  avatar: z.string().optional(),
}).passthrough();

export const GoogleHealthTokenDetailsSchema = z.object({
  expiresInSeconds: z.number().optional(),
  audience: z.string().optional(),
  hasHealthScopes: z.boolean().optional(),
  hasSleepScope: z.boolean().optional(),
  hasHeartScope: z.boolean().optional(),
  hasActivityScope: z.boolean().optional(),
  grantedScopes: z.array(z.string()).optional(),
}).passthrough();

export const GoogleHealthSuccessSchema = z.object({
  success: z.literal(true),
  message: z.string().optional(),
  fetchedWeightKg: z.number().nullable().optional(),
  fetchedBodyFat: z.number().nullable().optional(),
  fetchedMuscle: z.number().nullable().optional(),
  fetchedBodyWater: z.number().nullable().optional(),
  fetchedBoneMass: z.number().nullable().optional(),
  fetchedVisceralFat: z.number().nullable().optional(),
  fetchedBmi: z.number().nullable().optional(),
  fetchedBmr: z.number().nullable().optional(),
  fetchedSteps: z.number().nullable().optional(),
  googleUser: GoogleHealthUserSchema.optional(),
  tokenDetails: GoogleHealthTokenDetailsSchema.optional(),
  dataSourcesFound: z.number().optional(),
  sampleDataSources: z.array(z.string()).optional(),
  apiEnabledStatus: z.string().optional(),
  setupWarning: z.string().optional(),
  setupDocsUrl: z.string().optional(),
  migrationNotice: z.string().optional(),
  isLegacyFitbitToken: z.boolean().optional(),
}).passthrough();

export const GoogleHealthErrorSchema = z.object({
  success: z.literal(false),
  error: z.string().optional(),
  message: z.string().optional(),
  instruction: z.string().optional(),
  status: z.number().optional(),
}).passthrough();

export const GoogleHealthApiResponseSchema = z.discriminatedUnion("success", [
  GoogleHealthSuccessSchema,
  GoogleHealthErrorSchema,
]);

export type GoogleHealthApiResponse = z.infer<typeof GoogleHealthApiResponseSchema>;
export type GoogleHealthSuccessResponse = z.infer<typeof GoogleHealthSuccessSchema>;
export type GoogleHealthErrorResponse = z.infer<typeof GoogleHealthErrorSchema>;

/**
 * Strict schema for the extracted physiological body composition metrics.
 */
export const PhysiologicalBodyCompMetricsSchema = z.object({
  weightKg: z
    .number()
    .finite("Weight must be a finite number")
    .min(25, "Weight must be at least 25 kg (55 lbs)")
    .max(350, "Weight cannot exceed 350 kg (770 lbs)"),
  bodyFatPercent: z
    .number()
    .finite("Body fat percentage must be a finite number")
    .min(3, "Body fat percentage cannot be lower than 3%")
    .max(65, "Body fat percentage cannot exceed 65%")
    .optional(),
  muscleMassPercent: z
    .number()
    .finite("Muscle mass percentage must be a finite number")
    .min(15, "Muscle mass percentage must be at least 15%")
    .max(75, "Muscle mass percentage cannot exceed 75%")
    .optional(),
  waterPercent: z
    .number()
    .finite()
    .min(20, "Water percentage cannot be lower than 20%")
    .max(85, "Water percentage cannot exceed 85%")
    .optional(),
  boneMassKg: z
    .number()
    .finite()
    .min(0.5, "Bone mass must be at least 0.5 kg")
    .max(10, "Bone mass cannot exceed 10 kg")
    .optional(),
  visceralFat: z
    .number()
    .finite()
    .min(1, "Visceral fat must be at least 1")
    .max(59, "Visceral fat cannot exceed 59")
    .optional(),
  bmi: z
    .number()
    .finite()
    .min(10, "BMI must be at least 10")
    .max(70, "BMI cannot exceed 70")
    .optional(),
  bmrKcal: z
    .number()
    .finite()
    .min(500, "BMR must be at least 500 kcal")
    .max(5000, "BMR cannot exceed 5000 kcal")
    .optional(),
});

export type PhysiologicalBodyCompMetrics = z.infer<typeof PhysiologicalBodyCompMetricsSchema>;

export interface HealthValidationResult {
  isValid: boolean;
  type: "success_with_data" | "success_empty" | "api_error" | "schema_invalid";
  errorMessage?: string;
  instruction?: string;
  metrics?: PhysiologicalBodyCompMetrics;
  rawPayload?: unknown;
  validationIssues?: z.ZodIssue[];
}

/**
 * Validates the raw JSON payload from the Google Health live test API endpoint
 * using strict Zod schemas and physiological bounds checking.
 */
export function validateGoogleHealthApiResponse(raw: unknown): HealthValidationResult {
  // 1. Validate top-level schema contract
  const envelopeResult = GoogleHealthApiResponseSchema.safeParse(raw);

  if (!envelopeResult.success) {
    const issueSummary = envelopeResult.error.issues
      .map((i) => `[${i.path.join(".") || "root"}]: ${i.message}`)
      .join("; ");

    return {
      isValid: false,
      type: "schema_invalid",
      errorMessage: `Payload structure does not match expected Google Health API schema (${issueSummary})`,
      validationIssues: envelopeResult.error.issues,
      rawPayload: raw,
    };
  }

  const envelope = envelopeResult.data;

  // 2. Handle API-level error responses
  if (!envelope.success) {
    const errorText =
      typeof envelope.error === "string"
        ? envelope.error
        : typeof envelope.message === "string"
        ? envelope.message
        : "Google Health API returned an error status.";

    const instructionText =
      typeof envelope.instruction === "string" ? envelope.instruction : undefined;

    return {
      isValid: false,
      type: "api_error",
      errorMessage: errorText,
      instruction: instructionText,
      rawPayload: raw,
    };
  }

  // 3. Handle successful response with empty/null weight data
  if (envelope.fetchedWeightKg === null || envelope.fetchedWeightKg === undefined) {
    const emptyMessage =
      typeof envelope.message === "string"
        ? envelope.message
        : "Google Health connected, but no weight records were found in your recent history.";

    const setupWarning =
      typeof envelope.setupWarning === "string" ? envelope.setupWarning : undefined;

    return {
      isValid: true,
      type: "success_empty",
      errorMessage: emptyMessage,
      instruction: setupWarning,
      rawPayload: raw,
    };
  }

  // 4. Validate physiological metrics (weight, body fat %, muscle mass %)
  let normalizedMusclePercent: number | undefined = undefined;
  if (envelope.fetchedMuscle !== null && envelope.fetchedMuscle !== undefined) {
    const rawVal = envelope.fetchedMuscle;
    if (rawVal >= 15 && rawVal <= 75) {
      normalizedMusclePercent = Number(rawVal.toFixed(1));
    } else if (rawVal > 75 && envelope.fetchedWeightKg) {
      // If legacy or raw kg value was supplied, convert to percentage
      normalizedMusclePercent = Number(((rawVal / envelope.fetchedWeightKg) * 100).toFixed(1));
    } else if (rawVal > 0) {
      normalizedMusclePercent = Number(rawVal.toFixed(1));
    }
  }

  const metricsCandidate = {
    weightKg: envelope.fetchedWeightKg,
    bodyFatPercent: envelope.fetchedBodyFat ?? undefined,
    muscleMassPercent: normalizedMusclePercent,
    waterPercent: envelope.fetchedBodyWater ?? undefined,
    boneMassKg: envelope.fetchedBoneMass ?? undefined,
    visceralFat: envelope.fetchedVisceralFat ?? undefined,
    bmi: envelope.fetchedBmi ?? undefined,
    bmrKcal: envelope.fetchedBmr ?? undefined,
  };

  const metricsResult = PhysiologicalBodyCompMetricsSchema.safeParse(metricsCandidate);

  if (!metricsResult.success) {
    const issueSummary = metricsResult.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join(", ");

    return {
      isValid: false,
      type: "schema_invalid",
      errorMessage: `Invalid physiological metrics in Google Health response: ${issueSummary}`,
      validationIssues: metricsResult.error.issues,
      rawPayload: raw,
    };
  }

  return {
    isValid: true,
    type: "success_with_data",
    metrics: metricsResult.data,
    rawPayload: raw,
  };
}
