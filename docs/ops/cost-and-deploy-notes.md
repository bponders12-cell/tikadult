# Cost and Deploy Notes (Plan 1 foundation)

## Budget target
- **Now:** ~$100/month (hard early constraint). **Failure condition:** hosting/running costs must not exceed income one year from launch.

## Baseline assumptions (current foundation)
- **Stack:** Next.js (App Router, TypeScript) app; Prisma + PostgreSQL for core data; minimal server-side rendering/API routes. No always-on heavy services in foundation.
- **Hosting direction (to validate):** low fixed-cost managed options on AWS/Azure (or comparable low-cost managed hosting) aligned to usage; avoid oversized always-on databases/compute. Domain for now: `tik.earnable.store`.
- **Local/dev:** lightweight dev DB/config; migrations to be run against a real PostgreSQL `DATABASE_URL` in deploy environments.

## Primary future cost drivers
- **Video storage:** originals and derivatives can grow quickly; plan quotas, retention/lifecycle rules, and per-creator/global caps (max 5 min videos decided).
- **Transcoding/processing:** must be budget-conscious (lightweight/queued, avoid heavy managed transcode unless costed); strict upload size/format/length limits.
- **Egress/CDN delivery:** swipe feeds drive bandwidth; prefer efficient codecs/bitrates, caching/CDN suited to low cost, and usage monitoring.
- **Third-party services:** auth, email/alerts, realtime/messaging, payments, and license/activation service add fixed/variable costs—choose/enable only as needed.

## Guardrails to carry forward
- Keep media limits/quotas (e.g. 5 min max), lifecycle/retention controls, and monitoring/alerts for spend and usage.
- Treat split/pricing and monetization config as data (configurable) and validate economics early (income > costs within a year).
- Avoid ML/heavy recommendation or always-on media workers in early stages.

