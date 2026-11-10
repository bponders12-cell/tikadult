# Adult TikTok-Style Site — Plan 7: Cost Hardening, Compliance/Provider Validation, and Production Rollout

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Validate and harden the platform for real-world operation: prove/fit the ~$100/month early cost envelope, resolve compliance and provider eligibility blockers (adult content, payments, jurisdiction/age/consent records), finalize production deployment/ops on `tik.earnable.store` (and buyer installs), and complete go-live readiness.

**Architecture:** Cross-cutting hardening over Plans 1–6: cost instrumentation and limits, configuration for geo/age/compliance controls, provider integration choices validated against policy, deployment/IaC-lite runbooks for AWS/Azure/low-cost targets, backup/security/observability baselines, and a staged rollout checklist.

**Tech Stack:** Existing app/service stack plus cloud provider tooling (AWS/Azure) as selected, monitoring/logging services within budget, payment/storage providers chosen after validation, Docker/Compose deploy artifacts (Plan 6).

**Spec:** `docs/superpowers/specs/2026-11-10-adult-tiktok-video-site-design.md` (especially Risks and open questions, Anti-goals).

## Global Constraints

- **Failure condition (decided):** hosting/running costs must not exceed income one year from launch. **Budget now:** ~$100/month — treat as hard early constraint.
- **18+ only (decided)**; jurisdictions/age-verification depth/consent & record-keeping standards **open/high risk** — must be resolved before launch.
- **Payments (tentative):** PayPal/Stripe maybe — **adult-content eligibility and business/banking readiness must be validated**; compliant fallback required.
- **Licensing/activation (decided):** online activation, one live site per license, owner service — reliability, grace policy, and terms must be finalized for production sale.
- Working domain now `tik.earnable.store`; final domain TBD.

## Review Focus

- **Cost model validated:** measured/estimated storage, egress, transcoding, compute, and third-party fees fit target; quotas/limits and alerts prevent overrun.
- **Compliance readiness:** chosen age-gating/verification, geo policy, consent/record-keeping, and terms/acceptable-use align with selected jurisdictions and provider requirements (documented decisions/evidence).
- **Provider eligibility:** payment and infrastructure providers confirmed acceptable for adult content and required features (splits/payouts where needed), or compliant alternatives selected and integrated.
- **Operational readiness:** deploy, backups, restore, secret management, monitoring/alerts, incident/report handling, and license-service availability/runbook are in place.
- **Security baseline:** auth/session hardening, transport security, least-privilege access, secure config/secrets, and abuse/rate limiting appropriate to budget.

## File Structure

- `docs/ops/cost-model.md`, `docs/ops/compliance-readiness.md`, `docs/ops/production-runbook.md`, `docs/ops/rollout-checklist.md` — evidence, decisions, and procedures.
- `deploy/` (extend), infra-as-code or scripted provisioning (lightweight) **[Builder call]** — repeatable deploy.
- `src/lib/limits.ts`, config/quotas, monitoring hooks — enforced cost/safety limits.
- Provider integration configs/adapters updates (payments/storage/media) — validated choices.
- `tests/` (smoke/load sanity where feasible, config/limit tests) — verification.

## Tasks (high level)

### Task 1: Cost measurement, quotas, and guardrails
- Instrument/estimate key drivers (storage, egress, transcode, compute, DB, third-party); implement enforceable quotas/limits, lifecycle policies, and spend/usage alerts. Failing tests for limit enforcement → implement → commit.

### Task 2: Compliance and jurisdiction decisions → controls
- Resolve/record: operating entity/jurisdictions served or blocked, age assurance level, consent/record-keeping approach, terms/acceptable-use. Implement required controls (geo/age flows, records hooks) per decisions. Failing tests for gating/controls → implement → commit.

### Task 3: Provider validation and integration finalization
- Confirm adult-content eligibility and capabilities for payments (PayPal/Stripe/fallback), storage/CDN, hosting; finalize integrations, KYC/payout/business-banking prerequisites documented. Integration tests/smoke with chosen providers → commit.

### Task 4: Production deployment, security, and observability
- Hardened deploy path (AWS/Azure/low-cost target), TLS/domain config for `tik.earnable.store`, backups/restore, secrets, logging/metrics/alerts, rate limiting/abuse controls. Runbook and smoke verification → commit.

### Task 5: Licensing production readiness and rollout
- Finalize activation/grace policy, site-move procedure, license-service deployment/availability, and (as applicable) license terms/packaging decisions; execute rollout checklist and staged go-live. Docs and verification → commit.

## Open decisions (must close before launch/sale)

- Jurisdictions served/blocked, entity/banking, age/consent/record-keeping standard.
- Confirmed payment/storage/hosting providers and pricing; revenue split value (70 or 80).
- Prohibited-content categories and response-time expectations.
- Activation grace/outage policy, license terms and packaging/protection level.

## Execution Handoff
Follow-on Plan 7 (capstone/cross-cutting); depends on outputs of Plans 1–6. Many items require owner/business actions and external confirmations—plan must track decisions and evidence. Start building/hardening tasks only after explicit approval/scheduling.