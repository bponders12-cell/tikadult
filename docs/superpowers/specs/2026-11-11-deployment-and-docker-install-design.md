# Deployment & Docker Install — Design

**Date:** 2026-11-11
**Status:** Draft for review
**Target:** A gated, demoable instance of the complete site at `https://tik.earnable.store`
**Depends on:** Plans 1–3 complete and merged to `main` (foundation, media pipeline, payments/entitlements).

## Intent and why

Get an **otherwise-complete, demoable version of the site live** at `https://tik.earnable.store` as soon as practical, deployed as a **self-contained Docker Compose stack**. The owner wants to see and show a working site; payments are explicitly the *last* thing to wire and stay inert for now. This is deployment-readiness work, not a new product feature — it closes the gap between the current `main` (which has never run against a real database or real object storage) and a running, visitable instance.

This is **not** one of the seven numbered plans. It pulls the *install mechanism* out of Plan 6 (the licensed/sellable package) and defers Plan 6's product layer (license activation, rebranding, setup wizard). Plans 4 (social/messaging) and 5 (moderation) are deferred until after the site is live.

## Goals

- A single `docker compose up` (after filling one `.env`) brings up the whole site: reverse proxy + app + database + object storage.
- The media **storage adapter** actually works (today it is a stub that throws on every call; production refuses local-disk fallback, so uploads cannot work on a real host until this exists).
- The **first-ever database migration** is generated, committed, and applied on startup — and every Prisma code path (untested across all three completed plans, which have only ever run their in-memory fallbacks) is exercised against a real Postgres and fixed where it breaks.
- The demo is **gated** (HTTP Basic Auth) so it is not openly reachable — required because it is an 18+ user-upload site with no moderation tooling yet (Plan 5 deferred).
- TLS is automatic for the domain.
- Every store/service maps to a future managed service by changing one environment variable (container Postgres → managed RDS; MinIO → real AWS S3) with no code change.

## Non-goals / explicitly deferred

