import { Decimal } from "@prisma/client/runtime/library";
import type { Prisma } from "@prisma/client";
import { prisma } from "../../../platform/db.js";
import { systemClock } from "../../../platform/clock.js";
import { newId } from "../../../platform/crypto.js";
import { AppError, conflict, notFound, validationFailed, versionConflict } from "../../../platform/errors.js";
import { progressMeetsTarget, unitCompatible } from "../../commitments-scheduling/domain/schedule.js";
import { evaluateAndMaybeResolve } from "../../verification/application/resolve.js";
import { evaluateRiskForAttempt } from "../../risk/application/evaluate.js";

type AttemptRow = Prisma.CommitmentAttemptGetPayload<{ include: { commitment: true } }>;

export function serializeAttempt(row: AttemptRow, extras: Record<string, unknown> = {}) {
  return {
    id: row.id,
    commitmentId: row.commitmentId,
    commitmentTitle: row.commitment.title,
    state: row.state,
    outcome: row.outcome,
    periodStartAt: row.periodStartAt.toISOString(),
    deadlineAt: row.deadlineAt.toISOString(),
    graceEndsAt: row.graceEndsAt.toISOString(),
    timezoneSnapshot: row.timezoneSnapshot,
    targetSnapshot: {
      operator: row.targetOperator,
      value: Number(row.targetValue),
      unit: row.targetUnit,
      label: row.targetLabel ?? undefined,
    },
    progress: {
      value: Number(row.currentProgressValue),
      unit: row.targetUnit,
      lastEventAt: row.lastProgressEventAt?.toISOString() ?? null,
    },
    openFocusSessionId: row.openFocusSessionId,
    version: row.version,
    ...extras,
  };
}

export async function listAttempts(userId: string, filters: { state?: string; commitmentId?: string }) {
  await reconcileDueAttempts();
  const rows = await prisma.commitmentAttempt.findMany({
    where: {
      userId,
      ...(filters.state ? { state: filters.state as never } : {}),
      ...(filters.commitmentId ? { commitmentId: filters.commitmentId } : {}),
    },
    include: { commitment: true },
    orderBy: { deadlineAt: "asc" },
    take: 100,
  });
  return rows.map((row) => serializeAttempt(row));
}

export async function getAttempt(userId: string, attemptId: string) {
  await reconcileDueAttempts();
  const row = await prisma.commitmentAttempt.findFirst({
    where: { id: attemptId, userId },
    include: { commitment: true, verificationResults: { orderBy: { assessedAt: "desc" }, take: 5 } },
  });
  if (!row) throw notFound("ATTEMPT_NOT_FOUND");
  const risk = await evaluateRiskForAttempt(row.id);
  return serializeAttempt(row, {
    verificationResults: row.verificationResults,
    risk,
  });
}

export async function appendProgress(
  userId: string,
  attemptId: string,
  version: number,
  body: { type: "PROGRESS_SET" | "PROGRESS_INCREMENT"; value: number; unit: string },
) {
  const row = await requireActiveAttempt(userId, attemptId, version);
  if (!unitCompatible(body.unit as never, row.targetUnit)) {
    throw new AppError("UNIT_MISMATCH", "Progress unit must match the attempt target.", 422);
  }
  const next =
    body.type === "PROGRESS_SET"
      ? new Decimal(body.value)
      : row.currentProgressValue.add(new Decimal(body.value));
  const updated = await prisma.$transaction(async (tx) => {
    await tx.attemptProgressEvent.create({
      data: {
        attemptId,
        type: body.type,
        source: "USER",
        value: new Decimal(body.value),
        unit: body.unit as never,
      },
    });
    return tx.commitmentAttempt.update({
      where: { id: attemptId },
      data: {
        currentProgressValue: next,
        lastProgressEventAt: new Date(),
        startedAt: row.startedAt ?? new Date(),
        version: { increment: 1 },
      },
      include: { commitment: true },
    });
  });
  await evaluateRiskForAttempt(attemptId);
  return serializeAttempt(updated);
}

export async function startFocus(userId: string, attemptId: string, version: number) {
  const row = await requireActiveAttempt(userId, attemptId, version);
  if (row.openFocusSessionId) {
    throw conflict("FOCUS_SESSION_ALREADY_OPEN", "Finish the open focus session first.");
  }
  const sessionId = newId();
  const maxEndsAt = new Date(Math.min(row.deadlineAt.getTime(), Date.now() + 4 * 60 * 60 * 1000));
  const updated = await prisma.$transaction(async (tx) => {
    await tx.attemptProgressEvent.create({
      data: {
        attemptId,
        type: "SESSION_STARTED",
        source: "IN_APP",
        sessionId,
      },
    });
    return tx.commitmentAttempt.update({
      where: { id: attemptId },
      data: {
        openFocusSessionId: sessionId,
        startedAt: row.startedAt ?? new Date(),
        version: { increment: 1 },
      },
      include: { commitment: true },
    });
  });
  return {
    sessionId,
    startedAt: new Date().toISOString(),
    maxEndsAt: maxEndsAt.toISOString(),
    attempt: serializeAttempt(updated),
  };
}

