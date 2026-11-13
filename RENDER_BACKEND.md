# Deploy the CommitIRL backend on Render

This repository can deploy the backend independently from the frontend through the root `render.yaml` Blueprint.

## Services created

- `commitirl-api`: public API web service built from `Dockerfile.api`
- `commitirl-worker`: private background worker built from `Dockerfile.worker`
- `commitirl-db`: managed PostgreSQL 16 database

The API runs checked-in Prisma migrations before starting and exposes `/healthz` for Render health checks.

## Render setup

1. In Render, choose **New → Blueprint** and connect the `yashuagarwal786/CommitIRL` repository.
2. Select the `main` branch and apply `render.yaml`.
3. Fill the prompted secrets:
   - `DATA_ENCRYPTION_KEY`: exactly 64 hexadecimal characters.
   - `LOOKUP_HMAC_KEY`: exactly 64 hexadecimal characters.
   - `WEB_ORIGIN`: the public frontend URL, including `https://` and no trailing slash.
4. Keep `AUTH_MODE=dev` only for the current development login flow. Before a public launch, switch to `clerk` and configure the managed identity provider.
5. After the API deploys, copy its `https://...onrender.com` URL into the frontend host as `VITE_API_URL`, then rebuild the frontend.

## Generate compatible hex keys

Use a password generator that outputs 64 hexadecimal characters. Do not use Render's `generateValue` for these two keys because the application expects hexadecimal key material.

## Verification

Check:

```text
https://YOUR-API.onrender.com/healthz
https://YOUR-API.onrender.com/readyz
```

`healthz` confirms the process is alive. `readyz` confirms the database connection and migrations are usable.
