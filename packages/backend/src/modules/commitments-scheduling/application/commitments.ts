import { Decimal } from "@prisma/client/runtime/library";
import type { Prisma } from "@prisma/client";
import type { CreateCommitmentBody, Schedule, Target } from "@commitirl/contracts";
import { prisma } from "../../../platform/db.js";
import { systemClock, type Clock } from "../../../platform/clock.js";
import { AppError, conflict, notFound, validationFailed, versionConflict } from "../../../platform/errors.js";
import { generateHorizon, progressMeetsTarget, unitCompatible } from "../domain/schedule.js";

function dateOnly(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function serializeTarget(target: { operator: string; value: Decimal | number | string; unit: string; label?: string | null }) {
  return {
    operator: target.operator,
    value: Number(target.value),
    unit: target.unit,
    label: target.label ?? undefined,
  };
}

export function serializeCommitment(row: Prisma.CommitmentGetPayload<{ include: { methods: true } }>) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    category: row.category,
    sensitivity: row.sensitivity,
    visibility: row.visibility,
    schedule: {
      cadence: row.cadence,
      weekdays: row.weekdays,
      localStartDate: row.localStartDate.toISOString().slice(0, 10),
      localEndDate: row.localEndDate ? row.localEndDate.toISOString().slice(0, 10) : null,
      localWindowStartTime: row.localWindowStartTime,
      localDeadlineTime: row.localDeadlineTime,
    },
    target: serializeTarget({
      operator: row.targetOperator,
      value: row.targetValue,
      unit: row.targetUnit,
      label: row.targetLabel,
    }),
    timezone: row.timezone,
    status: row.status,
    verificationMethods: row.methods
      .sort((a, b) => a.priority - b.priority)
      .map((m) => ({
        provider: m.provider,
        priority: m.priority,
        configuration: m.configuration,
      })),
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function generateAttemptsForCommitment(commitmentId: string, clock: Clock = systemClock) {
  const commitment = await prisma.commitment.findUnique({
    where: { id: commitmentId },
    include: { methods: true },
  });
  if (!commitment || commitment.status !== "ACTIVE") return [];
  const windows = generateHorizon(
    {
      cadence: commitment.cadence,
      weekdays: commitment.weekdays,
      localStartDate: commitment.localStartDate.toISOString().slice(0, 10),
      localEndDate: commitment.localEndDate ? commitment.localEndDate.toISOString().slice(0, 10) : null,
      localWindowStartTime: commitment.localWindowStartTime,
      localDeadlineTime: commitment.localDeadlineTime,
      timezone: commitment.timezone,
    },
    clock,
  );
  const created = [];
  for (const window of windows) {
    try {
      const attempt = await prisma.commitmentAttempt.create({
        data: {
          userId: commitment.userId,
          commitmentId: commitment.id,
          commitmentVersion: commitment.version,
          periodStartAt: window.periodStartAt,
          deadlineAt: window.deadlineAt,
          graceEndsAt: window.graceEndsAt,
          timezoneSnapshot: commitment.timezone,
          targetOperator: commitment.targetOperator,
          targetValue: commitment.targetValue,
          targetUnit: commitment.targetUnit,
          targetLabel: commitment.targetLabel,
          verificationSnapshot: commitment.methods.map((m) => ({
            provider: m.provider,
            priority: m.priority,
            configuration: m.configuration,
          })),
        },
      });
      created.push(attempt);
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code !== "P2002") throw error;
    }
  }
  return created;
}

