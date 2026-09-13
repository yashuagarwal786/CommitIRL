import { createHash } from "node:crypto";
import { prisma } from "../platform/db.js";
import { conflict } from "../platform/errors.js";

export async function withIdempotency<T>(
  userId: string,
  key: string | undefined,
  method: string,
  route: string,
  rawBody: unknown,
  run: () => Promise<{ status: number; body: T }>,
): Promise<{ status: number; body: T; replay: boolean }> {
  if (!key) {
    const result = await run();
    return { ...result, replay: false };
  }
  const requestHash = createHash("sha256").update(JSON.stringify(rawBody ?? {})).digest("hex");
  const existing = await prisma.idempotencyRecord.findUnique({
    where: { userId_key_method_route: { userId, key, method, route } },
  });
  if (existing) {
    if (existing.requestHash !== requestHash) {
      throw conflict("IDEMPOTENCY_KEY_REUSED", "This idempotency key was already used with a different request.");
    }
    if (existing.status === "COMPLETED" && existing.responseBody) {
      return { status: existing.responseStatus ?? 200, body: existing.responseBody as T, replay: true };
    }
  } else {
    await prisma.idempotencyRecord.create({
      data: {
        userId,
        key,
        method,
        route,
        requestHash,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });
  }
  const result = await run();
  await prisma.idempotencyRecord.update({
    where: { userId_key_method_route: { userId, key, method, route } },
    data: {
      status: "COMPLETED",
      responseStatus: result.status,
      responseBody: result.body as object,
    },
  });
  return { ...result, replay: false };
}
