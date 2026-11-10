# Adult TikTok-Style Site — Plan 2: Media Pipeline & Creator Upload-to-Live

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver creator media management and a cost-aware upload-to-live pipeline: TikTok-like creator/upload area, short-video/image uploads (max 5 min video), automated checks, publish-after-checks with flagging to admin review, storage/delivery suitable for ~$100/month early scale, and category association.

**Architecture:** Extend Plan 1 app with creator-facing upload/manage UI and server APIs. Store originals in low-cost object storage (S3-compatible/R2-class **[Builder call]**) and serve web playback via CDN/object delivery; perform lightweight automated checks and budget-conscious transcoding/processing (async job/queue abstraction that can run on minimal infra). Media records, processing status, visibility/pricing metadata persisted in DB.

**Tech Stack:** Next.js/TypeScript, Prisma/PostgreSQL, object storage SDK (S3-compatible), FFmpeg-based or managed-light processing path **[Builder call]** within budget, background job runner (simple DB/queue worker) **[Builder call]**, Vitest/Playwright.

**Spec:** `docs/superpowers/specs/2026-11-10-adult-tiktok-video-site-design.md`

## Global Constraints

- **Upload-to-live (decided):** go live right after automated checks pass; flag and surface in admin review area (post-publish).
- **Video limit:** max length 5 minutes. **[Builder call]** enforce upload size/format caps and quotas to fit ~\$100/month.
- **18+ only**, budget ~\$100/month (storage/egress/transcode are dominant costs), env-driven/runtime-configurable foundation from Plan 1.
- **Creator control:** mark public/private/restricted and set unlock price; manage from creator/upload area (TikTok-like flow). Entitlement enforcement/purchases in Plan 3.

## Review Focus

- **Automated checks gate:** videos > 5 min or invalid/corrupt uploads must not publish; passing uploads become live without manual pre-approval.
- **Flag-to-review path:** items flagged by checks/rules appear in admin review queue with status/context (consumed fully in Plan 5).
- **Cost controls:** hard caps/quotas and lifecycle rules prevent runaway storage/egress/transcode spend.
- **Visibility metadata correctness:** public vs private/restricted/paid flags and price fields persist accurately (enforcement in Plans 3/4).

## File Structure

- `src/app/(creator)/upload/page.tsx`, `src/app/(creator)/studio/page.tsx` — creator/upload & manage UI.
- `src/app/api/media/*` — upload/init, complete, list/manage endpoints.
- `src/lib/media/storage.ts`, `src/lib/media/processing.ts`, `src/lib/media/checks.ts` — storage, processing, automated checks.
- `src/workers/media-worker.ts` (or equivalent) — async processing/check pipeline.
- `prisma/schema.prisma` (extend `Media`, assets, processing/flag fields) — metadata & status.
- `tests/unit/media-checks.test.ts`, `tests/e2e/upload.spec.ts` — checks and flow.

## Tasks (high level)

### Task 1: Media schema and storage abstraction
- Models for `Media`/assets (owner, type video/image, category, visibility, price/access metadata, duration/size/format, processingStatus, publish/flag state), migrations. Storage interface with local/dev and S3-compatible adapters. Failing schema/storage tests → implement → commit.

### Task 2: Creator upload & studio UI (TikTok-like flow)
- Upload form (file, caption/tags/category/thumbnail where applicable), set public/private/restricted and unlock price, manage posted items. Failing UI/API contract tests → implement → commit.

### Task 3: Automated checks and processing pipeline
- Validate duration (<=5 min), format/size caps, basic integrity; generate web playback variant/thumbnail within budget constraints **[Builder call]**. On pass: publish live. On flaggable condition: mark flagged for review. Failing unit tests for pass/fail/flag cases → implement worker/pipeline → commit.

### Task 4: Playback integration in feed/profile shells
- Serve published media in category feed/profile contexts using adaptive/efficient delivery; placeholders replaced with real playable items where available. Failing integration tests → implement → commit.

### Task 5: Cost quotas, lifecycle, and verification
- Per-user/global quotas, retention/lifecycle hooks, and ops notes; full lint/test/build and pipeline smoke verification → commit.

## Open decisions
- Exact codecs/resolutions/bitrates and transcode strategy within ~$100/month; storage/CDN provider choice; max file size; thumbnail/poster generation approach.

## Execution Handoff
Plan saved as follow-on (Plan 2). Review alongside spec and Plan 1; sequence after/with Plan 1 foundation as dependencies allow. **Subagent-driven** recommended for multi-step pipeline work. Start building only after explicit approval/scheduling.