export async function createCommitment(userId: string, body: CreateCommitmentBody, requestId: string) {
  validateSchedule(body.schedule);
  if (body.sensitivity === "SENSITIVE" && body.visibility === "SHARE_BY_GRANT") {
    throw validationFailed({ fields: [{ path: "visibility", issue: "Sensitive commitments stay private." }] });
  }
  const created = await prisma.$transaction(async (tx) => {
    const commitment = await tx.commitment.create({
      data: {
        userId,
        title: body.title,
        description: body.description,
        category: body.category,
        sensitivity: body.sensitivity,
        visibility: body.visibility ?? "PRIVATE",
        cadence: body.schedule.cadence,
        weekdays: body.schedule.weekdays ?? [],
        localStartDate: dateOnly(body.schedule.localStartDate),
        localEndDate: body.schedule.localEndDate ? dateOnly(body.schedule.localEndDate) : null,
        localWindowStartTime: body.schedule.localWindowStartTime ?? null,
        localDeadlineTime: body.schedule.localDeadlineTime ?? null,
        timezone: body.timezone,
        targetOperator: body.target.operator,
        targetValue: new Decimal(body.target.value),
        targetUnit: body.target.unit,
        targetLabel: body.target.label,
        methods: {
          create: body.verificationMethods.map((method) => ({
            provider: method.provider,
            priority: method.priority,
            configuration: method.configuration as Prisma.InputJsonValue,
          })),
        },
      },
      include: { methods: true },
    });
    await tx.auditEvent.create({
      data: {
        actorType: "USER",
        actorUserId: userId,
        action: "COMMITMENT_CREATED",
        resourceType: "commitment",
        resourceId: commitment.id,
        result: "SUCCESS",
        requestId,
      },
    });
    return commitment;
  });
  await generateAttemptsForCommitment(created.id);
  return serializeCommitment(created as Prisma.CommitmentGetPayload<{ include: { methods: true } }>);
}

