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