export async function finishFocus(userId: string, attemptId: string, sessionId: string, version: number) {
  const row = await prisma.commitmentAttempt.findFirst({
    where: { id: attemptId, userId },
    include: { commitment: true },
  });
  if (!row) throw notFound("ATTEMPT_NOT_FOUND");
  if (row.version !== version) throw versionConflict();
  if (row.openFocusSessionId !== sessionId) throw notFound("FOCUS_SESSION_NOT_FOUND");
  const started = await prisma.attemptProgressEvent.findFirst({
    where: { attemptId, sessionId, type: "SESSION_STARTED" },
    orderBy: { createdAt: "asc" },
  });
  if (!started) throw notFound("FOCUS_SESSION_NOT_FOUND");
  const now = systemClock.now();
  const elapsedMs = Math.max(0, now.getTime() - started.createdAt.getTime());
  const creditedMinutes = Math.floor(elapsedMs / 60000);
  const add = row.targetUnit === "MINUTES" ? new Decimal(creditedMinutes) : new Decimal(0);
  const updated = await prisma.$transaction(async (tx) => {
    await tx.attemptProgressEvent.create({
      data: {
        attemptId,
        type: "SESSION_ENDED",
        source: "IN_APP",
        sessionId,
        value: add,
        unit: row.targetUnit,
        observationLimited: true,
        metadata: { creditedMinutes, limitation: "IN_APP_ELAPSED_TIME_ONLY" },
      },
    });
    return tx.commitmentAttempt.update({
      where: { id: attemptId },
      data: {
        openFocusSessionId: null,
        currentProgressValue: row.currentProgressValue.add(add),
        lastProgressEventAt: now,
        version: { increment: 1 },
      },
      include: { commitment: true },
    });
  });
  if (row.targetUnit === "MINUTES" && progressMeetsTarget(updated.currentProgressValue, row.targetOperator, row.targetValue)) {
    await evaluateAndMaybeResolve(attemptId, {
      source: "IN_APP_SESSION",
      status: "VERIFIED",
      reasonCode: "IN_APP_DURATION_MET",
      reason: "Server-timed in-app elapsed time met the snapshot target.",
      limitations: [{ code: "IN_APP_ONLY", explanation: "Only time spent in the app session was observed." }],
    });
  }
  await evaluateRiskForAttempt(attemptId);
  return {
    sessionId,
    creditedMinutes,
    limitations: ["Only in-app elapsed time was credited."],
    attempt: serializeAttempt(await reloadAttempt(attemptId)),
  };
}

export async function reconcileDueAttempts() {
  const now = systemClock.now();
  const dueActive = await prisma.commitmentAttempt.findMany({
    where: { state: "SCHEDULED", periodStartAt: { lte: now }, deadlineAt: { gt: now } },
  });
  for (const attempt of dueActive) {
    await prisma.commitmentAttempt.update({
      where: { id: attempt.id },
      data: { state: "ACTIVE", startedAt: attempt.startedAt ?? now, version: { increment: 1 } },
    });
  }
  const dueDeadline = await prisma.commitmentAttempt.findMany({
    where: { state: { in: ["SCHEDULED", "ACTIVE"] }, deadlineAt: { lte: now } },
  });
  for (const attempt of dueDeadline) {
    if (attempt.openFocusSessionId) {
      await prisma.attemptProgressEvent.create({
        data: {
          attemptId: attempt.id,
          type: "SESSION_ENDED",
          source: "SYSTEM",
          sessionId: attempt.openFocusSessionId,
          closureReason: "DEADLINE_RECONCILIATION",
          observationLimited: true,
          value: new Decimal(0),
        },
      });
    }
    await prisma.commitmentAttempt.update({
      where: { id: attempt.id },
      data: {
        state: "AWAITING_VERIFICATION",
        openFocusSessionId: null,
        version: { increment: 1 },
      },
    });
  }
  const dueResolve = await prisma.commitmentAttempt.findMany({
    where: { state: "AWAITING_VERIFICATION", graceEndsAt: { lte: now } },
  });
  for (const attempt of dueResolve) {
    await evaluateAndMaybeResolve(attempt.id, null);
  }
}

async function requireActiveAttempt(userId: string, attemptId: string, version: number) {
  const row = await prisma.commitmentAttempt.findFirst({
    where: { id: attemptId, userId },
    include: { commitment: true },
  });
  if (!row) throw notFound("ATTEMPT_NOT_FOUND");
  if (row.version !== version) throw versionConflict();
  if (row.state !== "ACTIVE") {
    throw new AppError("ATTEMPT_NOT_ACTIVE", "Progress can only be recorded on an active attempt.", 409);
  }
  return row;
}

async function reloadAttempt(attemptId: string) {
  return prisma.commitmentAttempt.findUniqueOrThrow({
    where: { id: attemptId },
    include: { commitment: true },
  });
}
