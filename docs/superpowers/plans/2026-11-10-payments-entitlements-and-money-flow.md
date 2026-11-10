# Adult TikTok-Style Site — Plan 3: Entitlements, Payments, and Money Flow

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement paid access and monetization: entitlements for private collections/items with monthly/yearly/one-time/per-video access, flat platform/creator split (70–80% creator, configurable), payment checkout integration, and money-flow tracking/reporting—subject to adult-content provider eligibility.

**Architecture:** Entitlement/access-grant model linked to purchases and media/collections. Payment provider abstraction to support tentative PayPal/Stripe exploration and a compliant adult-friendly fallback **[Builder call, eligibility-dependent]**. Webhook-driven payment state reconciliation; admin money-flow views fed from transaction records.

**Tech Stack:** Next.js/TypeScript, Prisma/PostgreSQL, payment provider SDK(s)/APIs (eligibility-gated), Vitest/Playwright.

**Spec:** `docs/superpowers/specs/2026-11-10-adult-tiktok-video-site-design.md`

## Global Constraints

- **Free to use;** paid access mainly for private collections and other paid items/videos.
- **Access options (decided):** monthly, yearly, one-time unlock, per-video.
- **Split (decided, % TBD):** flat across the board, creator 70–80% / site remainder; **configurable platform setting** (single value).
- **Payment preference (tentative):** PayPal/Stripe maybe — **adult-content eligibility must be validated**; compliant fallback required.
- Budget ~\$100/month awareness; 18+ only.

## Review Focus

- **Entitlement enforcement:** private/paid content inaccessible without a valid, unexpired grant matching scope (collection/item) and type.
- **Split correctness & configurability:** transactions record gross, platform fee, creator earnings using configured split; changing setting applies per defined policy without corrupting history.
- **Payment state integrity:** only confirmed provider events grant access; idempotent webhook/confirmation handling prevents duplicate grants/charges records.
- **Refund/chargeback awareness:** states represented in money flow even if provider support varies **[Builder call]**.

## File Structure

- `prisma/schema.prisma` (extend `Entitlement`, `Transaction`, `PlatformSetting` for split) — access and money records.
- `src/lib/payments/provider.ts`, `src/lib/payments/entitlements.ts`, `src/lib/payments/split.ts` — provider abstraction, grant logic, split calc.
- `src/app/api/payments/*`, `src/app/api/webhooks/payments/*` — checkout and webhooks.
- `src/app/(pay)/checkout/*`, `src/components/payments/*` — purchase UI/flows.
- `src/app/admin/money/page.tsx` — money-flow reporting view.
- `tests/unit/split.test.ts`, `tests/unit/entitlements.test.ts`, `tests/e2e/purchase.spec.ts` — core correctness.

## Tasks (high level)

### Task 1: Entitlement and transaction schema + split config
- Models for entitlements (scope, type monthly/yearly/one-time/per-video, expiry), transactions (gross/fee/creator/status), configurable platform split setting. Failing tests for split math and grant validity → implement → commit.

### Task 2: Payment provider abstraction and checkout flow
- Provider interface; implement chosen/eligible provider(s) behind it; checkout creation for collection/item/access-type. Failing tests with provider test doubles → implement → commit.

### Task 3: Webhooks/confirmation and access enforcement
- Idempotent handling grants entitlements on confirmed payment; enforce checks in media/profile access paths. Failing tests for grant/deny/expiry and idempotency → implement → commit.

### Task 4: Money-flow admin reporting
- Aggregate purchases, gross, platform cut, creator earnings, status/refunds-chargebacks where available. Failing tests for reporting queries/calcs → implement → commit.

### Task 5: Provider eligibility validation & ops notes
- Document/verify PayPal/Stripe adult-content eligibility and select compliant fallback if needed; env/config wiring. Verification and commit.

## Open decisions
- **Confirmed eligible payment provider** and support for splits/payouts/KYC; business entity/banking readiness; exact refund/chargeback handling; split value (70 or 80).

## Execution Handoff
Follow-on Plan 3; depends on Plan 1 (auth/users) and Plan 2 (media/collections/pricing metadata). Validate provider eligibility early (risk). Start building only after explicit approval/scheduling.