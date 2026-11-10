# Adult TikTok-Style Site — Plan 1: Foundation, Auth, and Core Skeleton

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up a deployable, cost-aware web app skeleton on `tik.earnable.store` with 18+ gating, user auth/profiles, category browsing shell with a TikTok-style vertical feed layout, and an admin shell for future ops—producing working, testable software with no media upload or payments yet.

**Architecture:** Greenfield TypeScript web app (Next.js App Router) with a PostgreSQL database (Prisma ORM) and server-side API route handlers. Mobile-responsive UI implements the immersive swipe-feed shell and layout-toggle setting; media delivery/processing, payments, messaging, and full moderation workflows are deferred to follow-on subsystem plans. All choices marked **[Builder call]** are defaults, not owner commitments.

**Tech Stack:** Node.js 20+, Next.js (App Router, React, TypeScript), Prisma, PostgreSQL, Auth.js/NextAuth (credentials or magic-link baseline) or equivalent session auth, Vitest + React Testing Library, Playwright (smoke/e2e), ESLint/Prettier, Docker (optional local parity). Deploy target: low-fixed-cost managed hosting on AWS/Azure-compatible path (e.g. container/app service) sized to ~\$100/month baseline; object storage/CDN for future media (Cloudflare R2/S3-compatible) planned but not required to complete this plan.

**Spec:** `docs/superpowers/specs/2026-11-10-adult-tiktok-video-site-design.md` (this plan argues from the spec; read the spec alongside this plan). **Packaging/licensing addendum:** `docs/superpowers/plans/2026-11-10-installable-licensed-rebrandable-package.md` extends scope (self-serve install, online license activation, owner license service, rebranding, docs).

## Scope Check

The spec covers multiple independent subsystems (feed/player & discovery, media upload/transcode/delivery, monetization/entitlements/payments & payouts, social graph & messaging, moderation/reporting/alerts, admin/ops/roles, compliance, and **installable/licensed/rebrandable packaging + license service**). Per brainstorming guidance, these should be delivered as separate plans, each producing working, testable software. **This is Plan 1 (foundation).** Follow-on plans: (2) Media pipeline & creator upload-to-live, (3) Entitlements, payments, and money flow, (4) Social, friends, messaging & configurable privacy, (5) Moderation, reporting, flags, alerts & roles, (6) **Installable, licensed, rebrandable package & license service** (see packaging plan), (7) Cost hardening, compliance/provider validation, and production rollout. Plan 1 should keep branding/install hooks pluggable (runtime-configurable branding/settings and env-driven config) but does not implement licensing/installer.

## Global Constraints

- **18+ only** access (decided).
- **Working domain:** `tik.earnable.store` for now (final domain TBD; buyers set their own domain at install in packaging plan).
- **Budget now:** ~\$100/month (hard constraint); favor low fixed baseline and cost-aligned/usage-based components.
- **Sellable/licensed/rebrandable (decided):** self-serve Docker-based install, first-run setup with **license key + online activation** (owner-controlled service), one live site per license with owner-handled site moves, runtime rebranding (name/logo/colors/copy/metadata) without code, install/rebrand docs. Foundation must keep config/env-driven and branding/settings runtime-configurable to support this (implementation in packaging plan).
- **Uploads-to-live (future, decided):** go live right after automated checks pass; flagged items surface in admin review area (implemented in follow-on plans; foundation must not assume pre-review).
- **Privacy/messaging:** fully user-configurable (implemented in follow-on plan; foundation stores settings hooks/defaults only).
- **Video limit (future):** max length 5 minutes.
- **Monetization model (future):** flat split across the board, creator 70–80% / site remainder (exact % TBD, configurable platform setting); access options monthly/yearly/one-time/per-video.
- **Payment preference (tentative):** PayPal/Stripe maybe — subject to adult-content eligibility; must allow compliant fallback.
- **Failure condition:** hosting/running costs must not exceed income one year from launch.
- **Builder calls** in spec/plan are defaults I recommend, not owner commitments.

## Review Focus

