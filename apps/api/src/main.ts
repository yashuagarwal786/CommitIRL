import { config as loadEnv } from "dotenv";
import { randomUUID } from "node:crypto";
import express from "express";
import cors from "cors";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadServerEnv } from "@commitirl/config";
import { createApiRouter, errorHandler } from "@commitirl/backend";

const root = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "../../..");
loadEnv({ path: path.join(root, ".env") });

const env = loadServerEnv();
const app = express();
app.disable("x-powered-by");
app.use(
  cors({
    origin: env.NODE_ENV === "development" ? [env.WEB_ORIGIN, "http://127.0.0.1:5173"] : env.WEB_ORIGIN,
    credentials: true,
    allowedHeaders: ["Authorization", "Content-Type", "If-Match", "Idempotency-Key", "X-Request-Id"],
    exposedHeaders: ["X-Request-Id"],
  }),
);
app.use(express.json({ limit: "256kb" }));
app.use((req, res, next) => {
  req.requestId = (req.header("x-request-id") as string | undefined) ?? randomUUID();
  res.setHeader("X-Request-Id", req.requestId);
  next();
});
app.use(createApiRouter(env));
app.use(errorHandler);

app.listen(env.API_PORT, () => {
  console.log(`CommitIRL API listening on http://localhost:${env.API_PORT}`);
});
