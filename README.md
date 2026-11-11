# Untitled Project (Foundation Skeleton)

Greenfield Next.js (App Router, TypeScript) foundation for an 18+ video site. This bootstrap establishes the runnable app and quality gates; media pipeline, payments, messaging, and moderation ship in follow-on plans.

- **Working domain:** `tik.earnable.store` (final domain TBD)
- **Budget constraint:** ~`$100/month` baseline (avoid always-on heavy services)

## Prerequisites

- **Node.js 20+** (tested with current LTS)
- **npm** (ships with Node). `pnpm` may also be used if installed.
- PostgreSQL available for future tasks (`DATABASE_URL`); not required for this bootstrap.

## Setup

```bash
npm install
cp .env.example .env   # on Windows PowerShell: Copy-Item .env.example .env
```

Edit `.env` with real values. **Never commit secrets.**

## Environment variables

See [`.env.example`](.env.example) for the contract:

- `DATABASE_URL` — PostgreSQL connection string for Prisma.
- `NEXTAUTH_SECRET` — strong random secret for Auth.js/NextAuth sessions.
- `NEXTAUTH_URL` — public base URL of the app (e.g. `https://tik.earnable.store`).

## Commands

```bash
npm run dev       # start dev server
npm run build     # production build
npm run start     # start production server
npm run lint      # ESLint
npm run test      # unit tests (Vitest)
npm run test:e2e  # end-to-end tests (Playwright)
```

## Health and ops

- `GET /api/health` returns `{ "status": "ok" }` for basic runtime checks.
- See [`docs/ops/cost-and-deploy-notes.md`](docs/ops/cost-and-deploy-notes.md) for budget assumptions (~`$100/month`), cost drivers (storage/transcode/egress), guardrails, and launch validation TODOs.

## Notes

- 18+ only product (age gate enforced in foundation; deeper compliance/verification decisions remain open).
- Keep dependencies and infrastructure aligned with the ~`$100/month` budget baseline.
- Follow-on plans: media pipeline, entitlements/payments, social/messaging/privacy, moderation/ops, installable licensed package. See `docs/superpowers/plans/` and spec in `docs/superpowers/specs/`.
