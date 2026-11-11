import type { Prisma } from "@prisma/client";
import { prisma } from "../../../platform/db.js";
import { maybeCreateIntervention } from "../../interventions-notifications/application/interventions.js";

const WEIGHTS = {
  NO_PROGRESS_AFTER_HALF: 30,
  LOW_TIME_REMAINING: 25,
  LATE_NOT_STARTED: 15,
  RECENT_MISSES: 15,
  HIGH_ACTIVE_LOAD: 10,
} as const;

export async function evaluateRiskForAttempt(attemptId: string) {
  const attempt = await prisma.commitmentAttempt.findUnique({
    where: { id: attemptId },
    include: { commitment: true },
  });
  if (!attempt || attempt.state === "CANCELLED" || attempt.state === "RESOLVED") return null;
  const now = Date.now();
  const start = attempt.periodStartAt.getTime();
  const end = attempt.deadlineAt.getTime();
  const duration = Math.max(1, end - start);
  const elapsedPct = Math.min(100, Math.max(0, ((now - start) / duration) * 100));
  const remainingMinutes = Math.max(0, (end - now) / 60000);
  const factors: Array<{ code: string; weight: number; observedValue: Record<string, unknown> }> = [];

  if (Number(attempt.currentProgressValue) === 0 && elapsedPct >= 50) {
    factors.push({
      code: "NO_PROGRESS_AFTER_HALF",
      weight: WEIGHTS.NO_PROGRESS_AFTER_HALF,
      observedValue: { progress: 0, windowElapsedPct: Math.round(elapsedPct) },
    });
  }
  const remainingThreshold = Math.min(120, duration / 60000 * 0.2);
  if (Number(attempt.currentProgressValue) < Number(attempt.targetValue) && remainingMinutes <= remainingThreshold) {
    factors.push({
      code: "LOW_TIME_REMAINING",
      weight: WEIGHTS.LOW_TIME_REMAINING,
      observedValue: { remainingMinutes: Math.round(remainingMinutes), thresholdMinutes: Math.round(remainingThreshold) },
    });
  }
  if (!attempt.startedAt && !attempt.lastProgressEventAt && elapsedPct >= 70) {
    factors.push({
      code: "LATE_NOT_STARTED",
      weight: WEIGHTS.LATE_NOT_STARTED,
      observedValue: { windowElapsedPct: Math.round(elapsedPct), started: false },
    });
  }
  const recent = await prisma.commitmentAttempt.findMany({
    where: {
      userId: attempt.userId,
      state: "RESOLVED",
      outcome: { in: ["COMPLETED", "MISSED"] },
    },
    orderBy: { resolvedAt: "desc" },
    take: 5,
  });
  const missed = recent.filter((r) => r.outcome === "MISSED").length;
  if (recent.length >= 5 && missed >= 2) {
    factors.push({
      code: "RECENT_MISSES",
      weight: WEIGHTS.RECENT_MISSES,
      observedValue: { missed, sample: recent.length },
    });
  }
  const activeLoad = await prisma.commitmentAttempt.count({
    where: { userId: attempt.userId, state: "ACTIVE" },
  });
  if (activeLoad > 3) {
    factors.push({
      code: "HIGH_ACTIVE_LOAD",
      weight: WEIGHTS.HIGH_ACTIVE_LOAD,
      observedValue: { activeAttempts: activeLoad },
    });
  }
  const score = Math.min(100, factors.reduce((sum, f) => sum + f.weight, 0));
  const level = score >= 75 ? "CRITICAL" : score >= 50 ? "HIGH" : score >= 25 ? "MEDIUM" : "LOW";
  const dataTier = recent.length >= 12 ? "PERSONALIZED" : recent.length >= 5 ? "EARLY_SIGNAL" : "BASELINE";
  const previous = await prisma.riskSnapshot.findFirst({
    where: { attemptId },
    orderBy: { calculatedAt: "desc" },
  });
  const snapshot =
    previous &&
    previous.score === score &&
    previous.level === level &&
    Date.now() - previous.calculatedAt.getTime() < 2 * 60 * 1000
      ? previous
      : await prisma.riskSnapshot.create({
          data: {
            attemptId,
            score,
            level,
            factors: factors as Prisma.InputJsonValue,
            dataTier,
            comparableSampleSize: recent.length,
            algorithmVersion: "risk-v1",
          },
        });
  if (level === "HIGH" || level === "CRITICAL") {
    await maybeCreateIntervention(attemptId);
  }
  return {
    id: snapshot.id,
    score,
    level,
    factors,
    dataTier,
    comparableSampleSize: recent.length,
    algorithmVersion: "risk-v1",
    calculatedAt: snapshot.calculatedAt.toISOString(),
  };
}
