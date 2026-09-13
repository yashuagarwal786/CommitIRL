import { Router, type Request, type Response, type NextFunction } from "express";
import {
  completeOnboardingBodySchema,
  createCommitmentBodySchema,
  createConsentBodySchema,
  devSessionBodySchema,
  finishFocusBodySchema,
  interventionEventBodySchema,
  parseCommitmentBodySchema,
  patchMeBodySchema,
  patchPreferencesBodySchema,
  pauseCommitmentBodySchema,
  progressEventBodySchema,
  recommendVerificationBodySchema,
  resumeCommitmentBodySchema,
  selfReportBodySchema,
  startFocusBodySchema,
} from "@commitirl/contracts";
import type { ServerEnv } from "@commitirl/config";
import { authenticateBearer, issueDevToken } from "../platform/auth.js";
import { AppError, unauthenticated, validationFailed } from "../platform/errors.js";
import { withIdempotency } from "../platform/idempotency.js";
import { completeOnboarding, getMe, getPreferences, patchMe, requireOnboarded } from "../modules/users-privacy/application/users.js";
import {
  archiveCommitment,
  createCommitment,
  getCommitment,
  listCommitments,
  parseCommitmentText,
  pauseCommitment,
  recommendVerification,
  resumeCommitment,
} from "../modules/commitments-scheduling/application/commitments.js";
import {
  appendProgress,
  finishFocus,
  getAttempt,
  listAttempts,
  startFocus,
} from "../modules/attempts-progress/application/attempts.js";
import { submitSelfReport } from "../modules/verification/application/resolve.js";
import { getBehaviorSummary, listInsights } from "../modules/behavior/application/insights.js";
import { listInterventions, recordInterventionEvent } from "../modules/interventions-notifications/application/interventions.js";
import { prisma } from "../platform/db.js";
import { pingDatabase } from "../platform/db.js";

function parseIfMatch(header: string | undefined): number {
  if (!header) throw new AppError("VERSION_CONFLICT", "If-Match version is required.", 412);
  const value = header.replaceAll('"', "");
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) throw new AppError("VERSION_CONFLICT", "If-Match version is invalid.", 412);
  return n;
}

async function requireUser(req: Request, env: ServerEnv) {
  const ctx = await authenticateBearer(env, req.header("authorization"));
  req.auth = ctx;
  return ctx;
}

