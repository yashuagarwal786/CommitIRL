import { z } from "zod";

export const uuidSchema = z.string().uuid();
export const isoDateTimeSchema = z.string().datetime({ offset: true });
export const localDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const ianaTimezoneSchema = z.string().min(1).max(64);

export const errorEnvelopeSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
    requestId: uuidSchema,
  }),
});

export const dataEnvelopeSchema = <T extends z.ZodTypeAny>(data: T) =>
  z.object({ data });

export const cursorMetaSchema = z.object({
  nextCursor: z.string().nullable(),
  hasMore: z.boolean(),
});

export const categorySchema = z.enum([
  "CODING",
  "LEARNING",
  "FITNESS",
  "PRODUCTIVITY",
  "DIGITAL_WELLBEING",
  "PERSONAL_ACCOUNTABILITY",
  "OTHER",
]);

export const targetOperatorSchema = z.enum(["GTE", "LTE", "EQ"]);
export const targetUnitSchema = z.enum([
  "BOOLEAN",
  "COUNT",
  "MINUTES",
  "METERS",
  "STEPS",
  "WORDS",
  "OTHER",
]);
export const cadenceSchema = z.enum(["ONE_TIME", "DAILY", "WEEKLY"]);
export const weekdaySchema = z.enum([
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
  "SUNDAY",
]);
export const sensitivitySchema = z.enum(["STANDARD", "SENSITIVE"]);
export const visibilitySchema = z.enum(["PRIVATE", "SHARE_BY_GRANT"]);
export const commitmentStatusSchema = z.enum([
  "DRAFT",
  "ACTIVE",
  "PAUSED",
  "COMPLETED",
  "ARCHIVED",
]);
export const verificationSourceSchema = z.enum([
  "GITHUB_API",
  "IN_APP_SESSION",
  "ARTIFACT_DETERMINISTIC",
  "AI_EVIDENCE",
  "PARTNER",
  "SELF_REPORT",
]);
export const attemptStateSchema = z.enum([
  "SCHEDULED",
  "ACTIVE",
  "AWAITING_VERIFICATION",
  "RESOLVED",
  "CANCELLED",
]);
export const attemptOutcomeSchema = z.enum(["COMPLETED", "MISSED", "UNCERTAIN"]);
export const verificationStatusSchema = z.enum([
  "VERIFIED",
  "CONTRADICTED",
  "UNCERTAIN",
  "PENDING",
]);
export const selfReportChoiceSchema = z.enum(["KEPT", "NOT_KEPT", "CANNOT_CONFIRM"]);
export const progressEventTypeSchema = z.enum([
  "PROGRESS_SET",
  "PROGRESS_INCREMENT",
  "SESSION_STARTED",
  "SESSION_ENDED",
  "TARGET_CLAIMED",
]);
export const consentTypeSchema = z.enum([
  "TERMS_ACCEPTANCE",
  "PRIVACY_NOTICE_ACK",
  "ADULT_ELIGIBILITY_ATTESTATION",
  "AI_EVIDENCE_ANALYSIS",
  "AI_PERSONALIZATION",
  "EMAIL_INTERVENTIONS",
  "SOCIAL_SHARING",
  "PARTNER_DISCLOSURE",
]);
export const consentDecisionSchema = z.enum(["GRANTED", "REVOKED"]);
export const accountStatusSchema = z.enum(["ACTIVE", "SUSPENDED", "PENDING_DELETION"]);
export const riskLevelSchema = z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);
export const interventionEventTypeSchema = z.enum([
  "SHOWN",
  "CLICKED",
  "ACTIONED",
  "DISMISSED",
  "HELPFUL",
  "NOT_HELPFUL",
]);

export const targetSchema = z.object({
  operator: targetOperatorSchema,
  value: z.number().positive(),
  unit: targetUnitSchema,
  label: z.string().min(1).max(64).optional(),
});

export const scheduleSchema = z.object({
  cadence: cadenceSchema,
  weekdays: z.array(weekdaySchema).optional(),
  localStartDate: localDateSchema,
  localEndDate: localDateSchema.nullable().optional(),
  localWindowStartTime: z.string().nullable().optional(),
  localDeadlineTime: z.string().nullable().optional(),
});

