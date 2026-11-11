# Deployment & Docker Install Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up a gated, self-contained Docker Compose demo of the complete site at `https://tik.earnable.store` — implementing the real blockers (S3 storage adapter, first database migration) along the way.

**Architecture:** One `docker-compose.yml` with four services on an internal network — Caddy (public: auto-TLS + HTTP Basic Auth gate), the Next app (standalone image, env-driven), Postgres (container + volume), MinIO (S3-compatible, internal only). Only Caddy is published. The app serves media bytes itself, so object storage stays internal. Every store maps to a managed service later by changing one env var.

**Tech Stack:** Next.js 16 (App Router, standalone output), Prisma/PostgreSQL, MinIO (S3-compatible), Caddy, Docker Compose. AWS Signature V4 implemented with `node:crypto` — no new npm dependency.

**Spec:** `docs/superpowers/specs/2026-11-11-deployment-and-docker-install-design.md`

## Global Constraints

- No new npm runtime dependency. SigV4 uses `node:crypto` only.
- Budget ~$100/month: the stack adds no managed-service cost; no always-on workers/queues beyond the four services.
- Never run `prisma migrate dev` / `db push` against a real/shared database as part of the running app; the committed migration is generated once against a throwaway Postgres, and the app runs `prisma migrate deploy` only.
- The repo's Next.js is newer than training data: consult `AGENTS.md` and `node_modules/next/dist/docs/` before writing Dockerfile/standalone/config code.
- DB-optional pattern stays intact: `DATABASE_URL` unset → in-memory fallback (unit tests); set → Prisma. No store may hard-require a DB to import.
- Payments stay inert (fake provider); do not wire any real provider.
- Secrets never committed or logged. `.env` is gitignored; `.env.example` holds placeholders only.
- Commit message trailer: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- Keep `npm run lint`, `npx tsc --noEmit`, `npm run test`, `npm run build` green; test output pristine.

## Review Focus

- **Media delivery against the real adapter:** the asset route streams `getStorage().get(key)` bytes with Range support; a real S3/MinIO `get` returning a body (not a local Buffer) must still slice correctly for 206 responses. Owned by Task 1 (adapter returns a `Buffer`) + verified in Task 2's pass.
- **404 vs error distinction in `get`/`exists`:** a missing key must be `null`/`false`, never a thrown 403/500 mistaken for absence — a bug here makes deleted media look present or breaks playback. Owned by Task 1 tests.
- **BigInt at real query boundaries:** money/`sizeBytes` BigInt columns only ever converted in-memory so far; a real Prisma `_sum`/`groupBy` returns `BigInt`/`Decimal` that must become `number` before any JSON/client boundary. Owned by Task 2's verification pass.
- **Enum/string coercion under real Postgres:** Prisma returns enum columns the app casts with `as`; a real DB round-trip is the first test these casts face. Owned by Task 2's verification pass.
- **Startup idempotency:** `migrate deploy` + seed + bucket-ensure must be safe to re-run on every restart without error or duplicate data. Owned by Task 3 entrypoint tests.

---

### Task 1: S3 storage adapter (SigV4 over fetch)

Replace the throwing `S3StorageAdapter` stub with a working implementation that serves both MinIO and real AWS S3, path-style addressing, no new dependency.

**Files:**
- Modify: `src/lib/media/storage.ts` (replace the `S3StorageAdapter` class body; keep `StorageAdapter`, `LocalStorageAdapter`, `assertSafeKey`, `s3ConfigFromEnv`, `getStorage` and the production guard)
- Create: `src/lib/media/s3-signing.ts` (pure SigV4 helpers, separately testable)
- Test: `tests/unit/s3-signing.test.ts` (new), `tests/unit/storage.test.ts` (modify the stub assertion)