export function createApiRouter(env: ServerEnv): Router {
  const router = Router();

  router.get("/healthz", async (_req, res) => {
    res.json({ data: { status: "ok" } });
  });
  router.get("/readyz", async (_req, res, next) => {
    try {
      await pingDatabase();
      res.json({ data: { status: "ready" } });
    } catch (error) {
      next(error);
    }
  });

  if (env.AUTH_MODE === "dev") {
    router.post("/v1/dev/session", async (req, res, next) => {
      try {
        const body = devSessionBodySchema.parse(req.body);
        const session = await issueDevToken(env, body.email, body.displayName);
        res.status(201).json({ data: { token: session.token, tokenType: "Bearer" } });
      } catch (error) {
        next(error);
      }
    });
  }

  router.get("/v1/me", async (req, res, next) => {
    try {
      const ctx = await requireUser(req, env);
      res.json({ data: await getMe(env, ctx.userId) });
    } catch (error) {
      next(error);
    }
  });

  router.patch("/v1/me", async (req, res, next) => {
    try {
      const ctx = await requireUser(req, env);
      const body = patchMeBodySchema.parse(req.body);
      res.json({ data: await patchMe(env, ctx.userId, parseIfMatch(req.header("if-match")), body) });
    } catch (error) {
      next(error);
    }
  });

  router.post("/v1/me/onboarding", async (req, res, next) => {
    try {
      const ctx = await requireUser(req, env);
      const body = completeOnboardingBodySchema.parse(req.body);
      const result = await withIdempotency(ctx.userId, req.header("idempotency-key"), "POST", "/v1/me/onboarding", body, async () => ({
        status: 200,
        body: { data: await completeOnboarding(env, ctx.userId, String(req.requestId), body) },
      }));
      res.status(result.status).json(result.body);
    } catch (error) {
      next(error);
    }
  });

  router.get("/v1/me/preferences", async (req, res, next) => {
    try {
      const ctx = await requireUser(req, env);
      res.json({ data: await getPreferences(ctx.userId) });
    } catch (error) {
      next(error);
    }
  });

  router.patch("/v1/me/preferences", async (req, res, next) => {
    try {
      const ctx = await requireUser(req, env);
      const body = patchPreferencesBodySchema.parse(req.body);
      const version = parseIfMatch(req.header("if-match"));
      const prefs = await prisma.userPreference.findUniqueOrThrow({ where: { userId: ctx.userId } });
      if (prefs.version !== version) throw versionConflictSafe();
      const updated = await prisma.userPreference.update({
        where: { userId: ctx.userId },
        data: {
          version: { increment: 1 },
          inAppInterventionsEnabled: body.inAppInterventionsEnabled ?? prefs.inAppInterventionsEnabled,
          behaviorInsightsEnabled: body.behaviorInsightsEnabled ?? prefs.behaviorInsightsEnabled,
          aiPersonalizationEnabled: body.aiPersonalizationEnabled ?? prefs.aiPersonalizationEnabled,
          weekStartsOn: body.weekStartsOn ?? prefs.weekStartsOn,
        },
      });
      res.json({ data: await getPreferences(updated.userId) });
    } catch (error) {
      next(error);
    }
  });

  router.post("/v1/commitment-parses", async (req, res, next) => {
    try {
      const ctx = await requireUser(req, env);
      await requireOnboarded(ctx.userId);
      const body = parseCommitmentBodySchema.parse(req.body);
      res.json({ data: parseCommitmentText(body.text, body.timezone) });
    } catch (error) {
      next(error);
    }
  });

  router.post("/v1/verification-recommendations", async (req, res, next) => {
    try {
      const ctx = await requireUser(req, env);
      await requireOnboarded(ctx.userId);
      const body = recommendVerificationBodySchema.parse(req.body);
      res.json({ data: recommendVerification(body) });
    } catch (error) {
      next(error);
    }
  });

  router.get("/v1/commitments", async (req, res, next) => {
    try {
      const ctx = await requireUser(req, env);
      await requireOnboarded(ctx.userId);
      const data = await listCommitments(ctx.userId, typeof req.query.status === "string" ? req.query.status : undefined);
      res.json({ data, meta: { nextCursor: null, hasMore: false } });
    } catch (error) {
      next(error);
    }
  });

  router.post("/v1/commitments", async (req, res, next) => {
    try {
      const ctx = await requireUser(req, env);
      await requireOnboarded(ctx.userId);
      const body = createCommitmentBodySchema.parse(req.body);
      const result = await withIdempotency(ctx.userId, req.header("idempotency-key"), "POST", "/v1/commitments", body, async () => ({
        status: 201,
        body: { data: await createCommitment(ctx.userId, body, String(req.requestId)) },
      }));
      res.status(result.status).json(result.body);
    } catch (error) {
      next(error);
    }
  });

  router.get("/v1/commitments/:commitmentId", async (req, res, next) => {
    try {
      const ctx = await requireUser(req, env);
      res.json({ data: await getCommitment(ctx.userId, req.params.commitmentId!) });
    } catch (error) {
      next(error);
    }
  });

  router.post("/v1/commitments/:commitmentId/pause", async (req, res, next) => {
    try {
      const ctx = await requireUser(req, env);
      pauseCommitmentBodySchema.parse(req.body ?? {});
      const data = await pauseCommitment(ctx.userId, req.params.commitmentId!, parseIfMatch(req.header("if-match")));
      res.json({ data: { commitment: data, cancelledAttemptIds: [] } });
    } catch (error) {
      next(error);
    }
  });

  router.post("/v1/commitments/:commitmentId/resume", async (req, res, next) => {
    try {
      const ctx = await requireUser(req, env);
      resumeCommitmentBodySchema.parse(req.body ?? {});
      res.json({ data: await resumeCommitment(ctx.userId, req.params.commitmentId!, parseIfMatch(req.header("if-match"))) });
    } catch (error) {
      next(error);
    }
  });

  router.delete("/v1/commitments/:commitmentId", async (req, res, next) => {
    try {
      const ctx = await requireUser(req, env);
      await archiveCommitment(ctx.userId, req.params.commitmentId!, parseIfMatch(req.header("if-match")));
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  router.get("/v1/attempts", async (req, res, next) => {
    try {
      const ctx = await requireUser(req, env);
      await requireOnboarded(ctx.userId);
      const data = await listAttempts(ctx.userId, {
        state: typeof req.query.state === "string" ? req.query.state : undefined,
        commitmentId: typeof req.query.commitmentId === "string" ? req.query.commitmentId : undefined,
      });
      res.json({ data, meta: { nextCursor: null, hasMore: false } });
    } catch (error) {
      next(error);
    }
  });

  router.get("/v1/attempts/:attemptId", async (req, res, next) => {
    try {
      const ctx = await requireUser(req, env);
      res.json({ data: await getAttempt(ctx.userId, req.params.attemptId!) });
    } catch (error) {
      next(error);
    }
  });

  router.post("/v1/attempts/:attemptId/progress-events", async (req, res, next) => {
    try {
      const ctx = await requireUser(req, env);
      const body = progressEventBodySchema.parse(req.body);
      const version = parseIfMatch(req.header("if-match"));
      const result = await withIdempotency(
        ctx.userId,
        req.header("idempotency-key"),
        "POST",
        req.path,
        body,
        async () => ({
          status: 201,
          body: { data: await appendProgress(ctx.userId, req.params.attemptId!, version, body) },
        }),
      );
      res.status(result.status).json(result.body);
    } catch (error) {
      next(error);
    }
  });

  router.post("/v1/attempts/:attemptId/focus-sessions", async (req, res, next) => {
    try {
      const ctx = await requireUser(req, env);
      startFocusBodySchema.parse(req.body ?? {});
      const data = await startFocus(ctx.userId, req.params.attemptId!, parseIfMatch(req.header("if-match")));
      res.status(201).json({ data });
    } catch (error) {
      next(error);
    }
  });

  router.post("/v1/attempts/:attemptId/focus-sessions/:sessionId/finish", async (req, res, next) => {
    try {
      const ctx = await requireUser(req, env);
      finishFocusBodySchema.parse(req.body ?? {});
      const data = await finishFocus(
        ctx.userId,
        req.params.attemptId!,
        req.params.sessionId!,
        parseIfMatch(req.header("if-match")),
      );
      res.json({ data });
    } catch (error) {
      next(error);
    }
  });

  router.post("/v1/attempts/:attemptId/self-reports", async (req, res, next) => {
    try {
      const ctx = await requireUser(req, env);
      const body = selfReportBodySchema.parse(req.body);
      const data = await submitSelfReport(
        ctx.userId,
        req.params.attemptId!,
        parseIfMatch(req.header("if-match")),
        body.choice,
      );
      res.status(201).json({ data });
    } catch (error) {
      next(error);
    }
  });

  router.get("/v1/analytics/behavior-summary", async (req, res, next) => {
    try {
      const ctx = await requireUser(req, env);
      res.json({ data: await getBehaviorSummary(ctx.userId) });
    } catch (error) {
      next(error);
    }
  });

  router.get("/v1/behavior-insights", async (req, res, next) => {
    try {
      const ctx = await requireUser(req, env);
      const data = await listInsights(ctx.userId);
      res.json({ data, meta: { nextCursor: null, hasMore: false } });
    } catch (error) {
      next(error);
    }
  });

  router.get("/v1/me/interventions", async (req, res, next) => {
    try {
      const ctx = await requireUser(req, env);
      const data = await listInterventions(ctx.userId);
      res.json({ data, meta: { nextCursor: null, hasMore: false } });
    } catch (error) {
      next(error);
    }
  });

  router.post("/v1/interventions/:interventionId/events", async (req, res, next) => {
    try {
      const ctx = await requireUser(req, env);
      const body = interventionEventBodySchema.parse(req.body);
      const data = await recordInterventionEvent(ctx.userId, req.params.interventionId!, body.type, body.reasonCode);
      if (!data) throw new AppError("INTERVENTION_NOT_FOUND", "Intervention was not found.", 404);
      res.status(201).json({ data });
    } catch (error) {
      next(error);
    }
  });

  void createConsentBodySchema;
  return router;
}

function versionConflictSafe() {
  return new AppError("VERSION_CONFLICT", "This record changed. Refresh and try again.", 412);
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (err && typeof err === "object" && "issues" in err) {
    res.status(422).json({
      error: {
        code: "VALIDATION_FAILED",
        message: "The request could not be accepted.",
        details: err,
        requestId: req.requestId,
      },
    });
    return;
  }
  if (err instanceof AppError) {
    res.status(err.status).json({
      error: { code: err.code, message: err.message, details: err.details, requestId: req.requestId },
    });
    return;
  }
  res.status(500).json({
    error: {
      code: "INTERNAL_ERROR",
      message: "Something went wrong. Try again.",
      requestId: req.requestId,
    },
  });
}

export { unauthenticated, validationFailed };