export const verificationMethodInputSchema = z.object({
  provider: verificationSourceSchema,
  priority: z.number().int().positive(),
  configuration: z.record(z.unknown()).default({}),
});

export const createCommitmentBodySchema = z
  .object({
    title: z.string().min(1).max(200),
    description: z.string().max(2000).optional(),
    category: categorySchema,
    sensitivity: sensitivitySchema,
    visibility: visibilitySchema.optional(),
    schedule: scheduleSchema,
    target: targetSchema,
    timezone: ianaTimezoneSchema,
    verificationMethods: z.array(verificationMethodInputSchema).min(1),
  })
  .strict();

export const patchMeBodySchema = z
  .object({
    name: z.string().min(1).max(80).nullable().optional(),
    timezone: ianaTimezoneSchema.optional(),
    locale: z.string().min(2).max(16).optional(),
  })
  .strict();

export const patchPreferencesBodySchema = z
  .object({
    quietHours: z
      .object({
        start: z.string().nullable(),
        end: z.string().nullable(),
      })
      .optional(),
    inAppInterventionsEnabled: z.boolean().optional(),
    behaviorInsightsEnabled: z.boolean().optional(),
    aiPersonalizationEnabled: z.boolean().optional(),
    weekStartsOn: z.number().int().min(1).max(7).optional(),
  })
  .strict();

export const createConsentBodySchema = z
  .object({
    consentType: consentTypeSchema,
    decision: consentDecisionSchema,
    policyVersion: z.string().min(1).max(32),
  })
  .strict();

export const completeOnboardingBodySchema = z
  .object({
    timezone: ianaTimezoneSchema,
    locale: z.string().min(2).max(16).default("en"),
    name: z.string().min(1).max(80).optional(),
    adultEligibility: z.literal(true),
    termsAccepted: z.literal(true),
    privacyAcknowledged: z.literal(true),
    policyVersion: z.string().min(1).max(32).default("2026-08-23"),
  })
  .strict();

export const progressEventBodySchema = z
  .object({
    type: z.enum(["PROGRESS_SET", "PROGRESS_INCREMENT"]),
    value: z.number().nonnegative(),
    unit: targetUnitSchema,
    observedAt: isoDateTimeSchema.optional(),
  })
  .strict();

export const startFocusBodySchema = z
  .object({
    clientContext: z.object({ visibility: z.literal("FOREGROUND") }).optional(),
  })
  .strict();

export const finishFocusBodySchema = z
  .object({
    clientEndedAt: isoDateTimeSchema.optional(),
  })
  .strict();

export const selfReportBodySchema = z
  .object({
    choice: selfReportChoiceSchema,
    comment: z.string().max(500).optional(),
  })
  .strict();

export const parseCommitmentBodySchema = z
  .object({
    text: z.string().min(1).max(500),
    locale: z.string().min(2).max(16),
    timezone: ianaTimezoneSchema,
  })
  .strict();

export const recommendVerificationBodySchema = z
  .object({
    category: categorySchema,
    target: targetSchema,
    schedule: scheduleSchema,
    sensitivity: sensitivitySchema,
    description: z.string().max(2000).optional(),
  })
  .strict();

export const interventionEventBodySchema = z
  .object({
    type: interventionEventTypeSchema,
    occurredAt: isoDateTimeSchema.optional(),
    reasonCode: z.string().max(64).optional(),
  })
  .strict();

export const pauseCommitmentBodySchema = z
  .object({
    effectiveAt: isoDateTimeSchema.optional(),
  })
  .strict();

export const resumeCommitmentBodySchema = z
  .object({
    effectiveLocalDate: localDateSchema.optional(),
  })
  .strict();

export const devSessionBodySchema = z
  .object({
    email: z.string().email(),
    displayName: z.string().min(1).max(80).optional(),
  })
  .strict();

export type CreateCommitmentBody = z.infer<typeof createCommitmentBodySchema>;
export type Target = z.infer<typeof targetSchema>;
export type Schedule = z.infer<typeof scheduleSchema>;
export type SelfReportChoice = z.infer<typeof selfReportChoiceSchema>;
