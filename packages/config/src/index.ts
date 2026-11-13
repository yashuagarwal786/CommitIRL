import { z } from "zod";

export const serverEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1),
  AUTH_MODE: z.enum(["dev", "clerk"]).default("dev"),
  DEV_JWT_SECRET: z.string().min(16),
  DATA_ENCRYPTION_KEY: z.string().min(64),
  LOOKUP_HMAC_KEY: z.string().min(64),
  WEB_ORIGIN: z.string().url(),
  PORT: z.coerce.number().int().positive().optional(),
  API_PORT: z.coerce.number().int().positive().default(3001),
  WORKER_POLL_MS: z.coerce.number().int().positive().default(5000),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  CLERK_SECRET_KEY: z.string().optional(),
  CLERK_ISSUER: z.string().optional(),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

export function loadServerEnv(raw: NodeJS.ProcessEnv = process.env): ServerEnv {
  return serverEnvSchema.parse(raw);
}
