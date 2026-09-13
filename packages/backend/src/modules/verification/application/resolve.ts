import { prisma } from "../../platform/db.js";
import { AppError, conflict, notFound, versionConflict } from "../../platform/errors.js";
import { progressMeetsTarget } from "../commitments-scheduling/domain/schedule.js";
import { evaluateRiskForAttempt } from "../risk/application/evaluate.js";
import { maybeCreateIntervention } from "../interventions-notifications/application/interventions.js";
import { recomputeInsights } from "../behavior/application/insights.js";

interface IncomingResult {
  source: "SELF_REPORT" | "IN_APP_SESSION" | "GITHUB_API" | "PARTNER" | "AI_EVIDENCE" | "ARTIFACT_DETERMINISTIC";
  status: "VERIFIED" | "CONTRADICTED" | "UNCERTAIN" | "PENDING";
  reasonCode: string;
  reason: string;
  limitations: Array<{ code: string; explanation: string }>;
  confidence?: number | null;
}

export async function submitSelfReport(
  userId: string,
  attemptId: string,
  version: number,
  choice: "KEPT" | "NOT_KEPT" | "CANNOT_CONFIRM",
) {
  const attempt = await prisma.commitmentAttempt.findFirst({ where: { id: attemptId, userId } });
  if (!attempt) throw notFound("ATTEMPT_NOT_FOUND");
  if (attempt.version !== version) throw versionConflict();
  if (!["ACTIVE", "AWAITING_VERIFICATION"].includes(attempt.state)) {
    throw new AppError("ATTEMPT_NOT_REPORTABLE", "This attempt cannot accept a self-report.", 409);
  }
  const existing = await prisma.verificationResult.findFirst({
    where: { attemptId, source: "SELF_REPORT" },
  });
  if (existing) throw conflict("REPORT_ALREADY_FINAL", "A self-report already exists for this attempt.");
  const mapped: IncomingResult =
    choice === "KEPT"
      ? {
          source: "SELF_REPORT",
          status: "VERIFIED",
          reasonCode: "OWNER_SELF_REPORT_KEPT",
          reason: "The owner asserted the target was met. This is labeled self-report, not independent proof.",
          limitations: [{ code: "SELF_ASSERTED", explanation: "Self-report is excluded from evidence-backed reliability metrics." }],
          confidence: null,
        }
      : choice === "NOT_KEPT"
        ? {
            source: "SELF_REPORT",
            status: "CONTRADICTED",
            reasonCode: "OWNER_ADMISSION_NOT_KEPT",
            reason: "The owner reported that the target was not met.",
            limitations: [{ code: "SELF_ASSERTED", explanation: "This is an explicit owner admission." }],
            confidence: null,
          }
        : {
            source: "SELF_REPORT",
            status: "UNCERTAIN",
            reasonCode: "OWNER_CANNOT_CONFIRM",
            reason: "The owner could not confirm whether the target was met.",
            limitations: [{ code: "SELF_ASSERTED", explanation: "Uncertainty is preserved." }],
            confidence: null,
          };
  return evaluateAndMaybeResolve(attemptId, mapped);
}

export async function evaluateAndMaybeResolve(attemptId: string, incoming: IncomingResult | null) {
  const attempt = await prisma.commitmentAttempt.findUniqueOrThrow({ where: { id: attemptId } });
  if (attempt.state === "RESOLVED" || attempt.state === "CANCELLED") {
    return { attempt, verificationResult: null };
  }
  let result = null;
  if (incoming) {
    result = await prisma.verificationResult.create({
      data: {
        attemptId,
        status: incoming.status,
        source: incoming.source,
        confidence: incoming.confidence ?? null,
        reasonCode: incoming.reasonCode,
        reason: incoming.reason,
        claimScope: {
          predicate: "ATTEMPT_TARGET_MET",
          periodStartAt: attempt.periodStartAt.toISOString(),
          periodEndAt: attempt.deadlineAt.toISOString(),
          coverage: incoming.source === "IN_APP_SESSION" ? "PARTIAL" : "FULL",
        },
        observations: [{ code: incoming.reasonCode, value: true }],
        limitations: incoming.limitations,
        refs: [],
        evaluator: incoming.source.toLowerCase(),
        evaluatorVersion: "1.0.0",
      },
    });
    await prisma.verificationRun.create({
      data: {
        attemptId,
        source: incoming.source,
        status: "SUCCEEDED",
        verificationResultId: result.id,
        startedAt: new Date(),
        completedAt: new Date(),
      },
    });
  }
  const results = await prisma.verificationResult.findMany({
    where: { attemptId },
    orderBy: { assessedAt: "desc" },
  });
  const admission = results.find((r) => r.source === "SELF_REPORT" && r.reasonCode === "OWNER_ADMISSION_NOT_KEPT");
  const kept = results.find((r) => r.source === "SELF_REPORT" && r.reasonCode === "OWNER_SELF_REPORT_KEPT");
  const verifiedAuthoritative = results.find(
    (r) => r.status === "VERIFIED" && (r.source === "IN_APP_SESSION" || r.source === "GITHUB_API" || r.source === "ARTIFACT_DETERMINISTIC"),
  );
  const now = new Date();
  const graceClosed = now >= attempt.graceEndsAt;
  const progressMet = progressMeetsTarget(attempt.currentProgressValue, attempt.targetOperator, attempt.targetValue);

  let outcome: "COMPLETED" | "MISSED" | "UNCERTAIN" | null = null;
  if (admission) outcome = "MISSED";
  else if (verifiedAuthoritative || (kept && !results.some((r) => r.status === "CONTRADICTED" && r.source !== "SELF_REPORT"))) {
    if (verifiedAuthoritative || kept) outcome = "COMPLETED";
  } else if (graceClosed) {
    outcome = "UNCERTAIN";
  } else if (incoming?.source === "SELF_REPORT" && incoming.status === "UNCERTAIN") {
    outcome = "UNCERTAIN";
  }

  if (outcome && (attempt.state === "ACTIVE" || attempt.state === "AWAITING_VERIFICATION" || graceClosed || incoming)) {
    const resolved = await prisma.commitmentAttempt.update({
      where: { id: attemptId },
      data: {
        state: "RESOLVED",
        outcome,
        resolvedAt: now,
        version: { increment: 1 },
      },
    });
    await recomputeInsights(resolved.userId);
    return { attempt: resolved, verificationResult: result };
  }
  if (progressMet && attempt.targetUnit === "MINUTES" && incoming?.source === "IN_APP_SESSION") {
    // wait for evaluate path above
  }
  await evaluateRiskForAttempt(attemptId);
  await maybeCreateIntervention(attemptId);
  return { attempt, verificationResult: result };
}