- **Under-18 / no age affirmation:** entry must block access to adult content until an explicit 18+ confirmation is recorded for the session/account; refreshing or deep-linking must not bypass the gate.
- **Unauthenticated/unauthorized access to admin surfaces:** `/admin` and admin data/actions must be inaccessible without an authenticated admin role; direct URL/API access must be denied.
- **Feed/layout toggle regressions:** immersive+panel is default and a user setting toggles to an always-visible side layout; preference must persist per user (or session fallback) and render correctly on narrow/mobile and wide screens.
- **Privacy/configurability hooks missing:** profile/privacy/messaging settings must be representable as user-owned, configurable data (even if full enforcement lands later) so later plans do not require a breaking schema rewrite.
- **Cost-footprint creep:** foundation must not introduce always-on heavy services (e.g. managed media transcode, ML, oversized databases) incompatible with ~\$100/month baseline.

## File Structure

> Create these paths (greenfield). Keep units small and responsibility-focused.

- `package.json`, `pnpm-lock.yaml` (or npm), `tsconfig.json`, `next.config.ts`, `.env.example`, `.gitignore`, `README.md` — project config and setup.
- `prisma/schema.prisma`, `prisma/migrations/*`, `src/lib/db.ts` — data model and DB client.
- `src/lib/auth.ts`, `src/lib/age-gate.ts`, `src/lib/rbac.ts` — auth/session helpers, 18+ gate, role checks.
- `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/(gate)/age-gate/page.tsx` — root layout, landing/category entry, 18+ gate UI.
- `src/app/(feed)/c/[category]/page.tsx`, `src/components/feed/SwipeFeed.tsx`, `src/components/feed/VideoSlide.tsx`, `src/components/feed/SidePanel.tsx`, `src/components/feed/LayoutToggle.tsx` — category feed shell and immersive/panel vs side layout.
- `src/app/(auth)/login/page.tsx`, `src/app/(auth)/register/page.tsx`, `src/app/profile/[handle]/page.tsx`, `src/app/settings/page.tsx` — auth and profile/settings surfaces.
- `src/app/admin/page.tsx`, `src/app/admin/layout.tsx` — admin shell/dashboard placeholders (logs/usage/users/registrations/complaints/money-flow tiles as stubs).
- `src/app/api/health/route.ts`, `src/app/api/categories/route.ts` — minimal API endpoints.
- `src/lib/settings.ts` — user-configurable settings (layout, privacy/messaging preferences schema/defaults).
- `tests/unit/*`, `tests/e2e/*`, `playwright.config.ts`, `vitest.config.ts` — automated checks.
- `docs/ops/cost-and-deploy-notes.md` — budget/hosting notes and assumptions.

---

### Task 1: Project bootstrap and quality gates

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `.eslintrc.*` or `eslint.config.*`, `.prettierrc`, `.gitignore`, `.env.example`, `README.md`
- Create: `vitest.config.ts`, `playwright.config.ts`
- Test: `tests/unit/smoke.test.ts`

**Interfaces:**
- Consumes: none (greenfield).
- Produces: runnable Next.js TypeScript app (`dev`, `build`, `test`, `lint` scripts); env var contract in `.env.example` (`DATABASE_URL`, `NEXTAUTH_SECRET`/auth secret, `NEXTAUTH_URL`).

- [ ] **Step 1: Initialize Next.js TypeScript app and install dependencies**

Run: `pnpm create next-app@latest . --ts --eslint --app --src-dir --import-alias "@/*"` (or equivalent npm) then add `prisma @prisma/client vitest @testing-library/react @testing-library/jest-dom playwright` and init configs.  
Expected: `package.json` scripts include `dev`, `build`, `start`, `lint`, `test`, `test:e2e`.

- [ ] **Step 2: Write the failing smoke test**

```ts
// tests/unit/smoke.test.ts
import { describe, it, expect } from "vitest";
describe("bootstrap", () => {
  it("runs the test harness", () => {
    expect(true).toBe(true);
  });
});
```

- [ ] **Step 3: Run test to verify it fails/passes appropriately**

Run: `pnpm test` (or `npx vitest run tests/unit/smoke.test.ts`)  
Expected: FAIL before vitest is configured; PASS after `vitest.config.ts` is added.

- [ ] **Step 4: Add minimal README and `.env.example`**

