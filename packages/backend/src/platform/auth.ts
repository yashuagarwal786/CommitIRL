import { SignJWT, jwtVerify } from "jose";
import type { ServerEnv } from "@commitirl/config";
import { prisma } from "./db.js";
import { decryptUtf8, encryptUtf8, lookupHash, newId, normalizeEmail } from "./crypto.js";
import { AppError, unauthenticated } from "./errors.js";

export interface AuthContext {
  userId: string;
  provider: string;
  subject: string;
  email: string;
  accountStatus: string;
}

export async function issueDevToken(env: ServerEnv, email: string, displayName?: string): Promise<{ token: string; userId: string }> {
  const normalized = normalizeEmail(email);
  const hash = lookupHash(normalized, env.LOOKUP_HMAC_KEY);
  const existing = await prisma.user.findUnique({ where: { emailHash: hash } });
  let userId = existing?.id;
  if (!userId) {
    const createdUserId = newId();
    userId = createdUserId;
    await prisma.$transaction(async (tx) => {
      await tx.user.create({
        data: {
          id: createdUserId,
          emailCiphertext: encryptUtf8(normalized, env.DATA_ENCRYPTION_KEY),
          emailHash: hash,
          emailKeyVersion: 1,
          displayNameCiphertext: displayName ? encryptUtf8(displayName, env.DATA_ENCRYPTION_KEY) : null,
          displayNameKeyVersion: displayName ? 1 : null,
          timezone: "UTC",
          locale: "en",
        },
      });
      await tx.userPreference.create({ data: { userId: createdUserId } });
      await tx.authIdentity.create({
        data: {
          userId: createdUserId,
          provider: "DEV",
          providerSubject: `dev:${normalized}`,
        },
      });
    });
  } else {
    await prisma.authIdentity.updateMany({
      where: { userId, provider: "DEV" },
      data: { lastSeenAt: new Date() },
    });
  }
  const token = await new SignJWT({ email: normalized })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(`dev:${normalized}`)
    .setIssuer("commitirl-dev")
    .setAudience("commitirl")
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(new TextEncoder().encode(env.DEV_JWT_SECRET));
  return { token, userId: userId! };
}

export async function authenticateBearer(env: ServerEnv, header: string | undefined): Promise<AuthContext> {
  if (!header?.startsWith("Bearer ")) {
    throw unauthenticated();
  }
  const token = header.slice("Bearer ".length);
  if (env.AUTH_MODE === "dev") {
    try {
      const { payload } = await jwtVerify(token, new TextEncoder().encode(env.DEV_JWT_SECRET), {
        issuer: "commitirl-dev",
        audience: "commitirl",
      });
      const subject = String(payload.sub ?? "");
      const identity = await prisma.authIdentity.findUnique({
        where: { provider_providerSubject: { provider: "DEV", providerSubject: subject } },
        include: { user: true },
      });
      if (!identity || identity.user.accountStatus === "SUSPENDED") {
        throw unauthenticated("Identity is not synced.");
      }
      const email = decryptUtf8(identity.user.emailCiphertext, env.DATA_ENCRYPTION_KEY);
      return {
        userId: identity.userId,
        provider: "DEV",
        subject,
        email,
        accountStatus: identity.user.accountStatus,
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw unauthenticated();
    }
  }
  throw new AppError("AUTH_MODE_UNSUPPORTED", "Clerk mode is not configured in this environment.", 503);
}
