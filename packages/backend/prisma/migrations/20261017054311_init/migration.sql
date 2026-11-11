-- CreateEnum
CREATE TYPE "UserAccountStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'PENDING_DELETION');

-- CreateEnum
CREATE TYPE "ConsentType" AS ENUM ('TERMS_ACCEPTANCE', 'PRIVACY_NOTICE_ACK', 'ADULT_ELIGIBILITY_ATTESTATION', 'AI_EVIDENCE_ANALYSIS', 'AI_PERSONALIZATION', 'EMAIL_INTERVENTIONS', 'SOCIAL_SHARING', 'PARTNER_DISCLOSURE');

-- CreateEnum
CREATE TYPE "ConsentDecision" AS ENUM ('GRANTED', 'REVOKED');

-- CreateEnum
CREATE TYPE "ConsentCaptureSource" AS ENUM ('ONBOARDING', 'SETTINGS', 'COMMITMENT_FLOW', 'PARTNER_FLOW', 'SYSTEM_MIGRATION');

-- CreateEnum
CREATE TYPE "CommitmentCategory" AS ENUM ('CODING', 'LEARNING', 'FITNESS', 'PRODUCTIVITY', 'DIGITAL_WELLBEING', 'PERSONAL_ACCOUNTABILITY', 'OTHER');

-- CreateEnum
CREATE TYPE "TargetOperator" AS ENUM ('GTE', 'LTE', 'EQ');

-- CreateEnum
CREATE TYPE "TargetUnit" AS ENUM ('BOOLEAN', 'COUNT', 'MINUTES', 'METERS', 'STEPS', 'WORDS', 'OTHER');

-- CreateEnum
CREATE TYPE "ScheduleCadence" AS ENUM ('ONE_TIME', 'DAILY', 'WEEKLY');

-- CreateEnum
CREATE TYPE "CommitmentSensitivity" AS ENUM ('STANDARD', 'SENSITIVE');

-- CreateEnum
CREATE TYPE "CommitmentVisibility" AS ENUM ('PRIVATE', 'SHARE_BY_GRANT');

-- CreateEnum
CREATE TYPE "CommitmentStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'COMPLETED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "VerificationSource" AS ENUM ('GITHUB_API', 'IN_APP_SESSION', 'ARTIFACT_DETERMINISTIC', 'AI_EVIDENCE', 'PARTNER', 'SELF_REPORT');

