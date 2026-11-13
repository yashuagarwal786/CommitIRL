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
3. Fill the prompted values:
   - `WEB_ORIGIN`: the public frontend URL, including `https://` and no trailing slash.
   - `DATA_ENCRYPTION_KEY` and `LOOKUP_HMAC_KEY` are generated automatically by the Blueprint. Existing deployments may keep 64-character hexadecimal values.
4. Keep `AUTH_MODE=dev` only for the current development login flow. Before a public launch, switch to `clerk` and configure the managed identity provider.
5. After the API deploys, copy its `https://...onrender.com` URL into the frontend host as `VITE_API_URL`, then rebuild the frontend.

## Verification

Check:

```text
https://YOUR-API.onrender.com/healthz
https://YOUR-API.onrender.com/readyz
```

`healthz` confirms the process is alive. `readyz` confirms the database connection and migrations are usable.
