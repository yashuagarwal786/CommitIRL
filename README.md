# CommitIRL

CommitIRL turns a clear commitment into a scheduled attempt, records progress and evidence, resolves it honestly, and offers bounded risk-driven help. The P0 loop is private by default and keeps self-report distinct from independent verification.

## Local development

1. Start Docker Desktop.
2. Copy `.env.example` to `.env` and use 64-character hexadecimal keys for `DATA_ENCRYPTION_KEY` and `LOOKUP_HMAC_KEY`.
3. Run `pnpm install`, `pnpm db:up`, `pnpm --filter @commitirl/backend prisma:migrate:dev -- --name init`, then `pnpm dev`.
4. Open `http://localhost:5173` (or `http://127.0.0.1:5173`). The local sign-in creates a development-only account.

The local services are web on port `5173`, API on port `3001`, worker polling every five seconds, and PostgreSQL on port `5432`.

## P0 workflows

- Onboard with an editable timezone and privacy baseline.
- Create one-time, daily, or weekly commitments through the six-step flow.
- Generate attempts, record numeric progress, start and finish in-app focus sessions, and submit a clearly labeled self-report.
- Inspect attempt windows, verification history, explainable risk, interventions, history, and sample-gated insights.

## Production containers

Set the required values shown in `.env.example`, plus `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `WEB_ORIGIN`, and `VITE_API_URL`. Use separate production-grade secrets; never reuse development values.

Run `docker compose -f docker-compose.production.yml up --build -d`. The web app is exposed on port `8080`, API on `3001`, and the API service applies checked-in Prisma migrations before starting. Put TLS and a managed reverse proxy in front of both public endpoints.

`AUTH_MODE=dev` is only for local evaluation. Configure a verified managed identity provider before an internet-facing deployment.
