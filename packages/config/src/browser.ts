import { z } from "zod";

export const browserEnvSchema = z.object({
  VITE_API_URL: z.string().url().default("http://localhost:3001"),
  VITE_AUTH_MODE: z.enum(["dev", "clerk"]).default("dev"),
  VITE_CLERK_PUBLISHABLE_KEY: z.string().optional(),
});

export type BrowserEnv = z.infer<typeof browserEnvSchema>;

export function loadBrowserEnv(raw: Record<string, unknown>): BrowserEnv {
  return browserEnvSchema.parse(raw);
}
