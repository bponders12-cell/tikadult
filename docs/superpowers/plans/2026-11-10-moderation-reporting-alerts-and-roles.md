# Adult TikTok-Style Site — Plan 5: Moderation, Reporting, Flags, Alerts & Roles

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver reporting/complaints handling and moderation operations: user reports (videos, messages, profiles), flagged-content review (post-publish), admin alerts and review workflows with audit trail, and staff/role permissions so trusted people can help manage.

**Architecture:** Extend Plan 1 admin shell and Plan 2 flagging hooks. Central moderation queue aggregating user reports and automated flags; action handlers (dismiss/warn/restrict/remove/suspend/ban) with audit logging. Notification/alert layer for new/high-severity items (in-app admin, optional email **[Builder call]**). Role/permission model for owner/admin/staff scopes.

**Tech Stack:** Next.js/TypeScript, Prisma/PostgreSQL, Vitest/Playwright, optional email/notification provider **[Builder call]**.

**Spec:** `docs/superpowers/specs/2026-11-10-adult-tiktok-video-site-design.md`

## Global Constraints

- **Upload-to-live (decided):** live after automated checks; flagged items go to admin review (post-publish).
- **Admin needs (decided):** logs, usage, user counts, registrations, complaints, money flow; alerts + admin review area; ability to add trusted staff/employees later.
- **18+ only**; enforce baseline illegality/non-consent prohibitions. Specific prohibited categories and response-time expectations are **open**.
- Budget ~\$100/month.

## Review Focus

- **Report/flag intake completeness:** reports on videos/messages/profiles and automated flags all create reviewable records with sufficient context.
- **Access control on moderation actions:** only authorized roles can view/act; actions are audited (who/what/when/why).
- **Effectiveness of actions:** remove/restrict/suspend/ban actually prevent access/visibility as intended and are reversible where specified.
- **Alert surfacing:** new/urgent items generate admin-visible alerts per policy **[Builder call]** without noisy/costly infrastructure.

## File Structure

- `prisma/schema.prisma` (extend `Report`, `Flag`, `ModerationAction`/audit, role/permission assignments).
- `src/lib/moderation.ts`, `src/lib/alerts.ts`, `src/lib/rbac.ts` (extend) — moderation logic, alerts, permissions.
- `src/app/api/reports/*`, `src/app/api/admin/moderation/*`, `src/app/api/admin/alerts/*` — intake and admin actions.
- `src/app/admin/moderation/*`, `src/app/admin/reports/*`, `src/app/admin/users/*` — review queues and dashboards.
- `tests/unit/moderation.test.ts`, `tests/unit/rbac-moderation.test.ts`, `tests/e2e/report-review.spec.ts`.

## Tasks (high level)

### Task 1: Report/flag data model and intake
- Unified/linked records for user reports and system flags with context (item/user, reporter, reason, history pointers). Failing tests → implement → commit.

### Task 2: Admin review queue and actions with audit trail
- Queue views and actions: dismiss, warn, restrict/remove content, suspend/ban user; persist resolution notes and audit entries. Failing tests for state transitions and audit → implement → commit.

### Task 3: Alerts and dashboard integration
- In-app admin notifications/alerts on new reports/flags (severity/volume cues **[Builder call]**); optional email hook; surface complaints/flags counts in admin dashboard. Failing tests → implement → commit.

### Task 4: Staff/employee roles and scoped permissions
- Create/manage trusted staff users and grant scoped permissions (e.g. moderation/support/ops subsets) without full owner access. Failing tests for allow/deny by scope → implement → commit.

### Task 5: Verification and policy notes
- Lint/test/build/e2e; document prohibited-content baseline and open response-time expectations → commit.

## Open decisions
- Specific prohibited categories beyond illegality and report response/triage expectations; alert thresholds/channels; exact permission matrix for staff roles.

## Execution Handoff
Follow-on Plan 5; depends on Plan 1 (admin/auth), Plan 2 (media flags), and integrates with Plan 4 (message/profile reports). Start building only after explicit approval/scheduling.