- **Licensing/activation/rebranding product layer** (Plan 6's core): no license key, no activation service, no rebranding admin, no interactive first-run web wizard. The instance boots from a `.env` file with no license server in existence.
- **Payments provider wiring**: payments stay behind the fake provider from Plan 3, inert. Production refuses the fake provider, which is correct and intended — the demo simply does not take payments.
- **Moderation** (Plan 5) and **social/messaging** (Plan 4): not built; the demo is gated precisely because moderation does not exist yet.
- **Managed cloud services** (RDS, real S3, cloud load balancer): the stack is self-contained; moving to managed services later is a config change, documented but not built.
- **Multi-currency, CDN/presigned-URL media delivery, auto-renewing subscriptions**: out of scope (and media already streams through the app, so no CDN is needed for the demo).

## Constraints and assumptions

- **Budget ~$100/month.** The self-contained stack adds no managed-service cost; cost is a single host VM.
- **No new npm runtime dependencies.** AWS Signature V4 is implemented with `node:crypto` (already used in `src/lib/auth.ts` and the Plan 3 fake-provider webhook signing). No AWS SDK.
- **The repo has never run against Postgres or real object storage.** Only the in-memory DB-optional fallbacks and the local-disk storage adapter have executed. This design treats the first real-Postgres run as a verification-and-fix pass, not a formality.
- **Windows host for development** (the owner's machine); the deploy host is a Linux VM (AWS EC2 or Azure VM). Scripts are provided for both where they differ (`install.sh` plus a PowerShell note).
- **The owner operates all steps that touch real cloud accounts and the real domain.** See "Operational boundary".

## Architecture overview

A single `docker-compose.yml` with four services on one internal network; only the proxy is published to the host's public interface.

```
Internet ──443/80──> caddy ──(internal)──> app:3000
                       │                      │
                  (TLS + Basic Auth)          ├──(internal)──> postgres:5432
                                              └──(internal)──> minio:9000
```

- **caddy** — public entrypoint. Automatic Let's Encrypt TLS for `SITE_DOMAIN`; HTTP Basic Auth gate (single shared credential) in front of the whole site; reverse-proxies to `app:3000`. Persistent volumes for the cert store and Caddy data.
- **app** — the Next.js standalone image. Reads all config from env. Runs an idempotent startup entrypoint (migrate → seed → ensure bucket → serve). Not published to a host port; reachable only by Caddy on the internal network.
- **postgres** — official image; credentials from env; data on a named volume; healthcheck so the app's wait-step can poll it.
- **minio** — official MinIO image (S3-compatible); root credentials from env; data on a named volume; reachable only by the app on the internal network, never published.

**Why only Caddy is public:** the Basic Auth gate is meaningful only if Postgres and MinIO are not separately reachable. Media playback does not require public MinIO: the app serves media bytes itself through `GET /api/media/[id]/asset/[kind]` (Plan 2 delivery streams from storage rather than handing out direct storage URLs), so the gate on the app also gates media, and MinIO stays internal.

## Component 1 — S3 storage adapter

Replace the throwing `S3StorageAdapter` stub in `src/lib/media/storage.ts` with a working implementation.

- **Protocol:** AWS S3 REST API with Signature V4 request signing, implemented over `fetch` using `node:crypto` (HMAC-SHA256, SHA-256). No new dependency.
- **One adapter, two backends:** the same code path serves MinIO (demo) and real AWS S3 (later). The only differences are the endpoint URL and region, both already read by `s3ConfigFromEnv` (`S3_ENDPOINT`, `S3_REGION`, default `"auto"`). **Path-style addressing** (`endpoint/bucket/key`) is the default, since MinIO requires it and AWS supports it, so one config shape works for both.
- **Methods (honoring the existing `StorageAdapter` contract):**
  - `put(key, data, opts?)` — PUT the object; send `Content-Type` when given; include the required `x-amz-content-sha256` payload hash.
  - `get(key)` — GET; return the body `Buffer` on 200, `null` on 404, throw on other errors.
  - `exists(key)` — HEAD; `true` on 200, `false` on 404.
  - `delete(key)` — DELETE; idempotent (404 is success).
- **Preserved:** `assertSafeKey` path-traversal checks on every key; `getStorage()`'s production guard (refuses local-disk fallback when `NODE_ENV=production` and no S3 config); `LocalStorageAdapter` remains the dev default. `s3ConfigFromEnv` keeps its "all-or-nothing, throw on partial config" behavior; add an optional addressing/style note if needed for AWS virtual-host compatibility later (path-style is the shipped default).
- **Testing:**
  - **Unit (no network):** SigV4 canonical-request construction and signing-key derivation verified against AWS's published signing test vectors (fixed inputs → known expected signatures). This fully covers the signing algorithm offline.
  - **Integration (real S3 protocol):** round-trip (`put`/`get`/`exists`/`delete`, 404→null, idempotent delete) verified against the MinIO container during the stack bring-up step. Reported as integration-verified, not unit-mocked. Unit tests must not mock away the signing to fake a pass.

## Component 2 — First migration and startup sequence

### Generating the migration (one-time, during the work)

No migration exists. Generation is done by the implementer against a disposable Postgres, not by the owner and not by the installer:

1. Start a throwaway Postgres (disposable container), set a dummy `DATABASE_URL`.
2. Run `prisma migrate dev --name init` to generate the initial migration SQL from the current `schema.prisma`.
3. Commit the generated files under `prisma/migrations/`.

### The real-Postgres verification pass (part of this work, not deferred)

Applying that migration is the first time **any** Prisma code path executes — all three completed plans have only ever run their in-memory fallbacks. After generating the migration, bring up a real Postgres, run the app against it (`DATABASE_URL` set), and exercise the real flows: register/login, upload → processing → live, category feed and profile queries, entitlement checks, the money-flow aggregation queries (`groupBy`, BigInt `_sum`), and the webhook settlement `$transaction` with its guarded `updateMany`. **Fixing whatever this surfaces is part of this component** — enum/string coercions, null handling, the `creatorPricing` (unique `userId`) and `provider_providerRef` compound lookups, BigInt conversion at real query boundaries, `updateManyAndReturn`/`groupBy` shapes. This is the task most likely to expand; it is called out as such in the plan.

### Startup entrypoint (runs every `docker compose up`, idempotent)

A script that is the app container's entrypoint:

1. Wait for Postgres to accept connections (poll with a bounded timeout; fail loudly and exit non-zero if it never comes up).
2. `prisma migrate deploy` — apply committed migrations (no-op when current).
3. Seed via the existing `prisma/seed.mjs`: categories always; admin user only when `SEED_ADMIN_EMAIL`/`SEED_ADMIN_HANDLE`/`SEED_ADMIN_PASSWORD_HASH` are set.
4. Ensure the MinIO bucket (`S3_BUCKET`) exists — create if absent; idempotent.
5. `exec` the Next standalone server (`node server.js`).

Every step is safe to re-run, so restarts and redeploys are safe. Any failing step exits the container non-zero with a specific message rather than starting a half-broken app.

## Component 3 — The Next.js production image

- Add `output: "standalone"` to `next.config.ts` so the build emits a self-contained `server.js` with only the needed runtime files.
- **Multi-stage `Dockerfile`:**
  - *build stage:* `npm ci`, `prisma generate`, `npm run build`.
  - *runtime stage:* copy the standalone output, the Prisma schema + committed migrations + generated client (needed for `migrate deploy` at startup), the seed script, and the entrypoint. Run as a non-root user.
- The image is backend-agnostic: all behavior is env-driven, so the same image runs against MinIO+container-Postgres now and managed S3+RDS later.

## Component 4 — Config, secrets, and validation

- **Single `.env` file** supplies all config; a documented `.env.example` lists every variable with comments. Existing vars reused: `DATABASE_URL` (composed from `POSTGRES_*`), `S3_ENDPOINT`/`S3_REGION`/`S3_BUCKET`/`S3_ACCESS_KEY_ID`/`S3_SECRET_ACCESS_KEY`, `NEXTAUTH_SECRET`/`AUTH_SECRET`, `NEXTAUTH_URL`, `SEED_ADMIN_*`, `PAYMENT_PROVIDER`, `PAYMENTS_WEBHOOK_SECRET`. New stack vars: `POSTGRES_USER`/`POSTGRES_PASSWORD`/`POSTGRES_DB`; `MINIO_ROOT_USER`/`MINIO_ROOT_PASSWORD` (the app's `S3_ACCESS_KEY_ID`/`S3_SECRET_ACCESS_KEY` match these for the demo); `SITE_DOMAIN`; `ACME_EMAIL`; and the Caddy basic-auth username + password (password stored as a bcrypt hash in the Caddyfile).
- **Pre-boot validation:** `install.sh` (with a documented PowerShell equivalent) checks `.env` exists and every *required* var is non-empty — failing with the specific missing names — sanity-checks a few (secret length, domain format, `NEXTAUTH_URL` host matches `SITE_DOMAIN`), then runs `docker compose up -d --build`. Validating before boot beats a container crash-looping with a buried error.
- **Secrets:** `.env` is gitignored (already). `.env.example` carries only placeholders. `NEXTAUTH_SECRET` and the basic-auth password are operator-generated; the runbook shows the exact generation commands (`caddy hash-password`, a secret generator). No secret is committed or logged.

## Component 5 — Deploy runbook

`docs/ops/install.md`, covering, in order:

1. **Prerequisites** — a host VM (AWS EC2 / Azure VM) with Docker + Compose; ports 80/443 open; a public IP.
2. **DNS** — an A record `tik.earnable.store` → the host IP (must resolve before Caddy can obtain a certificate).
3. **Config** — clone, `cp .env.example .env`, fill it; exact commands to generate `NEXTAUTH_SECRET` and the basic-auth hash.
4. **Launch** — `./install.sh` (validate → `docker compose up -d --build`).
5. **Verify** — reach the URL, confirm the Basic Auth prompt, log in as the seeded admin, confirm an upload round-trips through MinIO and plays back in the feed.
6. **Operate** — view logs, restart, back up the two data volumes (Postgres + MinIO), and the one-env-var switch to managed RDS/S3 later.

## Operational boundary

The implementer builds every file, script, and exact command, and verifies everything a **local** Docker environment can verify. The owner executes everything that touches real cloud accounts and the real domain.

- **Implementer-verified locally (part of "done"):** the app builds; the generated migration applies against a real Postgres container and the real-Postgres verification pass is green; the storage adapter round-trips against a real MinIO container; the full compose stack comes up clean on a local test run; `npm run lint`, `npx tsc --noEmit`, `npm run test`, `npm run build` all green.
- **Owner-executed (documented, not run by the implementer):** provisioning the VM, creating the DNS record, opening ports 80/443, real Let's Encrypt issuance (needs the public domain pointing at a public IP), and any real AWS/Azure services. The implementer never needs or requests the owner's cloud credentials.
- **"Done" for this effort:** green locally end-to-end, plus a runbook proven as far as a local stack can prove it; the cloud-specific steps are documented and confirmed by the owner on the host.

## Testing strategy

- **Unit:** SigV4 signing against AWS test vectors; any new config-validation logic; keep the full existing suite (349 tests) green.
- **Integration (local, real services):** migration apply + real-Postgres verification pass; storage adapter round-trip against MinIO; compose stack smoke (bring up, hit health, register, upload, play back).
- **Not in scope to automate:** real Let's Encrypt and real cloud provider behavior (owner-confirmed on the host).

## Risks

1. **The real-Postgres verification pass is the largest unknown.** Three plans' worth of Prisma code has never run; expect bugs. Mitigated by making the fix work explicitly part of Component 2 and flagging it as the task most likely to expand.
2. **SigV4 correctness.** Subtle to get right; mitigated by testing against AWS's published signing vectors plus a real MinIO round-trip.
3. **Gating discipline.** The demo must not leak publicly before moderation exists. Mitigated by Basic Auth at the proxy and keeping Postgres/MinIO internal-only; the owner must still not publish the credentials or the URL widely.
4. **Standalone build gotchas** (Next 16, newer than training data). Mitigated by consulting `node_modules/next/dist/docs/` and verifying the image actually boots locally.
