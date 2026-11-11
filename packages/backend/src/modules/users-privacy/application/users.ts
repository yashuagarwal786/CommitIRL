import type { ServerEnv } from "@commitirl/config";
import { prisma } from "../../../platform/db.js";
import { decryptUtf8, encryptUtf8, maskEmail } from "../../../platform/crypto.js";
import { forbidden, notFound, versionConflict } from "../../../platform/errors.js";

const REQUIRED = ["TERMS_ACCEPTANCE", "PRIVACY_NOTICE_ACK", "ADULT_ELIGIBILITY_ATTESTATION"] as const;

export async function getMe(env: ServerEnv, userId: string) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    include: { consents: { orderBy: { capturedAt: "desc" } }, preferences: true },
  });
  const email = decryptUtf8(user.emailCiphertext, env.DATA_ENCRYPTION_KEY);
  const name = user.displayNameCiphertext
    ? decryptUtf8(user.displayNameCiphertext, env.DATA_ENCRYPTION_KEY)
    : null;
  const current = currentConsents(user.consents);
  const onboarded = REQUIRED.every((type) => current[type] === "GRANTED");
  return {
    id: user.id,
    emailDisplay: maskEmail(email),
    name,
    timezone: user.timezone,
    locale: user.locale,
    accountStatus: user.accountStatus,
    onboarded,
    version: user.version,
    createdAt: user.createdAt.toISOString(),
  };
}

export async function patchMe(
  env: ServerEnv,
  userId: string,
  version: number,
  body: { name?: string | null; timezone?: string; locale?: string },
) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (user.version !== version) throw versionConflict();
  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      version: { increment: 1 },
      timezone: body.timezone ?? user.timezone,
      locale: body.locale ?? user.locale,
      displayNameCiphertext:
        body.name === undefined
          ? user.displayNameCiphertext
          : body.name
            ? encryptUtf8(body.name, env.DATA_ENCRYPTION_KEY)
            : null,
      displayNameKeyVersion: body.name === undefined ? user.displayNameKeyVersion : body.name ? 1 : null,
    },
  });
  return getMe(env, updated.id);
}

export async function completeOnboarding(
  env: ServerEnv,
  userId: string,
  requestId: string,
  body: {
    timezone: string;
    locale: string;
    name?: string;
    policyVersion: string;
  },
) {
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: {
        timezone: body.timezone,
        locale: body.locale,
        onboardedAt: new Date(),
        displayNameCiphertext: body.name ? encryptUtf8(body.name, env.DATA_ENCRYPTION_KEY) : undefined,
        displayNameKeyVersion: body.name ? 1 : undefined,
        version: { increment: 1 },
      },
    });
    for (const type of REQUIRED) {
      await tx.consentRecord.upsert({
        where: { idempotencyKey: `${userId}:${type}:${body.policyVersion}:onboarding` },
        update: {},
        create: {
          userId,
          consentType: type,
          decision: "GRANTED",
          policyVersion: body.policyVersion,
          captureSource: "ONBOARDING",
          requestId,
          idempotencyKey: `${userId}:${type}:${body.policyVersion}:onboarding`,
        },
      });
    }
  });
  return getMe(env, userId);
}

export async function requireOnboarded(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { accountStatus: true },
  });
  if (user.accountStatus === "PENDING_DELETION") {
    throw forbidden("ACCOUNT_PENDING_DELETION", "Cancel the pending deletion request to resume product activity.");
  }
  const consents = await prisma.consentRecord.findMany({
    where: { userId },
    orderBy: { capturedAt: "desc" },
  });
  const current = currentConsents(consents);
  const missing = REQUIRED.filter((type) => current[type] !== "GRANTED");
  if (missing.length) {
    throw forbidden("ONBOARDING_REQUIRED", "Finish onboarding before using the product.");
  }
}

export async function requestAccountDeletion(userId: string, version: number) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (user.version !== version) throw versionConflict();
  if (user.accountStatus === "PENDING_DELETION") {
    throw forbidden("DELETION_ALREADY_REQUESTED", "Account deletion has already been requested.");
  }
  const recoveryEndsAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  return prisma.$transaction(async (tx) => {
    const request = await tx.accountDeletionRequest.create({
      data: { userId, recoveryEndsAt },
    });
    const updated = await tx.user.update({
      where: { id: userId },
      data: {
        accountStatus: "PENDING_DELETION",
        deletionRequestedAt: new Date(),
        scheduledPurgeAt: recoveryEndsAt,
        version: { increment: 1 },
      },
    });
    return {
      deletionRequestId: request.id,
      status: request.status,
      accountStatus: updated.accountStatus,
      recoveryEndsAt: recoveryEndsAt.toISOString(),
      version: updated.version,
    };
  });
}

export async function cancelAccountDeletion(userId: string, requestId: string, version: number) {
  const request = await prisma.accountDeletionRequest.findFirst({ where: { id: requestId, userId } });
  if (!request) throw notFound("DELETION_REQUEST_NOT_FOUND");
  if (request.status !== "REQUESTED") throw forbidden("DELETION_ALREADY_EXECUTED", "This deletion request cannot be cancelled.");
  if (request.recoveryEndsAt <= new Date()) throw forbidden("RECOVERY_WINDOW_EXPIRED", "The recovery window has expired.");
  if (request.version !== version) throw versionConflict();
  return prisma.$transaction(async (tx) => {
    const cancelledAt = new Date();
    const updatedRequest = await tx.accountDeletionRequest.update({
      where: { id: request.id },
      data: { status: "CANCELLED", version: { increment: 1 } },
    });
    const user = await tx.user.update({
      where: { id: userId },
      data: {
        accountStatus: "ACTIVE",
        deletionRequestedAt: null,
        scheduledPurgeAt: null,
        version: { increment: 1 },
      },
    });
    return {
      deletionRequestId: updatedRequest.id,
      status: updatedRequest.status,
      accountStatus: user.accountStatus,
      cancelledAt: cancelledAt.toISOString(),
      version: user.version,
    };
  });
}

export async function getPreferences(userId: string) {
  const prefs = await prisma.userPreference.findUnique({ where: { userId } });
  if (!prefs) throw notFound("PREFERENCES_NOT_FOUND");
  return {
    quietHours: {
      start: prefs.quietHoursStart ? prefs.quietHoursStart.toISOString().slice(11, 16) : null,
      end: prefs.quietHoursEnd ? prefs.quietHoursEnd.toISOString().slice(11, 16) : null,
    },
    inAppInterventionsEnabled: prefs.inAppInterventionsEnabled,
    emailInterventionsEnabled: false,
    behaviorInsightsEnabled: prefs.behaviorInsightsEnabled,
    aiPersonalizationEnabled: prefs.aiPersonalizationEnabled,
    weekStartsOn: prefs.weekStartsOn,
    version: prefs.version,
  };
}

function currentConsents(rows: Array<{ consentType: string; decision: string }>) {
  const map: Record<string, string> = {};
  for (const row of rows) {
    if (!map[row.consentType]) map[row.consentType] = row.decision;
  }
  return map;
}