export async function listCommitments(userId: string, status?: string) {
  const rows = await prisma.commitment.findMany({
    where: { userId, ...(status ? { status: status as never } : {}) },
    include: { methods: true },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return rows.map(serializeCommitment);
}

export async function getCommitment(userId: string, commitmentId: string) {
  const row = await prisma.commitment.findFirst({
    where: { id: commitmentId, userId },
    include: { methods: true },
  });
  if (!row) throw notFound("COMMITMENT_NOT_FOUND");
  return serializeCommitment(row);
}

export async function pauseCommitment(userId: string, commitmentId: string, version: number) {
  const row = await prisma.commitment.findFirst({ where: { id: commitmentId, userId }, include: { methods: true } });
  if (!row) throw notFound("COMMITMENT_NOT_FOUND");
  if (row.version !== version) throw versionConflict();
  if (row.status === "PAUSED") throw conflict("ALREADY_PAUSED", "This commitment is already paused.");
  const updated = await prisma.$transaction(async (tx) => {
    const commitment = await tx.commitment.update({
      where: { id: commitmentId },
      data: { status: "PAUSED", version: { increment: 1 } },
      include: { methods: true },
    });
    await tx.commitmentAttempt.updateMany({
      where: { commitmentId, state: "SCHEDULED" },
      data: { state: "CANCELLED" },
    });
    return commitment;
  });
  return serializeCommitment(updated);
}

export async function resumeCommitment(userId: string, commitmentId: string, version: number) {
  const row = await prisma.commitment.findFirst({ where: { id: commitmentId, userId }, include: { methods: true } });
  if (!row) throw notFound("COMMITMENT_NOT_FOUND");
  if (row.version !== version) throw versionConflict();
  if (row.status !== "PAUSED") throw conflict("NOT_PAUSED", "Only a paused commitment can be resumed.");
  const updated = await prisma.commitment.update({
    where: { id: commitmentId },
    data: { status: "ACTIVE", version: { increment: 1 } },
    include: { methods: true },
  });
  await generateAttemptsForCommitment(updated.id);
  return serializeCommitment(updated);
}

export async function archiveCommitment(userId: string, commitmentId: string, version: number) {
  const row = await prisma.commitment.findFirst({ where: { id: commitmentId, userId } });
  if (!row) throw notFound("COMMITMENT_NOT_FOUND");
  if (row.version !== version) throw versionConflict();
  await prisma.$transaction(async (tx) => {
    await tx.commitment.update({
      where: { id: commitmentId },
      data: { status: "ARCHIVED", version: { increment: 1 } },
    });
    await tx.commitmentAttempt.updateMany({
      where: { commitmentId, state: "SCHEDULED" },
      data: { state: "CANCELLED" },
    });
  });
}

function validateSchedule(schedule: Schedule) {
  if (schedule.cadence === "WEEKLY" && (!schedule.weekdays || schedule.weekdays.length === 0)) {
    throw validationFailed({ fields: [{ path: "schedule.weekdays", issue: "Weekly cadence requires weekdays." }] });
  }
  if (
    schedule.localWindowStartTime &&
    schedule.localDeadlineTime &&
    schedule.localDeadlineTime <= schedule.localWindowStartTime
  ) {
    throw validationFailed({
      fields: [{ path: "schedule.localDeadlineTime", issue: "P0 commitments must end on the same local day they start." }],
    });
  }
}

export function recommendVerification(input: { category: string; target: Target; sensitivity: string }) {
  const recommendations = [];
  if (input.target.unit === "MINUTES") {
    recommendations.push({
      provider: "IN_APP_SESSION",
      rank: 1,
      rationale: "A server-timed focus session measures elapsed in-app time for this target.",
      limitations: ["It proves time in the app, not every real-world activity."],
      requiredConnection: null,
    });
  }
  if (input.category === "CODING") {
    recommendations.push({
      provider: "GITHUB_API",
      rank: recommendations.length + 1,
      rationale: "Scoped GitHub activity can support coding commitments when a repository is connected.",
      limitations: ["Only public API-visible activity in the selected scope is observed."],
      requiredConnection: "GITHUB",
    });
  }
  recommendations.push({
    provider: "SELF_REPORT",
    rank: recommendations.length + 1,
    rationale: "A labeled self-report is always available and is never treated as independent proof.",
    limitations: ["Self-report is excluded from evidence-backed reliability metrics."],
    requiredConnection: null,
  });
  return { recommendations, mode: "DETERMINISTIC" as const };
}

export function parseCommitmentText(text: string, timezone: string) {
  const lower = text.toLowerCase();
  let category: CreateCommitmentBody["category"] = "OTHER";
  if (/code|dsa|leetcode|github|commit/.test(lower)) category = "CODING";
  else if (/study|read|learn|lecture/.test(lower)) category = "LEARNING";
  const countMatch = lower.match(/(\d+)\s+(problems?|pages?|reps?|tasks?)/);
  const minuteMatch = lower.match(/(\d+)\s+(minutes?|mins?)/);
  const target: Target = minuteMatch
    ? { operator: "GTE", value: Number(minuteMatch[1]), unit: "MINUTES", label: "minutes" }
    : countMatch
      ? { operator: "GTE", value: Number(countMatch[1]), unit: "COUNT", label: countMatch[2] }
      : { operator: "EQ", value: 1, unit: "BOOLEAN", label: "done" };
  const cadence = /daily|every day/.test(lower) ? "DAILY" : /weekly/.test(lower) ? "WEEKLY" : "ONE_TIME";
  const today = new Date().toISOString().slice(0, 10);
  return {
    proposal: {
      title: text.slice(0, 80),
      category,
      sensitivity: "STANDARD",
      schedule: {
        cadence,
        weekdays: cadence === "WEEKLY" ? ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"] : undefined,
        localStartDate: today,
        localDeadlineTime: "22:00",
      },
      target,
      timezone,
      verificationMethods: recommendVerification({ category, target, sensitivity: "STANDARD" }).recommendations.slice(0, 1).map((r, i) => ({
        provider: r.provider,
        priority: i + 1,
        configuration: {},
      })),
    },
    warnings: ["This is an editable proposal. Confirm every field before saving."],
    mode: "DETERMINISTIC" as const,
  };
}

export { progressMeetsTarget, unitCompatible };
