import { createCipheriv, createDecipheriv, createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";

export function newId(): string {
  return randomUUID();
}

export function normalizeEmail(email: string): string {
  return email.trim().normalize("NFC").toLowerCase();
}

export function lookupHash(value: string, hexKey: string): Buffer {
  return createHmac("sha256", Buffer.from(hexKey, "hex")).update(value).digest();
}

export function encryptUtf8(plain: string, hexKey: string): Buffer {
  const key = Buffer.from(hexKey, "hex");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]);
}

export function decryptUtf8(payload: Buffer, hexKey: string): string {
  const key = Buffer.from(hexKey, "hex");
  const iv = payload.subarray(0, 12);
  const tag = payload.subarray(12, 28);
  const data = payload.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

export function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!local || !domain) return "hidden";
  return `${local.slice(0, 1)}***@${domain}`;
}

export function sha256Hex(value: string): string {
  return createHmac("sha256", "idempotency").update(value).digest("hex");
}

export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
