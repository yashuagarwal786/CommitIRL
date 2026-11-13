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
const webOrigin = env.WEB_ORIGIN.replace(/\/$/, "");
app.disable("x-powered-by");
app.use(
  cors({
    origin: env.NODE_ENV === "development" ? [webOrigin, "http://127.0.0.1:5173"] : webOrigin,
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

const port = env.PORT ?? env.API_PORT;
app.listen(port, "0.0.0.0", () => {
  console.log(`CommitIRL API listening on port ${port}`);
});
