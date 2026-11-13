import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";

function keyBytes(secret: string): Buffer {
  return /^[0-9a-f]{64}$/i.test(secret)
    ? Buffer.from(secret, "hex")
    : createHash("sha256").update(secret, "utf8").digest();
}

export function newId(): string {
  return randomUUID();
}

export function normalizeEmail(email: string): string {
  return email.trim().normalize("NFC").toLowerCase();
}

export function lookupHash(value: string, hexKey: string): Uint8Array<ArrayBuffer> {
  return new Uint8Array(createHmac("sha256", keyBytes(hexKey)).update(value).digest());
}

export function encryptUtf8(plain: string, hexKey: string): Uint8Array<ArrayBuffer> {
  const key = keyBytes(hexKey);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return new Uint8Array(Buffer.concat([iv, tag, encrypted]));
}

export function decryptUtf8(payload: Uint8Array, hexKey: string): string {
  const bytes = Buffer.from(payload);
  const key = keyBytes(hexKey);
  const iv = bytes.subarray(0, 12);
  const tag = bytes.subarray(12, 28);
  const data = bytes.subarray(28);
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
