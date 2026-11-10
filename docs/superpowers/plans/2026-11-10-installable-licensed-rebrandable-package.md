# Adult TikTok-Style Site — Plan 6: Installable, Licensed, Rebrandable Package & License Service

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the product sellable as a licensed, self-serve, rebrandable package: Docker-based install, first-run setup with online license activation, owner-operated license dashboard/service (create/activate/revoke, one live site per license, site-move handling), runtime branding without code, and buyer-facing install/rebrand docs—while staying compatible with a low-cost (~$100/month-class) baseline.

**Architecture:** Two cooperating parts: (A) the **site app** gains install/first-run state, license activation client + enforcement hooks, runtime branding/theme configuration (admin-editable), and packaging (Docker/Compose, env-driven config). (B) a separate **owner-operated license service/dashboard** issues and manages keys and activation/binding records (one live site per key, revoke, site-move). Communication is online activation/revalidation over HTTPS with clear failure/grace behavior. All choices marked **[Builder call]** are defaults, not owner commitments.

**Tech Stack:** Same baseline as app (Node.js/TypeScript, Next.js, PostgreSQL/Prisma) plus Docker & Docker Compose for packaging; license service can be a small standalone web service (same stack or minimal alternative) with its own DB/store and authenticated owner dashboard. Secrets/config via env vars and documented secret management.

**Spec:** `docs/superpowers/specs/2026-11-10-adult-tiktok-video-site-design.md` (Packaging, licensing, and rebranding section). Read alongside Plan 1 and other subsystem plans.

## Global Constraints

- **Licensed, not unrestricted full-source redistribution** (decided). Exact license terms/packaging (how much source vs protected, what buyer may do) are **open** and must be defined before sale.
- **License key required at first-run setup; online activation** against owner-controlled service (decided). One license = **one live site**; buyers **request site moves** (owner-handled in dashboard). **[Builder call/guess]** site moves handled owner-side (deactivate/reactivate or reissue).
- **Self-serve install + docs** (decided). **Docker/Docker Compose** install path, cost-aware. First-run collects **license key, domain, DB, admin account, storage/payments keys**.
- **Rebrand without code** (decided): admin area sets **site name, logo, colors, copy/metadata**.
- **Budget now:** ~\$100/month (hard constraint) for running a site; license service must also be cheap/simple to operate. **Failure condition:** hosting/running costs must not exceed income one year from launch.
- **18+ only**, and all other spec global constraints remain in force.

## Review Focus

- **Unlicensed/invalid/revoked operation:** app must not complete setup or continue normal operation as an activated licensed site without a valid activation state per policy; revocation and invalid keys must be enforced with clear messaging.
- **License service outage behavior:** activation/revalidation failure handling (grace period vs. hard fail) is an explicit, documented policy—must avoid accidental lockout while limiting abuse; behavior must be consistent and testable.
- **One-site binding & site moves:** a key must not be concurrently active on multiple live sites; site-move flow (owner action) must reliably transfer/restore activation without data loss.
- **First-run/install security:** setup secrets/keys stored securely (not logged, not world-readable), installer idempotent/recoverable, and admin/bootstrap not left exposed.
- **Rebrand isolation:** branding is runtime config/assets only—no source edits required; defaults safe and rendering resilient when assets missing.

## File Structure

> Integrate into existing app repo and/or a sibling `license-service/` package (monorepo or separate repo per packaging choice—**[Builder call]**; default: `license-service/` directory in-repo with its own build/deploy).

- `docker-compose.yml`, `Dockerfile`, `.dockerignore`, `deploy/` — containerized install path (app, db, optional reverse proxy notes) suited to low cost.
- `scripts/install/` or setup entrypoints, `.env.example` (expanded) — self-serve install helpers and config contract.
- `docs/install.md`, `docs/rebrand.md`, `docs/operator.md` — buyer/operator documentation.
- `src/app/(install)/setup/*` or `src/app/setup/*`, `src/middleware.ts` (install/licensing guards) — first-run wizard (license, domain, DB, admin, storage/payments).
- `src/lib/license.ts`, `src/lib/install-state.ts` — activation client, local license state, revalidation policy, install-complete state.
- `src/lib/branding.ts`, `src/app/admin/branding/page.tsx`, `src/app/api/admin/branding/route.ts` — runtime branding config and admin UI.
- `prisma/schema.prisma` (extend: `Installation`, `BrandingConfig`/settings, license state fields) — persisted install/branding/license records.
- `license-service/` — owner service: key create/activate/revoke/move, site binding, authenticated dashboard, API for app activation/revalidation, its own schema/migrations.
- `tests/unit/license.test.ts`, `tests/unit/branding.test.ts`, `tests/e2e/setup.spec.ts` — automated checks.

## Task Structure (high level)

