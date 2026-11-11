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
- **Payments:** validate PayPal/Stripe adult-content eligibility, splits/payouts support, and business entity/banking readiness; select compliant fallback if not viable.
- **Compliance/jurisdiction:** define operating entity/jurisdictions served or blocked; age assurance level; consent/record-keeping standards (beyond 18+ gate); terms/acceptable-use.
- **Licensing/activation (packaging plan):** owner-operated license service reliability/cost, activation grace/outage policy, one-site binding and site-move flow, and license terms/packaging.
- **Provider/infra selection:** confirm costed choices for DB, storage/CDN, hosting, and any managed services fit ~$100/month early target at expected scale.

## Media pipeline (Plan 2)

### Cost drivers
- **Storage:** every accepted upload is kept as-is (no transcode), so stored bytes = uploaded bytes. Caps below bound it per user and site-wide. Passthrough `web` assets share the original's storage key, so there is no second copy.
- **Egress:** the dominant recurring cost once there is traffic. Delivery currently streams from app storage with Range support (`/api/media/[id]/asset/[kind]`); public+live responses are cache-friendly (`Cache-Control: public, max-age=3600`) so a CDN can absorb nearly all of it.
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
| `MEDIA_DRAFT_TTL_HOURS` | 24 | Abandoned drafts older than this are deleted with their bytes | cleanup runner |
| `MEDIA_REMOVED_RETENTION_DAYS` | 30 | Bytes of `removed` media are deleted after this; record kept as tombstone | cleanup runner |

Defaults are sized for the budget: 50 GB of object storage is roughly $1-2/month at typical S3-compatible prices, leaving room; 2 GB/user (about 7 max-size videos) stops a single account consuming a material share. Invalid or non-positive env values fall back to the default. Quota checks run at init using declared `sizeBytes`; the PUT still enforces the real per-file cap. Concurrent inits can overshoot by a request or two (no transaction); acceptable at this scale.

`runMediaCleanup()` (`src/workers/media-cleanup.ts`) is an importable runner, not a scheduler: wire it to a cron-triggered route or admin action alongside `runPendingMedia()`. Bytes are deleted before rows so failures retry on the next run.

### Production storage
`getStorage()` throws a configuration error when `NODE_ENV=production` and the `S3_*` variables are absent. Local-disk fallback is dev-only because hosted filesystems are typically ephemeral and would silently lose uploads.

### Passthrough (no transcode) decision and seams
Only web-safe formats are allowed (mp4/webm video, jpg/png/webp images) so the original can be played directly. Swap points when this stops being enough:
- **Probe:** `MediaProbe` in `src/lib/media/probe.ts` (pure-TS today; replace with ffprobe).
- **Transcoder/thumbnailer:** `buildPlaybackVariants` in `src/lib/media/processing.ts` (today returns a `web` reference to the original; no thumbnails generated).
- **CDN/object delivery:** the asset route and the `upload` descriptor returned by `POST /api/media` (replace with presigned URLs / CDN origin).

### Launch-validation TODOs (media)
- **Migrations:** no database exists in dev, so migration SQL has not been generated; run `prisma migrate dev` against a real PostgreSQL before launch and review the media/asset tables. Note `Media.sizeBytes` is a 32-bit `Int` (fine under the 300 MB cap).
- **S3 adapter:** `S3StorageAdapter` is a contract stub; implement (SigV4 over fetch or SDK) and test against the chosen provider before production, since production now refuses local storage.
- **CDN:** choose and front delivery with a CDN (cache public+live assets, honor Range); measure egress per active viewer to validate the $100/month budget.
- **Scheduling:** schedule `runMediaCleanup` and `runPendingMedia`; add spend/usage alerting and admin visibility of the global-ceiling warning (later plans).
