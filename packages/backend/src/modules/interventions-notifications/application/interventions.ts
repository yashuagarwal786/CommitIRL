import { prisma } from "../../../platform/db.js";

export async function maybeCreateIntervention(attemptId: string) {
  const attempt = await prisma.commitmentAttempt.findUnique({
    where: { id: attemptId },
    include: {
      riskSnapshots: { orderBy: { calculatedAt: "desc" }, take: 1 },
      user: { include: { preferences: true } },
    },
  });
  if (!attempt || attempt.state !== "ACTIVE") return null;
  const prefs = attempt.user.preferences;
  if (prefs && !prefs.inAppInterventionsEnabled) return null;
  if (prefs?.quietHoursStart && prefs.quietHoursEnd && isWithinQuietHours(
    new Date(),
    attempt.user.timezone,
    prefs.quietHoursStart,
    prefs.quietHoursEnd,
  )) return null;
  const latest = attempt.riskSnapshots[0];
  if (!latest || (latest.level !== "HIGH" && latest.level !== "CRITICAL")) return null;
  const existing = await prisma.intervention.count({ where: { attemptId } });
  if (existing >= 2) return null;
  const last = await prisma.intervention.findFirst({
    where: { attemptId },
    orderBy: { deliverAt: "desc" },
  });
  const now = new Date();
  if (last && now.getTime() - last.deliverAt.getTime() < 4 * 60 * 60 * 1000) return null;
  const remainingMs = attempt.deadlineAt.getTime() - now.getTime();
  if (remainingMs < 5 * 60 * 1000) return null;
  const action =
    attempt.targetUnit === "MINUTES"
      ? { type: "START_FOCUS_SESSION", label: "Start a focus session" }
      : { type: "RECORD_PROGRESS", label: "Record one increment" };
  const message =
    latest.level === "CRITICAL"
      ? "Time is short. Take one small step now — the outcome can still change."
      : "This attempt is at risk. Start the smallest next action before the deadline.";
  return prisma.intervention.create({
    data: {
      userId: attempt.userId,
      attemptId,
      riskSnapshotId: latest.id,
      ordinal: existing + 1,
      status: "DELIVERED",
      message,
      actionType: action.type,
      actionLabel: action.label,
      generator: "DETERMINISTIC",
      deliverAt: now,
      expiresAt: attempt.deadlineAt,
    },
  });
}

export function isWithinQuietHours(now: Date, timezone: string, start: Date, end: Date) {
  const localTime = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(now);
  const startTime = start.toISOString().slice(11, 16);
  const endTime = end.toISOString().slice(11, 16);
  return startTime < endTime
    ? localTime >= startTime && localTime < endTime
    : localTime >= startTime || localTime < endTime;
}

export async function listInterventions(userId: string) {
  const rows = await prisma.intervention.findMany({
    where: { userId, status: { in: ["DELIVERED", "SHOWN"] } },
    orderBy: { deliverAt: "desc" },
    take: 20,
  });
  return rows.map(serializeIntervention);
}

export async function recordInterventionEvent(
  userId: string,
  interventionId: string,
  type: "SHOWN" | "CLICKED" | "ACTIONED" | "DISMISSED" | "HELPFUL" | "NOT_HELPFUL",
  reasonCode?: string,
) {
  const row = await prisma.intervention.findFirst({ where: { id: interventionId, userId } });
  if (!row) return null;
  const event = await prisma.interventionEvent.create({
    data: { interventionId, type, reasonCode },
  });
  if (type === "SHOWN" && row.status === "DELIVERED") {
    await prisma.intervention.update({ where: { id: interventionId }, data: { status: "SHOWN" } });
  }
  if (type === "DISMISSED") {
    await prisma.intervention.update({ where: { id: interventionId }, data: { status: "EXPIRED" } });
  }
  return { eventId: event.id, type, reasonCode, recordedAt: event.occurredAt.toISOString() };
}

export function serializeIntervention(row: {
  id: string;
  attemptId: string;
  ordinal: number;
  status: string;
  message: string;
  actionType: string;
  actionLabel: string;
  generator: string;
  deliverAt: Date;
  expiresAt: Date;
  createdAt: Date;
  riskSnapshotId: string;
}) {
  return {
    id: row.id,
    attemptId: row.attemptId,
    ordinal: row.ordinal,
    status: row.status,
    message: row.message,
    actionLabel: row.actionLabel,
    action: { type: row.actionType, label: row.actionLabel },
    generator: row.generator,
    deliverAt: row.deliverAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    riskSnapshotId: row.riskSnapshotId,
    createdAt: row.createdAt.toISOString(),
  };
}