-- CreateEnum
CREATE TYPE "VerificationMethodStatus" AS ENUM ('ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('VERIFIED', 'CONTRADICTED', 'UNCERTAIN', 'PENDING');

-- CreateEnum
CREATE TYPE "AttemptState" AS ENUM ('SCHEDULED', 'ACTIVE', 'AWAITING_VERIFICATION', 'RESOLVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AttemptOutcome" AS ENUM ('COMPLETED', 'MISSED', 'UNCERTAIN');

-- CreateEnum
CREATE TYPE "ProgressEventType" AS ENUM ('PROGRESS_SET', 'PROGRESS_INCREMENT', 'SESSION_STARTED', 'SESSION_ENDED', 'TARGET_CLAIMED');

-- CreateEnum
CREATE TYPE "ProgressSource" AS ENUM ('USER', 'IN_APP', 'INTEGRATION', 'SYSTEM');

-- CreateEnum
CREATE TYPE "IdempotencyStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "RiskLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "RiskDataTier" AS ENUM ('BASELINE', 'EARLY_SIGNAL', 'PERSONALIZED');

-- CreateEnum
CREATE TYPE "InsightStatus" AS ENUM ('ACTIVE', 'DISMISSED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "ContentGenerator" AS ENUM ('DETERMINISTIC', 'AI_ASSISTED');

-- CreateEnum
CREATE TYPE "InterventionChannel" AS ENUM ('IN_APP');

-- CreateEnum
CREATE TYPE "InterventionStatus" AS ENUM ('CREATED', 'QUEUED', 'DELIVERED', 'SHOWN', 'CANCELLED', 'FAILED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "InterventionEventType" AS ENUM ('QUEUED', 'DELIVERED', 'SHOWN', 'CLICKED', 'ACTIONED', 'DISMISSED', 'HELPFUL', 'NOT_HELPFUL', 'FAILED', 'OUTCOME_ATTRIBUTED');

-- CreateEnum
CREATE TYPE "AuditActorType" AS ENUM ('USER', 'PARTNER', 'SYSTEM', 'SUPPORT', 'ADMIN');

-- CreateEnum
CREATE TYPE "AuditResult" AS ENUM ('SUCCESS', 'DENIED', 'FAILURE');

-- CreateEnum
CREATE TYPE "DataExportStatus" AS ENUM ('REQUESTED', 'QUEUED', 'RUNNING', 'READY', 'FAILED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AccountDeletionStatus" AS ENUM ('REQUESTED', 'CANCELLED', 'EXECUTING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "OperationRunStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'PARTIAL', 'FAILED', 'CANCELLED');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email_ciphertext" BYTEA NOT NULL,
    "email_hash" BYTEA NOT NULL,
    "email_key_version" SMALLINT NOT NULL,
    "display_name_ciphertext" BYTEA,
    "display_name_key_version" SMALLINT,
    "timezone" VARCHAR(64) NOT NULL,
    "locale" VARCHAR(16) NOT NULL DEFAULT 'en',
    "account_status" "UserAccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "onboarded_at" TIMESTAMPTZ,
    "deletion_requested_at" TIMESTAMPTZ,
    "scheduled_purge_at" TIMESTAMPTZ,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_preferences" (
    "user_id" UUID NOT NULL,
    "quiet_hours_start" TIME(0),
    "quiet_hours_end" TIME(0),
    "in_app_interventions_enabled" BOOLEAN NOT NULL DEFAULT true,
    "email_interventions_enabled" BOOLEAN NOT NULL DEFAULT false,
    "behavior_insights_enabled" BOOLEAN NOT NULL DEFAULT true,
    "ai_personalization_enabled" BOOLEAN NOT NULL DEFAULT false,
    "week_starts_on" SMALLINT NOT NULL DEFAULT 1,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "user_preferences_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "auth_identities" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "provider" VARCHAR(32) NOT NULL,
    "provider_subject" VARCHAR(255) NOT NULL,
    "provider_tenant" VARCHAR(255),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMPTZ,

    CONSTRAINT "auth_identities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consent_records" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "consent_type" "ConsentType" NOT NULL,
    "decision" "ConsentDecision" NOT NULL,
    "policy_version" VARCHAR(32) NOT NULL,
    "capture_source" "ConsentCaptureSource" NOT NULL,
    "captured_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "request_id" UUID,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "idempotency_key" VARCHAR(128) NOT NULL,

    CONSTRAINT "consent_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commitments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "category" "CommitmentCategory" NOT NULL,
    "sensitivity" "CommitmentSensitivity" NOT NULL,
    "visibility" "CommitmentVisibility" NOT NULL DEFAULT 'PRIVATE',
    "cadence" "ScheduleCadence" NOT NULL,
    "weekdays" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "local_start_date" DATE NOT NULL,
    "local_end_date" DATE,
    "local_window_start_time" VARCHAR(8),
    "local_deadline_time" VARCHAR(8),
    "timezone" VARCHAR(64) NOT NULL,
    "target_operator" "TargetOperator" NOT NULL,
    "target_value" DECIMAL(12,3) NOT NULL,
    "target_unit" "TargetUnit" NOT NULL,
    "target_label" VARCHAR(64),
    "status" "CommitmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "commitments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commitment_verification_methods" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "commitment_id" UUID NOT NULL,
    "provider" "VerificationSource" NOT NULL,
    "priority" INTEGER NOT NULL,
    "configuration" JSONB NOT NULL DEFAULT '{}',
    "status" "VerificationMethodStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "commitment_verification_methods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commitment_attempts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "commitment_id" UUID NOT NULL,
    "commitment_version" INTEGER NOT NULL,
    "state" "AttemptState" NOT NULL DEFAULT 'SCHEDULED',
    "outcome" "AttemptOutcome",
    "period_start_at" TIMESTAMPTZ NOT NULL,
    "deadline_at" TIMESTAMPTZ NOT NULL,
    "grace_ends_at" TIMESTAMPTZ NOT NULL,
    "timezone_snapshot" VARCHAR(64) NOT NULL,
    "target_operator" "TargetOperator" NOT NULL,
    "target_value" DECIMAL(12,3) NOT NULL,
    "target_unit" "TargetUnit" NOT NULL,
    "target_label" VARCHAR(64),
    "current_progress_value" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "last_progress_event_at" TIMESTAMPTZ,
    "started_at" TIMESTAMPTZ,
    "resolved_at" TIMESTAMPTZ,
    "open_focus_session_id" UUID,
    "verification_snapshot" JSONB NOT NULL DEFAULT '[]',
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "commitment_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attempt_progress_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "attempt_id" UUID NOT NULL,
    "type" "ProgressEventType" NOT NULL,
    "source" "ProgressSource" NOT NULL,
    "value" DECIMAL(12,3),
    "unit" "TargetUnit",
    "session_id" UUID,
    "closure_reason" VARCHAR(64),
    "observation_limited" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "occurred_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attempt_progress_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification_runs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "attempt_id" UUID NOT NULL,
    "source" "VerificationSource" NOT NULL,
    "status" "OperationRunStatus" NOT NULL DEFAULT 'QUEUED',
    "verification_result_id" UUID,
    "error_code" VARCHAR(64),
    "started_at" TIMESTAMPTZ,
    "completed_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "verification_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification_results" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "attempt_id" UUID NOT NULL,
    "status" "VerificationStatus" NOT NULL,
    "source" "VerificationSource" NOT NULL,
    "confidence" INTEGER,
    "reason_code" VARCHAR(64) NOT NULL,
    "reason" TEXT NOT NULL,
    "claim_scope" JSONB NOT NULL,
    "observations" JSONB NOT NULL DEFAULT '[]',
    "limitations" JSONB NOT NULL DEFAULT '[]',
    "refs" JSONB NOT NULL DEFAULT '[]',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "evaluator" VARCHAR(64) NOT NULL,
    "evaluator_version" VARCHAR(32) NOT NULL,
    "schema_version" INTEGER NOT NULL DEFAULT 1,
    "assessed_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "verification_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "risk_snapshots" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "attempt_id" UUID NOT NULL,
    "score" INTEGER NOT NULL,
    "level" "RiskLevel" NOT NULL,
    "factors" JSONB NOT NULL,
    "data_tier" "RiskDataTier" NOT NULL,
    "comparable_sample_size" INTEGER NOT NULL,
    "algorithm_version" VARCHAR(32) NOT NULL,
    "calculated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "risk_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "behavior_insights" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "type" VARCHAR(64) NOT NULL,
    "statement" TEXT NOT NULL,
    "sample_size" INTEGER NOT NULL,
    "window_start_at" TIMESTAMPTZ NOT NULL,
    "window_end_at" TIMESTAMPTZ NOT NULL,
    "action" TEXT NOT NULL,
    "stage" VARCHAR(32) NOT NULL,
    "calculation_version" VARCHAR(32) NOT NULL,
    "limitations" JSONB NOT NULL DEFAULT '[]',
    "status" "InsightStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "behavior_insights_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interventions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "attempt_id" UUID NOT NULL,
    "risk_snapshot_id" UUID NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "status" "InterventionStatus" NOT NULL DEFAULT 'DELIVERED',
    "channel" "InterventionChannel" NOT NULL DEFAULT 'IN_APP',
    "message" TEXT NOT NULL,
    "action_type" VARCHAR(64) NOT NULL,
    "action_label" VARCHAR(64) NOT NULL,
    "generator" "ContentGenerator" NOT NULL,
    "deliver_at" TIMESTAMPTZ NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "interventions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "intervention_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "intervention_id" UUID NOT NULL,
    "type" "InterventionEventType" NOT NULL,
    "reason_code" VARCHAR(64),
    "occurred_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "intervention_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idempotency_records" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID,
    "idempotency_key" VARCHAR(128) NOT NULL,
    "method" VARCHAR(8) NOT NULL,
    "route" VARCHAR(255) NOT NULL,
    "request_hash" VARCHAR(64) NOT NULL,
    "status" "IdempotencyStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "response_status" INTEGER,
    "response_body" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "idempotency_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "actor_type" "AuditActorType" NOT NULL,
    "actor_user_id" UUID,
    "action" VARCHAR(64) NOT NULL,
    "resource_type" VARCHAR(64) NOT NULL,
    "resource_id" UUID,
    "result" "AuditResult" NOT NULL,
    "reason_code" VARCHAR(64),
    "request_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "data_export_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "status" "DataExportStatus" NOT NULL DEFAULT 'QUEUED',
    "format" VARCHAR(32) NOT NULL DEFAULT 'JSON_ZIP',
    "expires_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "data_export_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account_deletion_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "status" "AccountDeletionStatus" NOT NULL DEFAULT 'REQUESTED',
    "recovery_ends_at" TIMESTAMPTZ NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "account_deletion_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_leases" (
    "name" VARCHAR(64) NOT NULL,
    "leased_until" TIMESTAMPTZ NOT NULL,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "job_leases_pkey" PRIMARY KEY ("name")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_hash_key" ON "users"("email_hash");

-- CreateIndex
CREATE INDEX "auth_identities_user_id_idx" ON "auth_identities"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "auth_identities_provider_provider_subject_key" ON "auth_identities"("provider", "provider_subject");

-- CreateIndex
CREATE UNIQUE INDEX "consent_records_idempotency_key_key" ON "consent_records"("idempotency_key");

-- CreateIndex
CREATE INDEX "consent_records_user_id_consent_type_captured_at_idx" ON "consent_records"("user_id", "consent_type", "captured_at" DESC);

-- CreateIndex
CREATE INDEX "commitments_user_id_status_idx" ON "commitments"("user_id", "status");

-- CreateIndex
CREATE INDEX "commitment_verification_methods_commitment_id_idx" ON "commitment_verification_methods"("commitment_id");

-- CreateIndex
CREATE INDEX "commitment_attempts_user_id_state_deadline_at_idx" ON "commitment_attempts"("user_id", "state", "deadline_at");

-- CreateIndex
CREATE INDEX "commitment_attempts_state_deadline_at_idx" ON "commitment_attempts"("state", "deadline_at");

-- CreateIndex
CREATE INDEX "commitment_attempts_state_grace_ends_at_idx" ON "commitment_attempts"("state", "grace_ends_at");

-- CreateIndex
CREATE UNIQUE INDEX "commitment_attempts_commitment_id_period_start_at_key" ON "commitment_attempts"("commitment_id", "period_start_at");

-- CreateIndex
CREATE INDEX "attempt_progress_events_attempt_id_created_at_idx" ON "attempt_progress_events"("attempt_id", "created_at");

-- CreateIndex
CREATE INDEX "attempt_progress_events_session_id_idx" ON "attempt_progress_events"("session_id");

-- CreateIndex
CREATE UNIQUE INDEX "verification_runs_verification_result_id_key" ON "verification_runs"("verification_result_id");

-- CreateIndex
CREATE INDEX "verification_runs_attempt_id_source_idx" ON "verification_runs"("attempt_id", "source");

-- CreateIndex
CREATE INDEX "verification_results_attempt_id_assessed_at_idx" ON "verification_results"("attempt_id", "assessed_at" DESC);

-- CreateIndex
CREATE INDEX "risk_snapshots_attempt_id_calculated_at_idx" ON "risk_snapshots"("attempt_id", "calculated_at" DESC);

-- CreateIndex
CREATE INDEX "behavior_insights_user_id_created_at_idx" ON "behavior_insights"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "interventions_user_id_status_deliver_at_idx" ON "interventions"("user_id", "status", "deliver_at");

-- CreateIndex
CREATE UNIQUE INDEX "interventions_attempt_id_ordinal_key" ON "interventions"("attempt_id", "ordinal");

-- CreateIndex
CREATE INDEX "intervention_events_intervention_id_occurred_at_idx" ON "intervention_events"("intervention_id", "occurred_at");

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_records_user_id_idempotency_key_method_route_key" ON "idempotency_records"("user_id", "idempotency_key", "method", "route");

-- CreateIndex
CREATE INDEX "audit_events_actor_user_id_created_at_idx" ON "audit_events"("actor_user_id", "created_at");

-- AddForeignKey
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_identities" ADD CONSTRAINT "auth_identities_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commitments" ADD CONSTRAINT "commitments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commitment_verification_methods" ADD CONSTRAINT "commitment_verification_methods_commitment_id_fkey" FOREIGN KEY ("commitment_id") REFERENCES "commitments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commitment_attempts" ADD CONSTRAINT "commitment_attempts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commitment_attempts" ADD CONSTRAINT "commitment_attempts_commitment_id_fkey" FOREIGN KEY ("commitment_id") REFERENCES "commitments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attempt_progress_events" ADD CONSTRAINT "attempt_progress_events_attempt_id_fkey" FOREIGN KEY ("attempt_id") REFERENCES "commitment_attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_runs" ADD CONSTRAINT "verification_runs_attempt_id_fkey" FOREIGN KEY ("attempt_id") REFERENCES "commitment_attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_runs" ADD CONSTRAINT "verification_runs_verification_result_id_fkey" FOREIGN KEY ("verification_result_id") REFERENCES "verification_results"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_results" ADD CONSTRAINT "verification_results_attempt_id_fkey" FOREIGN KEY ("attempt_id") REFERENCES "commitment_attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "risk_snapshots" ADD CONSTRAINT "risk_snapshots_attempt_id_fkey" FOREIGN KEY ("attempt_id") REFERENCES "commitment_attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behavior_insights" ADD CONSTRAINT "behavior_insights_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interventions" ADD CONSTRAINT "interventions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interventions" ADD CONSTRAINT "interventions_attempt_id_fkey" FOREIGN KEY ("attempt_id") REFERENCES "commitment_attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intervention_events" ADD CONSTRAINT "intervention_events_intervention_id_fkey" FOREIGN KEY ("intervention_id") REFERENCES "interventions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "idempotency_records" ADD CONSTRAINT "idempotency_records_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_export_requests" ADD CONSTRAINT "data_export_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_deletion_requests" ADD CONSTRAINT "account_deletion_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
