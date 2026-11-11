import { prisma } from "../../../platform/db.js";

export async function recomputeInsights(userId: string) {
  const resolved = await prisma.commitmentAttempt.findMany({
    where: { userId, state: "RESOLVED" },
    orderBy: { deadlineAt: "desc" },
    take: 90,
  });
  const determinate = resolved.filter((r) => r.outcome === "COMPLETED" || r.outcome === "MISSED");
  const completed = determinate.filter((r) => r.outcome === "COMPLETED").length;
  const missed = determinate.filter((r) => r.outcome === "MISSED").length;
  const uncertain = resolved.filter((r) => r.outcome === "UNCERTAIN").length;
  const n = determinate.length;
  const stage = n < 5 ? "BUILDING_BASELINE" : n < 12 ? "EARLY_SIGNAL" : "PERSONALIZED";
  const rate = n === 0 ? null : completed / n;
  const coverage = resolved.length === 0 ? null : determinate.length / resolved.length;
  const statement =
    stage === "BUILDING_BASELINE"
      ? `Building your baseline. ${resolved.length} resolved attempts so far; personalized claims wait until 5 comparable outcomes.`
      : `In this window, ${completed} of ${n} determinate attempts completed (${Math.round((rate ?? 0) * 100)}%). Uncertain outcomes (${uncertain}) are shown separately and are not counted as misses.`;
  const action =
    stage === "BUILDING_BASELINE"
      ? "Keep recording evidence on the next few attempts so patterns can be described honestly."
      : missed > completed
        ? "Consider a smaller target or an earlier deadline on your next similar commitment."
        : "Protect the conditions that already work: same weekday window and a start event before the halfway mark.";
  await prisma.behaviorInsight.create({
    data: {
      userId,
      type: "OUTCOME_SUMMARY",
      statement,
      sampleSize: n,
      windowStartAt: resolved.at(-1)?.periodStartAt ?? new Date(),
      windowEndAt: new Date(),
      action,
      stage,
      calculationVersion: "behavior-v1",
      limitations: [
        { code: "DETERMINATE_ONLY", explanation: "Completion rate uses COMPLETED + MISSED only." },
        { code: "UNCERTAIN_EXCLUDED", explanation: "Uncertain and cancelled attempts are excluded from the rate denominator." },
      ],
    },
  });
  return {
    sampleSize: n,
    resolvedCount: resolved.length,
    completedCount: completed,
    missedCount: missed,
    uncertainCount: uncertain,
    determinationCoverage: coverage,
    completionRate: rate,
    baselineStage: stage,
    generatedAt: new Date().toISOString(),
  };
}

export async function getBehaviorSummary(userId: string) {
  const latest = await prisma.behaviorInsight.findFirst({
    where: { userId, type: "OUTCOME_SUMMARY" },
    orderBy: { createdAt: "desc" },
  });
  if (!latest) return recomputeInsights(userId);
  return {
    sampleSize: latest.sampleSize,
    baselineStage: latest.stage,
    statement: latest.statement,
    action: latest.action,
    window: { from: latest.windowStartAt.toISOString(), to: latest.windowEndAt.toISOString() },
    generatedAt: latest.createdAt.toISOString(),
  };
}

export async function listInsights(userId: string) {
  const rows = await prisma.behaviorInsight.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 25,
  });
  return rows.map((row) => ({
    id: row.id,
    type: row.type,
    statement: row.statement,
    sampleSize: row.sampleSize,
    window: { from: row.windowStartAt.toISOString(), to: row.windowEndAt.toISOString() },
    action: row.action,
    stage: row.stage,
    calculationVersion: row.calculationVersion,
    limitations: row.limitations,
  }));
}