### Task 1: Packaging baseline (Docker/Compose) and install docs skeleton
- **Interfaces:** Produces reproducible `docker compose up` path for app+db with env-driven config and `docs/install.md` skeleton (prereqs, env vars, first-run). Budget-aware (small images, managed DB option documented).
- **Steps:** define `Dockerfile`/`docker-compose.yml`; add failing smoke test/script that compose config validates; implement; `docker compose config`/local bring-up sanity; commit.

### Task 2: Installation state and first-run setup wizard
- **Interfaces:** Consumes Task 1. Produces install-complete gate, persisted `Installation` state, and setup flow collecting **domain, DB, admin account, storage/payments keys** (license step stubbed until Task 4). Secure storage of secrets.
- **Steps:** schema/migration for install/branding state; failing tests for "not installed → redirect to setup" and "installed → normal routes"; implement wizard steps + guards; verify; commit.

### Task 3: Runtime branding system (admin rebrand without code)
- **Interfaces:** Consumes Task 2/admin. Produces `BrandingConfig` (site name, logo, colors, copy/metadata) editable in admin UI, applied at runtime with safe defaults; `docs/rebrand.md`.
- **Steps:** failing tests for default branding and persisted override; implement model, API, admin branding page, theme application; verify; commit.

### Task 4: Owner license service/dashboard (create/activate/revoke, one-site bind, site-move)
- **Interfaces:** Produces owner-operated service with authenticated dashboard/API to **create, activate, revoke** keys, bind to one live site (domain/instance identifier), and handle **site-move** (deactivate/reactivate or reissue). Persists license records and activation history.
- **Steps:** define license data model and activation API contract; failing tests for issue/activate/bind/revoke/move invariants (one active site per key); implement service + minimal dashboard; verify; commit.

### Task 5: App license activation client and enforcement
- **Interfaces:** Consumes Task 4 API and Task 2 setup. Produces first-run **license key** step with online activation, stored activation state, periodic/heartbeat revalidation with documented **grace period** **[Builder call]**, and enforcement/UX for invalid, revoked, or unreachable-license states.
- **Steps:** failing tests for valid activation, revoked/invalid rejection, and grace-period behavior on unreachable service; implement `src/lib/license.ts`, setup step, middleware/guards, and operator messaging; verify; commit.

### Task 6: Docs, packaging hardening, and end-to-end verification
- **Interfaces:** Produces complete `docs/install.md`, `docs/rebrand.md`, `docs/operator.md` (backups/updates, license troubleshooting, site-move request flow) and a verified clean-install path.
- **Steps:** failing e2e/smoke for fresh install → activate → setup → rebrand happy path (with license service test double or staging); implement doc/hardening fixes; full lint/test/build and compose verification; commit.

## Open decisions (must resolve/confirm during this plan)

- **Activation policy [Builder call]:** heartbeat interval and grace-period length; behavior when license service unreachable (degrade vs. lock) — balance availability and protection.
- **Site binding identifier:** domain, instance ID, or both; exact site-move procedure (owner reissues/reactivates) exposed in dashboard.
- **Packaging/protection level:** distributed artifact form and exact license terms (what buyers may/may not do, resale/sharing restrictions) — legal/business decision affecting implementation.
- **License service deployment:** where/how owner runs it cheaply/reliably (can be separate low-cost host); auth for owner dashboard.

## Self-Review

1. **Spec coverage:** self-serve Docker install + docs, first-run setup (license/domain/DB/admin/storage+payments), online activation against owner service, one-site license + site-move, owner dashboard create/activate/revoke, runtime rebranding (name/logo/colors/copy/metadata) without code — all mapped to tasks.
2. **Interfaces:** Task 4 defines activation API consumed by Task 5; Task 2 provides install state/guards consumed by 3/5; packaging (1) underpins all.
3. **Review Focus:** unlicensed/revoked enforcement, outage/grace policy, one-site binding/moves, install security, rebrand isolation each have owning tasks/tests.
4. **Proportion:** decisions, paths, behaviors, and test expectations stated without full implementations; builder writes bodies to satisfy contracts.

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-11-10-installable-licensed-rebrandable-package.md`.** This plan depends on Plan 1 foundations (auth/admin/settings/config patterns) and should be sequenced after core app plans as appropriate, but its install/licensing/rebrand contracts can be designed now.

Please review this plan together with the updated design (`docs/superpowers/specs/2026-11-10-adult-tiktok-video-site-design.md`) and the adjusted Plan 1. Do these capture what you want (including **online activation, one live site per license with owner-handled site moves, Docker self-serve install, admin rebranding, and your license dashboard**)? If you approve, tell me and I’ll proceed with the chosen execution approach (I recommend **Subagent-driven** for the same reasons as Plan 1, once we start building). I can also draft the remaining follow-on plans (media, payments/entitlements, messaging/social, moderation/ops) on request.