## Validation TODOs (must resolve before launch/sale)
- **Payments:** desk research done — see [`payment-provider-eligibility.md`](payment-provider-eligibility.md). Its findings:
  - Stripe prohibits adult content.
  - PayPal does not permit sexually oriented digital content (from secondary sources; PayPal's pages could not be fetched).
  - Recommended (desk research only): CCBill primary, Verotel fallback.

  Eligibility is still **unconfirmed** until a provider's underwriting approves an application. Still open: the owner checklist in that doc (entity, banking, application, payout model, fees, split, refund policy) and the card-brand compliance prerequisites.
- **Compliance/jurisdiction:** define operating entity/jurisdictions served or blocked; age assurance level; consent/record-keeping standards (beyond 18+ gate); terms/acceptable-use.
- **Licensing/activation (packaging plan):** owner-operated license service reliability/cost, activation grace/outage policy, one-site binding and site-move flow, and license terms/packaging.
- **Provider/infra selection:** confirm costed choices for DB, storage/CDN, hosting, and any managed services fit ~$100/month early target at expected scale.

## Media pipeline (Plan 2)

### Cost drivers
- **Storage:** every accepted upload is kept as-is (no transcode), so stored bytes = uploaded bytes. Caps below bound it per user and site-wide. Passthrough `web` assets share the original's storage key, so there is no second copy.
- **Egress:** the dominant recurring cost once there is traffic. Delivery currently streams from app storage with Range support (`/api/media/[id]/asset/[kind]`); responses are currently `Cache-Control: private, max-age=3600` + `Vary: Cookie` because delivery now requires the age-gate cookie or a session (browser-cacheable only). A CDN absorbing egress later needs edge-level gating (signed URLs or an age-cookie check at the edge) before public caching can be re-enabled.
- **Processing:** near zero. Checks are a pure-TypeScript probe (container/duration/format sniffing) run inline at upload-complete; no FFmpeg, no queue service, no always-on worker.

### Caps, quotas and lifecycle (env vars)
| Variable | Default | Meaning | Enforced |
| --- | --- | --- | --- |
| `MEDIA_MAX_VIDEO_BYTES` | 314572800 (300 MB) | Max single video upload | upload PUT (413) |
| `MEDIA_MAX_IMAGE_BYTES` | 10485760 (10 MB) | Max single image upload | upload PUT (413) |
| (constant) `MAX_VIDEO_DURATION_SEC` | 300 (5 min) | Max video length | processing check |
| `MEDIA_MAX_ITEMS_PER_USER` | 100 | Max non-removed items per user, drafts included | upload init (429) |
| `MEDIA_MAX_BYTES_PER_USER` | 2147483648 (2 GB) | Max summed `sizeBytes` per user, non-removed | upload init (429) |
| `MEDIA_MAX_TOTAL_BYTES` | 53687091200 (50 GB) | Site-wide storage ceiling | upload init (503 + `console.warn`) |
| `MEDIA_PROCESSING_STALE_MINUTES` | 15 | `processing/processing` items untouched this long are failed (retryable) | worker runner |
| `MEDIA_DRAFT_TTL_HOURS` | 24 | Abandoned drafts older than this are deleted with their bytes | cleanup runner |
| `MEDIA_REMOVED_RETENTION_DAYS` | 30 | Bytes of `removed` media are deleted after this; record kept as tombstone | cleanup runner |

Defaults are sized for the budget: 50 GB of object storage is roughly $1-2/month at typical S3-compatible prices, leaving room; 2 GB/user (about 7 max-size videos) stops a single account consuming a material share. Invalid or non-positive env values fall back to the default. Quota checks run at init using declared `sizeBytes`; the PUT rejects (413) any body larger than the declared size, so the declaration truly bounds the upload. Removed items keep counting toward the bytes quotas until the retention purge clears their asset rows. Concurrent inits can overshoot by a request or two (no transaction); acceptable at this scale.

`runMediaCleanup()` (`src/workers/media-cleanup.ts`) is an importable runner, not a scheduler: wire it to a cron-triggered route or admin action alongside `runPendingMedia()`. Bytes are deleted before rows so failures retry on the next run.

### Production storage
`getStorage()` throws a configuration error when `NODE_ENV=production` and the `S3_*` variables are absent. Local-disk fallback is dev-only because hosted filesystems are typically ephemeral and would silently lose uploads.

### Passthrough (no transcode) decision and seams
Only web-safe formats are allowed (mp4/webm video, jpg/png/webp images) so the original can be played directly. Swap points when this stops being enough:
- **Probe:** `MediaProbe` in `src/lib/media/probe.ts` (pure-TS today; replace with ffprobe).
- **Transcoder/thumbnailer:** `buildPlaybackVariants` in `src/lib/media/processing.ts` (today returns a `web` reference to the original; no thumbnails generated).
- **CDN/object delivery:** the asset route and the `upload` descriptor returned by `POST /api/media` (replace with presigned URLs / CDN origin).

### Launch-validation TODOs (media)
- **Migrations:** no database exists in dev, so migration SQL has not been generated; run `prisma migrate dev` against a real PostgreSQL before launch and review the media/asset tables. `Media.sizeBytes` is `BigInt` (so site-wide `SUM` quota aggregates cannot overflow 32 bits); the records layer converts to `number`.
- **S3 adapter:** `S3StorageAdapter` is a contract stub; implement (SigV4 over fetch or SDK) and test against the chosen provider before production, since production now refuses local storage.
- **CDN:** choose and front delivery with a CDN (cache public+live assets, honor Range); measure egress per active viewer to validate the $100/month budget.
- **Scheduling:** schedule `runMediaCleanup` and `runPendingMedia`; add spend/usage alerting and admin visibility of the global-ceiling warning (later plans).

### Known limits (documented, not fixed in Plan 2)
- **Duration is header-trusted:** it comes only from uploader-written container headers (`mvhd` / EBML `Duration`). A crafted low-bitrate file can exceed 5 real minutes within the size cap. The ffprobe/transcoder seam (`MediaProbe`) closes this.
- **Codecs are not checked:** e.g. HEVC-in-MP4 passes the checks but will not play in Chrome/Firefox.
- **Creator-facing gaps:** `video/quicktime` (iPhone) is rejected at upload init, and duration-less browser-recorded WebM fails as unverifiable.
- **Takedown latency:** delivery sends `max-age=3600`, so cached bytes of a removed/taken-down item can outlive the takedown by up to 1 hour in a viewer's browser; revisit together with CDN/edge gating.
- **Stranded processing:** items left at `processing/processing` (worker died) are reclaimed by `runPendingMedia` into the failed state (draft, "processing interrupted — please retry") once untouched for `MEDIA_PROCESSING_STALE_MINUTES` (default 15, env-configurable). No retry/attempt cap.

## Payments & entitlements (Plan 3)

Code lives in:
- `src/lib/payments/`
- `src/app/api/payments/`
- `src/app/api/webhooks/payments/[provider]/`
- `src/app/(pay)/checkout/`
- `src/app/admin/money/`

Provider research, the recommendation and the owner checklist are in [`payment-provider-eligibility.md`](payment-provider-eligibility.md).

### Environment variables
| Variable | Default | Meaning |
| --- | --- | --- |
| `PAYMENT_PROVIDER` | `fake` outside production; **unset = payments disabled in production** | Name of the payment provider. Only `fake` is implemented. Any other value makes payments unavailable. |
| `PAYMENTS_WEBHOOK_SECRET` | A fixed dev-only value outside production; **required in production** | Webhook signing secret. The fake provider uses it as the HMAC-SHA256 key for the `x-fake-signature` header. |
| `DATABASE_URL` | (existing) | **Required for payments in production.** In-memory money records are not durable, so without it payments are refused. |
| `NEXTAUTH_URL` | (existing) | Used as the origin of the checkout return URLs (`/checkout/result?tx=…`); falls back to the request origin. |

### Production guard
`getPaymentProvider()` (`src/lib/payments/provider.ts`) is evaluated lazily, never at module load, because `next build` runs with `NODE_ENV=production`. In production it throws `PaymentsNotConfiguredError` in any of these cases:
- `DATABASE_URL` is unset;
- `PAYMENTS_WEBHOOK_SECRET` is unset;
- `PAYMENT_PROVIDER` is unset or `fake`;
- `PAYMENT_PROVIDER` names an unknown provider.

The error then surfaces as follows:
- Checkout (`POST /api/payments/checkout`) returns **503** "Payments are not available yet".
- The webhook route returns **503**.
- The dev-only fake hosted checkout (`/checkout/fake`) and `POST /api/payments/fake/simulate` return **404**. They do so in production regardless, and also whenever the configured provider is not `fake`.

Since no real provider exists yet, **payments are off in any production deploy** until an adapter is added.

### Access model
- **Private collection:** all of one creator's media with status `live` and visibility `private` or `restricted`. There is no separate collection table.
- **Access types:**

  | Type | Scope | Term |
  | --- | --- | --- |
  | `monthly` | whole collection | 30 days |
  | `yearly` | whole collection | 365 days |
  | `one_time` | whole collection | never expires |
  | `per_video` | one item | never expires |

- **No auto-renew.** Repeat monthly/yearly purchases stack: a new term starts at the latest current or future end date.
- **Expiry** is evaluated when a grant is read; there is no sweeper job.
- **Prices:**
  - Per-video: `Media.unlockPriceCents`.
  - Collection: per-creator `CreatorPricing` (monthly, yearly and one-time; `null` means not offered).
  - All prices are in USD.
- **Enforcement:** non-entitled viewers get no bytes of a non-public item, thumbnails included. A grant only unlocks media that is `live`.

### Split setting and snapshot policy
- **Setting:** one platform setting, `creatorShareBps`.
  - Allowed range: 7000–8000. Default: **8000 (80% to the creator)**.
  - Viewable by `admin` and `staff` at `/admin/money`; only `admin` can change it.
- **Calculation:** at checkout, `computeSplit(gross, bps)` is stored on the transaction:
  - creator = `floor(gross × bps / 10000)`;
  - platform = the remainder.
- **Snapshot:** changing the setting only affects transactions created afterwards. Reports sum the stored columns and never recompute.
- **Processor fees** are not modelled. They come out of the platform's share unless the owner decides otherwise (see the eligibility doc).

### Refunds and chargebacks
- Only a verified provider event changes a transaction's status. The allowed transitions are:
  - `pending` → `completed` or `failed`
  - `failed` → `completed`
  - `completed` → `refunded` or `chargeback`
  - `pending` or `failed` → `refunded` or `chargeback` — a refund/chargeback that arrives before its
    "completed" event (providers do not guarantee order). The transaction ends refunded/charged back
    with no access; the late "completed" event is then ignored, so no access is granted for returned money.
- `completed` grants exactly one entitlement.
- `refunded` and `chargeback` set that entitlement to `revoked`, so access stops immediately.
- Any other event is a no-op:
  - duplicate (de-duplicated per provider + event id);
  - any other transition (for example "completed" after a refund, or "failed" after "completed");
  - unknown reference — the webhook answers 404 so the provider retries.
- **Refunds can only be received, not started from the app.**
- A reversal of earnings already marked paid keeps `payoutStatus: "paid"`. `/admin/money` reports it as "already paid out to creators". Nothing is recovered automatically.

### Manual payout tracking
- No money is paid out by the app.
- Admins pay creators outside the app, then click "Mark paid" on `/admin/money`.
  - This sets `paid`/`paidOutAt` on that creator's `completed` + `unpaid` transactions completed at or before the moment the page was loaded.
  - It is bookkeeping only.

### Cost impact
- **No new services, workers, queues or cron jobs.** Plan 3 adds three Postgres tables (`PaymentEvent`, `CreatorPricing`, `PlatformSetting`) and extends the existing `Entitlement` and `Transaction` tables.
- **Real-provider costs are not yet incurred.** These are percentage fees (roughly 13–17% published by Verotel), a rolling reserve, and possible Visa/Mastercard high-risk registration fees (listed by CCBill at $950 + $1000 per year). These fees alone could exceed the ~$100/month budget, so see the eligibility doc before choosing a provider.

### Launch-validation TODOs (payments)
- **Migrations:**
  - No migration has been generated for the payment tables.
  - The Prisma code paths are type-checked only and have **not run against PostgreSQL**. This covers settlement transactions, `groupBy` reports, `updateManyAndReturn` payout marking and the date filters.
  - Generate and review the migration, then run the payment unit flows against a real database.
- **No real provider:** an adapter must be built (see "Adding a real provider" in the eligibility doc) after a provider approves an application.
- **The fake provider is dev-only:** no money moves, and it is refused in production.
- **E2E:** `tests/e2e/purchase.spec.ts` is written but **failed** in this environment.
  - Cause: without `DATABASE_URL`, `next dev` gives route handlers and server-rendered pages separate in-memory stores, so the checkout page cannot see media created via the API. This is recorded in Task 3's report.
  - It needs Postgres to pass. Unit and smoke coverage (`tests/unit/purchase-smoke.test.ts`) pass.
- **Known concurrency gap (Prisma):**
  - Two different monthly/yearly purchases for the same buyer and creator that complete at the same moment may overlap instead of stacking.
  - A double grant per transaction is impossible.
- **Compliance before taking adult payments:** pre-publication moderation, complaint/removal handling, creator ID and age verification, and co-performer consent records (card-brand rules; see the eligibility doc).