**Interfaces:**
- Consumes: existing `StorageAdapter` interface, `S3Config` (`{ endpoint, bucket, accessKeyId, secretAccessKey, region }`), `assertSafeKey`.
- Produces: a working `S3StorageAdapter` whose `put/get/exists/delete` honor the existing contract (`get`→`Buffer|null`, `exists`→`boolean`, `delete` idempotent). `src/lib/media/s3-signing.ts` exports `signRequest(opts): { headers: Record<string,string> }` and the canonical-request/signing-key helpers it is built from (exact names the implementer's choice, but exported so the test can target them).

- [ ] **Step 1: Write failing SigV4 unit tests against AWS test vectors**

In `tests/unit/s3-signing.test.ts`, assert the canonical request, string-to-sign, derived signing key, and final `Authorization` header for at least one AWS published SigV4 test-vector case (fixed access key `AKIDEXAMPLE`, secret, region `us-east-1`, service `s3` or the documented vector's service, timestamp) match the known expected hex. Include one case with a payload hash (non-empty body) and one with `UNSIGNED-PAYLOAD` or the empty-body SHA256.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/unit/s3-signing.test.ts`
Expected: FAIL (module/function not defined).

- [ ] **Step 3: Implement the SigV4 signing helpers in `src/lib/media/s3-signing.ts`**

Pure functions using `node:crypto`: SHA256 hex of a payload, HMAC chain for the signing key (`AWS4`+secret → date → region → service → `aws4_request`), canonical request assembly (method, canonical URI path-style `/bucket/key`, canonical query, canonical+signed headers including `host` and `x-amz-content-sha256` and `x-amz-date`, payload hash), string-to-sign, and the `Authorization` header. No network here.

- [ ] **Step 4: Run to verify signing tests pass**

Run: `npx vitest run tests/unit/s3-signing.test.ts`
Expected: PASS.

- [ ] **Step 5: Write failing adapter tests (replace the stub assertion)**

In `tests/unit/storage.test.ts`: remove the "is a contract stub … not implemented" test. Add tests that stub `globalThis.fetch` and assert `S3StorageAdapter`: `put` issues a signed `PUT` to `endpoint/bucket/key` with `x-amz-content-sha256` and an `Authorization` header; `get` returns a `Buffer` on a 200 (body bytes) and `null` on 404; `exists` returns `true`/`false` on HEAD 200/404; `delete` resolves on 204 and on 404 (idempotent) and rejects on 500. Keep every existing `s3ConfigFromEnv`/`getStorage`/`LocalStorageAdapter` test passing.

- [ ] **Step 6: Run to verify adapter tests fail**

Run: `npx vitest run tests/unit/storage.test.ts`
Expected: FAIL (methods still throw / not yet rewired).

- [ ] **Step 7: Implement `S3StorageAdapter` in `src/lib/media/storage.ts`**

Each method builds the request (path-style URL from `config.endpoint`+`bucket`+`key`, `assertSafeKey` first), signs it via `s3-signing.ts`, calls `fetch`. `get`: 200→`Buffer.from(await res.arrayBuffer())`, 404→`null`, else throw. `exists`: HEAD, 200→true, 404→false, else throw. `delete`: 404 and 2xx both resolve, else throw. `put`: send body + `Content-Type`, non-2xx throws. Region falls back to `"auto"` for MinIO.

- [ ] **Step 8: Run storage + full suite to verify green**

Run: `npx vitest run tests/unit/storage.test.ts tests/unit/s3-signing.test.ts`
Expected: PASS. Then `npm run test` — all green.

- [ ] **Step 9: Lint + typecheck**

Run: `npm run lint && npx tsc --noEmit`
Expected: clean.

- [ ] **Step 10: Commit**

```bash
git add src/lib/media/storage.ts src/lib/media/s3-signing.ts tests/unit/storage.test.ts tests/unit/s3-signing.test.ts
git commit -m "feat: implement S3/MinIO storage adapter with node:crypto SigV4"
```

---

### Task 2: First Prisma migration + real-Postgres verification pass

Generate the first-ever migration, commit it, and exercise every Prisma path against a real Postgres, fixing what the in-memory fallback has hidden. **This is the task most likely to expand** — report any fixes as part of it.

**Files:**
- Create: `prisma/migrations/**` (generated SQL + `migration_lock.toml`)
- Modify: whatever source files the verification pass proves buggy against real Postgres (cannot be predicted precisely; expected candidates: BigInt conversions and enum casts in `src/lib/payments/records.ts`, `src/lib/media/records.ts`, `src/lib/payments/report.ts`). Each fix gets a focused test if one does not already cover it.
- Test: existing unit suite (must stay green on the in-memory path); plus a documented manual/integration verification recorded in the task report.

**Interfaces:**
- Consumes: `prisma/schema.prisma` (current).
- Produces: committed `prisma/migrations/` applied by `prisma migrate deploy`; a Postgres-verified codebase.

- [ ] **Step 1: Generate the migration against a throwaway Postgres**

Start a disposable Postgres (e.g. `docker run --rm -e POSTGRES_PASSWORD=dev -p 5433:5432 postgres:16`), set `DATABASE_URL` to it, run `npx prisma migrate dev --name init`. Confirm `prisma/migrations/<ts>_init/migration.sql` and `migration_lock.toml` are created.

- [ ] **Step 2: Verify `migrate deploy` applies cleanly on a fresh DB**

Drop/recreate the throwaway DB (or a second fresh one), run `npx prisma migrate deploy`. Expected: applies the init migration with no error, no drift. Run `npx prisma migrate status` → up to date.

- [ ] **Step 3: Seed against real Postgres**

With `DATABASE_URL` set, run `npx prisma db seed`. Expected: categories upserted; with `SEED_ADMIN_*` set, an admin user created. Re-run to confirm idempotency (no duplicate-key error).

- [ ] **Step 4: Exercise real flows and fix what breaks**

With `DATABASE_URL` set, run the full unit suite (`npm run test`) — but note unit tests target the in-memory path, so additionally write a small integration script (kept under `scripts/` or a `*.integration.test.ts` guarded by `DATABASE_URL`) that drives, against real Postgres: create user → create media → set asset → list live by category/owner → create a transaction → settle a webhook event (`applyPaymentEvent`) → `getMoneyFlowReport` → `markCreatorPayoutsPaid`. Assert no BigInt leaks (every numeric field is `typeof === "number"`), enum fields come back as expected strings, compound lookups (`provider_providerRef`, `creatorPricing.userId`) work. Fix every failure in source, adding a focused unit test for each real bug found.

- [ ] **Step 5: Confirm the in-memory path still passes with `DATABASE_URL` unset**

Run: `DATABASE_URL= npm run test` (unset).
Expected: all existing tests green — fixes must not break the fallback.

- [ ] **Step 6: Lint + typecheck**

Run: `npm run lint && npx tsc --noEmit`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add prisma/migrations
# plus any source files + tests changed by the verification pass
git commit -m "feat: generate initial Prisma migration; fix Prisma paths found against real Postgres"
```

---

### Task 3: Standalone Next image + startup entrypoint

Produce a lean production image and an idempotent startup script.

**Files:**
- Modify: `next.config.ts` (add `output: "standalone"`)
- Create: `Dockerfile`, `.dockerignore`, `docker/entrypoint.sh`, `docker/ensure-bucket.mjs` (bucket-create via the adapter/MinIO, or a small S3 PUT-bucket using `s3-signing.ts`)
- Test: `tests/unit/entrypoint.test.ts` if entrypoint logic is factored into a testable Node module; otherwise a documented local build/run verification in the task report.

**Interfaces:**
- Consumes: Task 1's adapter (bucket-ensure may reuse `s3-signing.ts`); Task 2's committed migrations.
- Produces: an image whose entrypoint runs wait-for-db → `prisma migrate deploy` → `prisma db seed` → ensure bucket → `node server.js`. Exposes container port 3000 internally.

- [ ] **Step 1: Add `output: "standalone"` and verify the build emits `server.js`**

Modify `next.config.ts`. Run `npm run build`; confirm `.next/standalone/server.js` exists. Expected: build green.

- [ ] **Step 2: Write the entrypoint and bucket-ensure**

`docker/entrypoint.sh`: poll Postgres (bounded retries, non-zero exit + clear message on timeout) → `npx prisma migrate deploy` → `npx prisma db seed` → `node docker/ensure-bucket.mjs` (create `S3_BUCKET` if absent, idempotent) → `exec node server.js`. Each failing step exits non-zero with a specific message.

- [ ] **Step 3: Write the multi-stage Dockerfile**

Build stage: `npm ci`, `npx prisma generate`, `npm run build`. Runtime stage (small base, non-root user): copy `.next/standalone`, `.next/static`, `public`, `prisma/` (schema + migrations), `node_modules/.prisma` + the Prisma CLI needed for `migrate deploy`/`db seed` (or use `prisma` from the standalone deps), `prisma/seed.mjs`, `docker/`. `.dockerignore` excludes `.next` (except as built), `node_modules`, `.storage`, `.env`, `.git`, `tests`, `.superpowers`.

- [ ] **Step 4: Build the image locally**

Run: `docker build -t tik-app .`
Expected: image builds; no missing-file errors at build time.

- [ ] **Step 5: Verify the image boots against a throwaway Postgres + MinIO**

Run the image with `DATABASE_URL`, `S3_*` pointing at local throwaway Postgres + MinIO containers. Expected: entrypoint runs migrate+seed+bucket, server listens on 3000, `GET /api/health` returns ok. Re-run the container to confirm idempotency (no migrate/seed error on second boot).

- [ ] **Step 6: Lint/typecheck/build still green**

Run: `npm run lint && npx tsc --noEmit && npm run build`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add next.config.ts Dockerfile .dockerignore docker/
git commit -m "feat: standalone Next image and idempotent startup entrypoint"
```

---

### Task 4: Compose stack + Caddy (TLS + Basic Auth gate)

Wire the four services into one stack; only Caddy public.

**Files:**
- Create: `docker-compose.yml`, `Caddyfile`
- Test: documented local stack bring-up in the task report (real TLS is owner-confirmed on the host; locally, verify proxy + basic-auth + app reachability).

**Interfaces:**
- Consumes: Task 3's image (`app`), its port 3000; env vars from Task 5's `.env`.
- Produces: a running stack — `caddy` (80/443 public, TLS + basic-auth, proxy to `app:3000`), `app` (internal), `postgres` (internal + volume + healthcheck), `minio` (internal + volume). Named volumes: `pgdata`, `miniodata`, `caddydata`, `caddyconfig`.

- [ ] **Step 1: Write `docker-compose.yml`**

Four services on a default internal network. `caddy`: publish 80/443, mount `Caddyfile` + cert/config volumes, `depends_on: app`. `app`: build from the Dockerfile (or `image:`), env from `.env`, `depends_on: {postgres: healthy, minio: started}`, no published port. `postgres`: official image, env creds, `pgdata` volume, healthcheck (`pg_isready`). `minio`: official image, root creds from env, `miniodata` volume, no published port.

- [ ] **Step 2: Write the `Caddyfile`**

`{$SITE_DOMAIN}` site block: automatic TLS with `{$ACME_EMAIL}`; `basicauth` with the username + bcrypt hash from env; `reverse_proxy app:3000`. Document that for local testing without a public domain, a `:80`/`localhost` block with `tls internal` is used.

- [ ] **Step 3: Bring the stack up locally and verify the gate**

Run: `docker compose up -d --build` (with a local `.env`, `SITE_DOMAIN=localhost`, `tls internal`). Verify: a request without credentials gets 401; with credentials, the site loads; the app reaches Postgres and MinIO (register + upload + playback round-trips); Postgres/MinIO are not reachable from the host directly.

- [ ] **Step 4: Tear down cleanly**

Run: `docker compose down` (keep volumes). Re-run `up` to confirm data persisted (admin still exists, uploaded media still plays).

- [ ] **Step 5: Commit**

```bash
git add docker-compose.yml Caddyfile
git commit -m "feat: compose stack with Caddy TLS + basic-auth gate, internal Postgres/MinIO"
```

---

### Task 5: Config, `.env.example`, and pre-boot validation

One documented `.env` surface and a script that fails loudly before boot.

**Files:**
- Modify: `.env.example` (add all new stack vars)
- Create: `install.sh`, and a documented PowerShell equivalent (`install.ps1` or a section in the runbook)
- Test: `tests/unit/env-validation.test.ts` if validation logic is a Node module; otherwise verify `install.sh` behavior manually and record it.

**Interfaces:**
- Consumes: the var names used by Tasks 3–4 (`POSTGRES_*`, `MINIO_ROOT_*`, `S3_*`, `SITE_DOMAIN`, `ACME_EMAIL`, basic-auth creds, `NEXTAUTH_*`, `SEED_ADMIN_*`, `PAYMENT_PROVIDER`, `PAYMENTS_WEBHOOK_SECRET`).
- Produces: `.env.example` documenting every var; `install.sh` validating required vars then `docker compose up -d --build`.

- [ ] **Step 1: Extend `.env.example`**

Add, with comments: `POSTGRES_USER/PASSWORD/DB`; `DATABASE_URL` (composed, pointing at `postgres:5432`); `MINIO_ROOT_USER/PASSWORD`; `S3_ENDPOINT=http://minio:9000`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`/`S3_SECRET_ACCESS_KEY` (= MinIO root creds for the demo), `S3_REGION=auto`; `SITE_DOMAIN`, `ACME_EMAIL`; `BASIC_AUTH_USER`, `BASIC_AUTH_HASH`; keep existing `NEXTAUTH_*`, `SEED_ADMIN_*`, `PAYMENT_PROVIDER`, `PAYMENTS_WEBHOOK_SECRET`. Placeholders only.

- [ ] **Step 2: Write `install.sh` (validation + up)**

Check `.env` exists; load it; for each required var, fail with the specific missing name(s) if empty; sanity-check `NEXTAUTH_SECRET` length, `SITE_DOMAIN` format, and that `NEXTAUTH_URL` host matches `SITE_DOMAIN`; then `docker compose up -d --build`. Non-zero exit on any validation failure.

- [ ] **Step 3: Verify validation fails loudly and succeeds when complete**

Run `install.sh` with a deliberately incomplete `.env` → expect a specific "missing X" error and non-zero exit, no compose run. Then with a complete `.env` → expect it proceeds to `docker compose up`.

- [ ] **Step 4: Commit**

```bash
git add .env.example install.sh install.ps1
git commit -m "feat: documented .env surface and pre-boot validation script"
```

---

### Task 6: Deploy runbook

Document the owner-operated cloud steps and daily operation.

**Files:**
- Create: `docs/ops/install.md`
- Modify: `docs/ops/cost-and-deploy-notes.md` (add a "Deployment (Docker install)" section linking the runbook; mark the S3-adapter-stub and no-migration launch blockers as resolved)

**Interfaces:**
- Consumes: the finished stack, scripts, and env surface from Tasks 1–5.
- Produces: a runbook the owner follows to go live.

- [ ] **Step 1: Write `docs/ops/install.md`**

Sections per the spec's Component 5: prerequisites (VM, Docker, ports 80/443, public IP); DNS (A record for `tik.earnable.store`); config (clone, `cp .env.example .env`, fill it, exact `NEXTAUTH_SECRET` and `caddy hash-password` generation commands); launch (`./install.sh`); verify (URL → basic-auth prompt → admin login → upload round-trip plays back); operate (logs, restart, back up `pgdata`+`miniodata` volumes, one-env-var switch to managed RDS/S3). State the operational boundary: owner runs all cloud/domain/TLS steps; implementer verified everything a local stack can.

- [ ] **Step 2: Update cost-and-deploy-notes**

Add the deployment section; update the "S3 adapter" and "Migrations" launch-validation TODOs to point at the now-implemented adapter and committed migration, noting real-Postgres verification was done locally and real cloud confirmation is the owner's step.

- [ ] **Step 3: Verify every command in the runbook is accurate**

Re-read the runbook against the actual files (compose service names, env var names, volume names, script names). Fix drift.

- [ ] **Step 4: Commit**

```bash
git add docs/ops/install.md docs/ops/cost-and-deploy-notes.md
git commit -m "docs: Docker install/deploy runbook; resolve storage + migration launch blockers"
```
