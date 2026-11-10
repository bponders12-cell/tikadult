# Adult TikTok-Style Site — Plan 4: Social, Friends, Messaging & Configurable Privacy

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver social features—extended profiles, friends/connections, instant/direct messaging—and enforce fully user-configurable privacy/messaging controls with safe defaults and basic safety (block/report hooks).

**Architecture:** Extend Plan 1 user/profile/settings foundations. Add social graph (friend requests/connections), messaging (conversation/message store and real-time-ish delivery **[Builder call]** within budget), and a permission layer that resolves visibility and messaging access from each user’s settings. Messaging delivery can start with polling/short-interval fetch or lightweight realtime on low-cost infra **[Builder call]**.

**Tech Stack:** Next.js/TypeScript, Prisma/PostgreSQL, server actions/API routes, optional lightweight realtime channel (SSE/websocket on managed/low-cost host) **[Builder call]**, Vitest/Playwright.

**Spec:** `docs/superpowers/specs/2026-11-10-adult-tiktok-video-site-design.md`

## Global Constraints

- **Messaging & privacy (decided):** fully user-configurable. 18+ only.
- **[Builder call] defaults:** reasonably open social defaults users can change (e.g. messages/requests allowed with basic limits); profile items public unless marked private/paid; controls to restrict who can message (everyone/friends-followers/no one) and block/report. Exact option set finalized in implementation/UI.
- Budget ~\$100/month; avoid heavy always-on realtime infra if avoidable.

## Review Focus

- **Permission enforcement:** profile sections/items and messaging endpoints must honor the target user’s configured privacy/messaging settings (and blocks) on every read/send, not just UI hiding.
- **Paid/private boundary:** items marked private/paid remain inaccessible except per entitlement/allowed audience (integrates with Plan 3 enforcement).
- **Safety controls:** block prevents messaging/interaction as specified; report hooks route to moderation surfaces (Plan 5).
- **Configurability:** settings changes take effect consistently and persist per user.

## File Structure

- `prisma/schema.prisma` (extend friendship/request, conversation/message, block/report-hook models; refine privacy/messaging prefs).
- `src/lib/privacy.ts`, `src/lib/messaging-permissions.ts` — permission resolution helpers.
- `src/app/api/friends/*`, `src/app/api/messages/*` — social and messaging APIs.
- `src/app/messages/*`, `src/app/profile/[handle]/*` (extend) — messaging UI and profile privacy-aware views.
- `src/components/social/*`, `src/components/messages/*` — UI components.
- `tests/unit/privacy.test.ts`, `tests/unit/messaging-permissions.test.ts`, `tests/e2e/messaging.spec.ts`.

## Tasks (high level)

### Task 1: Social graph (friends/connections)
- Friend request/accept/decline/remove, list connections; respect privacy where applicable. Failing tests → implement → commit.

### Task 2: Privacy settings model and enforcement layer
- Normalize/configure privacy and messaging preference options (who can view sections/items, who can message) with safe defaults; central `canView`/`canMessage` helpers. Failing tests covering default/changed/blocked cases → implement → commit.

### Task 3: Instant/direct messaging
- Conversations and messages between permitted users; delivery mechanism suitable for budget **[Builder call]**; block enforcement. Failing tests for send/receive permission and block behavior → implement → commit.

### Task 4: Profile integration and safety hooks
- Privacy-aware profile rendering (public/friends/private-paid sections) and report/block entry points wired for Plan 5. Failing tests → implement → commit.

### Task 5: Verification and docs
- Lint/test/build/e2e; document messaging/privacy defaults and limits → commit.

## Open decisions
- Exact messaging transport (polling vs SSE/websocket) within budget; precise default matrix and rate/abuse limits.

## Execution Handoff
Follow-on Plan 4; depends on Plan 1 (users/settings/profiles) and integrates with Plan 3 (paid/private access) and Plan 5 (reports). Start building only after explicit approval/scheduling.