import { config as loadEnv } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadServerEnv } from "@commitirl/config";
import { prisma, generateAttemptsForCommitment, reconcileDueAttempts } from "@commitirl/backend";

const root = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "../../..");
loadEnv({ path: path.join(root, ".env") });
const env = loadServerEnv();

async function tick() {
  await reconcileDueAttempts();
  const active = await prisma.commitment.findMany({ where: { status: "ACTIVE" }, select: { id: true } });
  for (const row of active) {
    await generateAttemptsForCommitment(row.id);
  }
}

async function main() {
  console.log(`CommitIRL worker started (interval ${env.WORKER_POLL_MS}ms)`);
  await tick();
  setInterval(() => {
    void tick().catch((error) => {
      console.error("worker tick failed", error instanceof Error ? error.message : "unknown");
    });
  }, env.WORKER_POLL_MS);
}

void main();