Document: Node 20+, install/run/test commands, required env vars, note working domain `tik.earnable.store`, and budget constraint ~\$100/month. No secrets committed.

- [ ] **Step 5: Run build and lint**

Run: `pnpm lint && pnpm build`  
Expected: PASS (clean build).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: bootstrap Next.js TypeScript app with test harness"
```

### Task 2: Database schema and seed for core entities

**Files:**
- Create: `prisma/schema.prisma`, `prisma/seed.ts`, `src/lib/db.ts`
- Modify: `.env.example`
- Test: `tests/unit/schema.test.ts` (or Prisma validate/smoke via script)

**Interfaces:**
- Consumes: Task 1 app skeleton, `DATABASE_URL`.
- Produces: Prisma models and client for `User` (id, email, handle, passwordHash/authRef, role `viewer|creator|admin|staff`, ageConfirmedAt, createdAt), `Category` (id, slug, name, sortOrder, active), `UserSettings` (userId, feedLayout `immersive|side`, privacy/messaging JSON or typed fields with safe defaults), and placeholder tables `Profile`/`Media`/`Report`/`Entitlement`/`Transaction` with minimal fields and status enums to avoid breaking rewrites later (full fields in follow-on plans).

- [ ] **Step 1: Write schema expectations as a failing check**

```ts
// tests/unit/schema.test.ts
import { readFileSync } from "fs";
import { describe, it, expect } from "vitest";
const schema = readFileSync("prisma/schema.prisma", "utf8");
describe("schema", () => {
  it("defines core models and 18+/settings fields", () => {
    expect(schema).toMatch(/model User/);
    expect(schema).toMatch(/ageConfirmedAt/);
    expect(schema).toMatch(/model Category/);
    expect(schema).toMatch(/model UserSettings/);
    expect(schema).toMatch(/feedLayout/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/unit/schema.test.ts`  
Expected: FAIL until schema contains required models/fields.

- [ ] **Step 3: Implement Prisma schema and `src/lib/db.ts`**

Define enums/fields above; include `UserSettings` defaults reflecting user-configurable privacy/messaging as extensible (e.g. JSON `privacyPrefs`/`messagingPrefs` with documented defaults) and `feedLayout` default `immersive`. Add placeholder relations for future `Media`, `Report`, `Entitlement`, `Transaction`. Create `src/lib/db.ts` exporting a singleton `PrismaClient`.

- [ ] **Step 4: Validate and migrate**

Run: `pnpm prisma validate && pnpm prisma generate` (and `prisma migrate dev --name init` against local/dev DB)  
Expected: PASS; migration created.

- [ ] **Step 5: Add seed with default categories and an admin bootstrap hook**

Create `prisma/seed.ts` inserting a small fixed category list (e.g. `featured`, `new`, plus a few placeholders) and documenting how to create the first admin user (env-gated) without hardcoding secrets.

- [ ] **Step 6: Run tests**

Run: `pnpm vitest run tests/unit/schema.test.ts`  
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add prisma src/lib/db.ts tests/unit/schema.test.ts package.json .env.example
git commit -m "feat: add core Prisma schema and seed"
```

### Task 3: 18+ age gate

**Files:**
- Create: `src/lib/age-gate.ts`, `src/app/(gate)/age-gate/page.tsx`, `src/middleware.ts` (or equivalent route protection)
- Modify: `src/app/layout.tsx`
- Test: `tests/unit/age-gate.test.ts`, `tests/e2e/age-gate.spec.ts`

**Interfaces:**
- Consumes: Task 2 `User.ageConfirmedAt` (for logged-in users), cookie/session flag for guests.
- Produces: `isAgeConfirmed(request/session): boolean` and `recordAgeConfirmation(...)`; middleware/guard that redirects to `/age-gate` for protected content routes; explicit confirmation action sets persisted flag.

- [ ] **Step 1: Write failing unit tests**

```ts
// tests/unit/age-gate.test.ts
import { describe, it, expect } from "vitest";
import { requiresAgeGate } from "@/lib/age-gate";
describe("requiresAgeGate", () => {
  it("requires gate when not confirmed", () => {
    expect(requiresAgeGate({ ageConfirmed: false }, "/c/new")).toBe(true);
  });
  it("allows when confirmed", () => {
    expect(requiresAgeGate({ ageConfirmed: true }, "/c/new")).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `pnpm vitest run tests/unit/age-gate.test.ts` — Expected: FAIL (module missing).

- [ ] **Step 3: Implement `src/lib/age-gate.ts`, gate page, and middleware**

Gate page shows clear 18+ confirmation (affirmative action). On confirm, set signed/HttpOnly cookie (guest) and persist `ageConfirmedAt` for authenticated users. Middleware redirects unconfirmed requests for feed/category/profile-media routes to `/age-gate?next=...`; allow static/assets/auth endpoints as needed.

- [ ] **Step 4: Write failing e2e for deep-link bypass**

```ts
// tests/e2e/age-gate.spec.ts
import { test, expect } from "@playwright/test";
test("deep link to category is gated", async ({ page }) => {
  await page.goto("/c/new");
  await expect(page).toHaveURL(/age-gate/);
});
```

- [ ] **Step 5: Run unit and e2e**

Run: `pnpm vitest run tests/unit/age-gate.test.ts && pnpm test:e2e tests/e2e/age-gate.spec.ts`  
Expected: PASS (gate enforced; no bypass on refresh/deep-link).

- [ ] **Step 6: Commit**

```bash
git add src/lib/age-gate.ts src/app/(gate)/age-gate/page.tsx src/middleware.ts tests
git commit -m "feat: enforce 18+ age gate"
```

### Task 4: Authentication, roles, and admin guard

**Files:**
- Create: `src/lib/auth.ts`, `src/lib/rbac.ts`, `src/app/(auth)/login/page.tsx`, `src/app/(auth)/register/page.tsx`, `src/app/api/auth/[...nextauth]/route.ts` (if using Auth.js)
- Create: `src/app/admin/layout.tsx`, `src/app/admin/page.tsx`
- Test: `tests/unit/rbac.test.ts`, `tests/e2e/admin-access.spec.ts`

**Interfaces:**
- Consumes: Task 2 `User` (role, ageConfirmedAt).
- Produces: session with `user.id`, `user.role`; `requireRole(session, ["admin","staff"])`; admin layout denies non-admin/staff (redirect/403) for all `/admin` routes and admin APIs.

- [ ] **Step 1: Write failing RBAC tests**

```ts
// tests/unit/rbac.test.ts
import { describe, it, expect } from "vitest";
import { canAccessAdmin } from "@/lib/rbac";
describe("rbac", () => {
  it("denies viewer", () => expect(canAccessAdmin({ role: "viewer" } as any)).toBe(false));
  it("allows admin", () => expect(canAccessAdmin({ role: "admin" } as any)).toBe(true));
});
```

- [ ] **Step 2: Run to verify fail**

Run: `pnpm vitest run tests/unit/rbac.test.ts` — Expected: FAIL.

- [ ] **Step 3: Implement auth and `canAccessAdmin`/`requireRole`**

Wire Auth.js (or minimal credential/session auth) with Prisma adapter/user lookup. Registration sets account as 18+ flow-consistent (record confirmation). Roles: `viewer|creator|admin|staff` (staff for future delegation).

- [ ] **Step 4: Implement admin shell guard and placeholder dashboard**

`/admin` layout checks role server-side; page renders stub tiles: Logs, Usage, User counts, Registrations, Complaints/Flags, Money flow (all "coming in follow-on plans" placeholders) so ops intent is visible.

- [ ] **Step 5: Write failing e2e for admin access control**

```ts
// tests/e2e/admin-access.spec.ts
import { test, expect } from "@playwright/test";
test("unauthenticated user cannot access admin", async ({ page }) => {
  await page.goto("/admin");
  await expect(page).not.toHaveURL(/\/admin$/);
});
```

- [ ] **Step 6: Run tests**

Run: `pnpm vitest run tests/unit/rbac.test.ts && pnpm test:e2e tests/e2e/admin-access.spec.ts`  
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/auth.ts src/lib/rbac.ts src/app/(auth) src/app/admin src/app/api/auth tests
git commit -m "feat: add auth, roles, and guarded admin shell"
```

### Task 5: Profiles and user-configurable settings (layout + privacy/messaging hooks)

**Files:**
- Create: `src/app/profile/[handle]/page.tsx`, `src/app/settings/page.tsx`, `src/lib/settings.ts`, `src/app/api/settings/route.ts`
- Modify: `prisma/schema.prisma` (only if adjustments needed), `src/components/feed/LayoutToggle.tsx`
- Test: `tests/unit/settings.test.ts`, `tests/e2e/layout-toggle.spec.ts`

**Interfaces:**
- Consumes: Task 2 `UserSettings` (feedLayout, privacyPrefs, messagingPrefs), Task 4 session.
- Produces: `getUserSettings(userId)`, `updateUserSettings(userId, patch)` enforcing user-owned updates; settings UI exposes feed layout toggle (`immersive` default, `side` option) and privacy/messaging preference controls (configurable now, enforcement in follow-on plans) with safe defaults.

- [ ] **Step 1: Write failing settings tests**

```ts
// tests/unit/settings.test.ts
import { describe, it, expect } from "vitest";
import { defaultSettings } from "@/lib/settings";
describe("defaultSettings", () => {
  it("defaults to immersive layout and configurable prefs objects", () => {
    expect(defaultSettings().feedLayout).toBe("immersive");
    expect(defaultSettings().privacyPrefs).toBeTypeOf("object");
    expect(defaultSettings().messagingPrefs).toBeTypeOf("object");
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `pnpm vitest run tests/unit/settings.test.ts` — Expected: FAIL.

- [ ] **Step 3: Implement settings lib, API, and pages**

Persist `feedLayout` and extensible privacy/messaging preference structures per user (decided: user-configurable). Profile page shows basic public profile shell; settings page allows toggling layout and editing privacy/messaging preferences (stored now).

- [ ] **Step 4: Run tests**

Run: `pnpm vitest run tests/unit/settings.test.ts`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/profile src/app/settings src/lib/settings.ts src/app/api/settings tests
git commit -m "feat: add profiles and user-configurable settings"
```

### Task 6: Category feed shell (immersive swipe + panel, toggle to side layout)

**Files:**
- Create: `src/app/(feed)/c/[category]/page.tsx`, `src/components/feed/SwipeFeed.tsx`, `src/components/feed/VideoSlide.tsx`, `src/components/feed/SidePanel.tsx`, `src/components/feed/LayoutToggle.tsx`
- Create: `src/app/api/categories/route.ts`
- Modify: `src/app/page.tsx`
- Test: `tests/unit/feed-layout.test.ts`, `tests/e2e/feed.spec.ts`

**Interfaces:**
- Consumes: Task 2 categories; Task 5 `feedLayout` setting (`immersive` | `side`).
- Produces: category route rendering a vertical swipe feed of placeholder video slides (no real media pipeline yet); immersive mode shows video center with slide-out panel/drawer for Comments and Featured; side mode shows always-visible side layout; toggle persists via settings.

- [ ] **Step 1: Write failing layout logic test**

```ts
// tests/unit/feed-layout.test.ts
import { describe, it, expect } from "vitest";
import { resolveFeedLayout } from "@/lib/settings";
describe("resolveFeedLayout", () => {
  it("uses immersive by default", () => expect(resolveFeedLayout(undefined)).toBe("immersive"));
  it("respects side", () => expect(resolveFeedLayout("side")).toBe("side"));
});
```

- [ ] **Step 2: Run to verify fail**

Run: `pnpm vitest run tests/unit/feed-layout.test.ts` — Expected: FAIL.

- [ ] **Step 3: Implement feed components and category page**

`SwipeFeed` supports vertical snap/scroll between `VideoSlide` placeholders (poster/title/creator stub). `SidePanel` contains Comments and Featured stubs; in immersive mode opened on demand, in side mode always visible. Use responsive CSS/breakpoints (mobile + desktop). Actions overlay (rate/comment/share placeholders) present per spec intent.

- [ ] **Step 4: Seed/wire categories and landing**

Home lists categories and links to `/c/[slug]`. `/api/categories` returns active categories.

- [ ] **Step 5: Run tests and manual smoke**

Run: `pnpm vitest run tests/unit/feed-layout.test.ts && pnpm test:e2e tests/e2e/feed.spec.ts` (e2e asserts category page loads, feed renders slides, toggle switches layout class/state).  
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/(feed) src/app/page.tsx src/app/api/categories src/components/feed src/lib/settings.ts tests
git commit -m "feat: add category swipe-feed shell with layout toggle"
```

### Task 7: Health/ops stubs, cost notes, and verification

**Files:**
- Create: `src/app/api/health/route.ts`, `docs/ops/cost-and-deploy-notes.md`
- Modify: `README.md`, `src/app/admin/page.tsx` (link/note stubs)
- Test: `tests/unit/health.test.ts`

**Interfaces:**
- Consumes: app runtime.
- Produces: `GET /api/health` returning `{ status: "ok" }`; ops doc capturing ~\$100/month constraint, chosen baseline assumptions, cost drivers (video storage/egress/transcode), and validation TODOs (provider adult-content eligibility, compliance/jurisdiction, entity/banking for payouts).

- [ ] **Step 1: Write failing health test**

```ts
// tests/unit/health.test.ts
import { describe, it, expect } from "vitest";
import { GET } from "@/app/api/health/route";
describe("health", () => {
  it("returns ok", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `pnpm vitest run tests/unit/health.test.ts` — Expected: FAIL.

- [ ] **Step 3: Implement health route and ops notes**

Health returns 200 JSON. `docs/ops/cost-and-deploy-notes.md` documents: target ~\$100/month, avoid always-on heavy services, strict future media limits/quotas (5 min, caps), need to validate PayPal/Stripe adult eligibility + compliant fallback, and open compliance items (jurisdictions, age/consent/record-keeping, entity/banking).

- [ ] **Step 4: Run full verification**

Run: `pnpm lint && pnpm vitest run && pnpm build` (and `pnpm test:e2e` if environment supports).  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/health docs/ops README.md tests/unit/health.test.ts
git commit -m "chore: add health check and cost/ops notes"
```

## Self-Review

1. **Spec coverage:** 18+ gate (Task 3), categories + immersive swipe feed + panel/side toggle (Task 6), profiles & user-configurable privacy/messaging/layout settings hooks (Task 5), admin shell with ops/money-flow/complaints placeholders (Task 4/7), budget/cost awareness (Global Constraints, Task 7, ops notes), working domain & greenfield bootstrap (Task 1). Media pipeline/upload-to-live, real payments/entitlements, real messaging/friends, and full moderation/alerts/roles are explicitly deferred to named follow-on plans per Scope Check (spec covers multiple subsystems).
2. **Step scan:** Each step is a single checkable action (write test, run, implement signature/file+values, run, commit) with exact commands/expectations or exact schema/field values; no "TBD/handle edge cases" steps.
3. **Type consistency:** `feedLayout` uses `immersive|side` consistently (schema, settings, components); roles `viewer|creator|admin|staff` consistent; `ageConfirmedAt`/gate helpers consistent.
4. **Review Focus:** each item mapped—age bypass (Task 3 e2e), admin unauthorized access (Task 4), layout default/toggle/persist (Tasks 5-6), privacy/messaging configurability represented (Task 2/5), cost creep guarded by constraints/ops notes and no heavy services (Global Constraints/Task 7).
5. **Proportion:** Plan states decisions (paths, models/fields, routes, behaviors) and test/command checks without reproducing full component bodies; implementers write bodies to satisfy signatures/tests.

## Execution Handoff

I recommend **Subagent-driven** for this plan, because it spans several dependent interfaces (schema → auth/gate → settings → feed/admin) across ~7 tasks and mistakes in auth/gating or data shape are costly to unwind—even though a fresh context per task/review costs more. **Native** is reasonable if you want the cheapest/fastest pass in one session.

**Plan complete and saved to `docs/superpowers/plans/2026-11-10-foundation-auth-and-core-skeleton.md`.** This is Plan 1 of a multi-plan effort (see Scope Check for follow-on subsystem plans). Please review the plan. Which execution approach would you prefer, and does it capture what you want? I can also draft the follow-on plans (media pipeline, payments/entitlements, messaging/social, moderation/ops) once you confirm direction.