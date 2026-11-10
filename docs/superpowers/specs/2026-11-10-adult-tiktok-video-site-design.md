# TikTok-Style Adult Video Site — Design

**Date:** 2026-11-10 (updated 2026-11-10 for installable/licensed packaging)  
**Status:** Draft for review (updated with owner answers + packaging/licensing scope)  
**Working domain:** `tik.earnable.store` (subdomain of existing domain; final domain TBD; buyers will set their own domain during install)

## Intent and why

Build an adult video website that offers a “new way to watch”: TikTok-style, mobile-first-feeling vertical video browsing organized by categories. The goal is to combine a familiar swipe-to-watch experience with creator profiles, social interaction, and direct creator monetization (paid access to private/profile content) while keeping the site free to browse.

It must also be **installable, licensed, and rebrandable** so the owner can sell it as a self-serve package: a buyer can install it on their own server, activate a license, rebrand it, and run it without source-code changes.

Why now: the owner has not seen this combination done this way in this space and sees growth potential, including selling/rebranding the package if it proves profitable.

## Goals

- Let people quickly browse adult videos by category in an immersive, TikTok-like vertical swipe player.
- Let anyone create a profile to share videos and pictures, connect with others, and optionally earn money from paid content.
- Make day-to-day operations easy for the owner (visibility into health, growth, complaints, money) and scalable by adding trusted staff later.
- Make creator self-management easy (profile, uploads, privacy/pricing) without owner intervention for routine actions.
- **Sellable & rebrandable:** package the site so a buyer can self-serve install, license, and rebrand it (no source-code edits) and operate it on their own infrastructure.
- Keep operating costs low enough relative to revenue that hosting/running costs do not exceed income one year from launch (primary success/failure line), and keep the install path compatible with a low-cost (~\$100/month-class) baseline.

## Non-goals

- Building a native mobile app as part of the initial scope (web experience comes first; mobile-friendly/responsive is in scope).
- Finalizing a permanent brand/domain name now (use `tik.earnable.store` initially; buyers set their own domain at install).
- Finalizing the exact platform revenue percentage now (range decided: 70–80% creator share, TBD).
- Live streaming, tipping, or complex subscription bundles beyond the access options listed here (can be future work).
- Providing full, unrestricted source-code redistribution rights to buyers as part of the default sale (distributed as a **licensed** package; exact license terms to be defined).

## Anti-goals (what would make this a failure even if it works)

- **Economics:** hosting and running costs exceed income one year from launch. Cost-awareness is a design constraint, not an afterthought.
- **Operational burden:** the owner cannot easily see or act on logs, usage, registrations, complaints, and money flow, or cannot delegate to trusted staff.
- **Creator friction:** creators cannot manage their own uploads, privacy, and pricing without owner help.

## Who it’s for

- **Viewers (guests and registered users):** come to discover and watch adult videos in a swipe feed, interact (rate/comment/share), follow/add friends, message, and optionally pay to unlock private/profile content. **18+ only (decided).**
- **Creators (registered users):** publish short videos and pictures, manage a profile, control what is public vs. private/paid, and earn from unlocks/purchases.
- **Owner/admin:** runs the platform, monitors health/growth/complaints/money, reviews reports, and manages staff access.
- **Trusted staff/employees (later):** take over subsets of admin/management duties under owner-granted permissions.

## Constraints and assumptions

- **Resources:** access to AWS and Azure now; a dedicated server is possible if it proves a better fit. No existing codebase; no final domain. Starting point is greenfield.
- **Budget (decided):** **~$100/month right now.** This is a hard constraint that strongly shapes hosting, media processing/storage/egress, and third-party service choices.
- **Build decisions:** owner asked for sensible defaults on stack and technical choices. Choices below marked **[Builder call]** are defaults I recommend, not owner commitments, and can be revised during planning/implementation.
- **Adult content:** the platform hosts adult material. **18+ only** access (decided). Jurisdictions served/blocked, business entity, and specific consent/record-keeping standards are not yet specified and must be resolved before launch (see Open questions).

## Experience & product design

### Category browsing and video player (core experience)

- **Categories:** videos are organized into categories. Each category page presents a **TikTok-style vertical swipe player** (swipe/scroll up and down to move between videos). **[Builder call]** start with an owner-managed fixed category list (simple, consistent taxonomy) that can be expanded later.
- **Default layout (chosen): immersive + panel.** Video is front and center. Comments and “Featured” videos/creators live in a **slide-out panel/drawer** opened on demand so the feed stays immersive.
- **Layout toggle (chosen):** a user setting allows switching between immersive+panel and an always-visible side layout (comments/featured alongside the player). Exact side-layout arrangement is a **[Builder call]** to be mocked/confirmed in implementation (desktop vs. narrow screens).
- **On-video actions:** rate, comment, share, and other common TikTok-like interactions. **[Builder call]** default rating = like/favorite (simple, low friction) with room to extend; sharing includes copy-link and common share targets where supported. Actions visible in immersive mode via overlay controls; visible alongside in side layout.
- **Featured:** surfaced videos/creators shown in the featured area (panel or side). **[Builder call]** start with simple featured/related selection (e.g. by category, popularity, recency) and make it manageable; avoid heavy recommendation/ML initially to control cost/complexity.

### Profiles, privacy, and messaging

- **Extended profiles:** users/creators can maintain a profile with media (videos, pictures) and profile information.
- **Privacy & messaging controls (decided):** **all user-configurable.** Users can make parts of their profile private and control who can interact/message them. **[Builder call — sensible defaults, user can change]:** new accounts default to reasonably open social interaction (e.g. messages/requests allowed with basic limits) and profile media visibility defaults to public except items explicitly marked private/paid; include block/report controls and the ability to restrict messaging (e.g. everyone / friends-followers / no one) per user preference. Exact option set to be finalized in planning/UI.
- **Private collections (decided direction):** creators can have private/restricted content and collections that viewers can unlock/pay to access (see monetization). **[Builder call]** organize as a creator “private collection” (unlockable as a whole, per access option) plus the ability to price/restrict individual videos/items, managed from the creator area.
- **Social:** add friends, view connections as permitted by privacy settings.
- **Messaging:** instant/direct messaging between users, governed by the user’s configurable settings and safety controls.

### Creator/upload area

- Modeled on TikTok’s creator/upload flow: upload short videos, add basic metadata (caption/tags/category/thumbnail as applicable), manage posted content.
- **Video limits (decided):** **max length 5 minutes.** **[Builder call]** enforce size/format limits and a small set of accepted formats/codecs at upload (tuned to budget/processing cost); transcode to web-friendly playback variants.
- **Privacy & pricing per video (chosen):** creator can mark a video public, private/restricted, and set an unlock/price for restricted/paid access. Same pricing model applies to profile/private-collection access so creators manage monetization in one place.
- **Upload-to-live flow (decided):** **go live right after automated checks pass.** Flag content and surface it in an **admin review area** for review (post-publish review). Automated checks **[Builder call]** include technical validation (format/length/size, processing success, basic integrity) and hooks for safety/flagging signals as feasible within budget; owner can tighten to pre-review later if needed.

### Paid access & monetization

- **Site is free to use.** Revenue comes from a cut of paid access/unlocks.
- **What buyers pay for (chosen):** primarily access to a creator’s private collection; also paid/restricted videos and other paid profile content as configured by creators.
- **Access options (chosen):** monthly, yearly, one-time unlock, or pay for specific video(s). **[Builder call]** model these as purchasable entitlements/access grants scoped to the creator collection or item, with clear expiry/renewal behavior for time-based access.
- **Revenue split (chosen, % TBD):** one flat split across the board for everything paid. Creator receives **70% or 80%**; site receives the remainder. Exact percentage not yet decided; system should treat the split as a **configurable platform setting** (single value) so it can be set/changed deliberately without code changes.
- **Payment providers (owner preference, tentative):** **PayPal, Stripe (maybe).** **Important:** eligibility of PayPal/Stripe for adult-content transactions and creator payouts/splits is not confirmed and must be validated; the plan must include a compliant fallback/alternative if they are not viable.
- **Payouts [Builder call]:** integrate a provider/flow that supports the needed purchase types and, if feasible, marketplace-style splits/payouts; track gross, platform fee, creator earnings, and payout status in money-flow reporting. A legal business entity and banking suitable for adult-content payments/payouts may be required (see Open questions).

### Reporting, complaints, and moderation

- **Release posture (decided):** uploads go live after automated checks pass; content can be **flagged** and reviewed post-publish in the admin panel.
- Users can report videos, messages, or profiles.
- **Alerts [Builder call]:** generate an in-app/admin notification on new reports (and optionally email to owner/staff) with severity/volume cues so urgent issues surface quickly.
- **Admin review area (chosen):** backend/admin panel section to review reports/complaints and flagged content with enough context to act (reported/flagged item or user, reporter context as appropriate, history, reason). **[Builder call]** include actions such as dismiss, warn, restrict/remove content, suspend/ban user, and record resolution notes for auditability.
- **Prohibited content & response time:** beyond clearly illegal content, specific prohibited categories and report-handling/response-time expectations are not yet specified (**open**); baseline should enforce illegality/non-consent prohibitions and provide tooling to act promptly.

## Admin & operations (“easy to manage”)

- **Owner dashboard:** at-a-glance visibility into server/log health, usage, user counts, registrations, complaints/reports, and money flow.
- **Money flow:** volume of paid unlocks/purchases, gross revenue, platform cut, creator earnings, refunds/chargebacks if applicable, and payout status.
- **Staff/roles (later, planned):** ability to add trusted users/employees and grant scoped permissions to manage parts of the platform (e.g. moderation, support, ops) without full owner access. **[Builder call]** implement a simple role/permission model now or structure so it can be added cleanly.
- **Creator self-service:** creators manage their own profiles, uploads, privacy, messaging/interaction settings, and pricing from the creator area.

## Packaging, licensing, and rebranding (decided)

Goal: make the site sellable as a **licensed, self-serve, rebrandable** package.

- **Distribution & licensing:** delivered as a licensed package (not unrestricted full-source redistribution). A **license key is required during first-run setup**.
- **Online activation (chosen):** the install validates/activates the license key **online against a service controlled by the owner**. **[Builder call]** define activation behavior (e.g. activate on setup, periodic/heartbeat revalidation with a grace period) and clear failure messaging; decide how the app behaves if the license service is unreachable (availability vs. protection trade-off).
- **License service/dashboard (yours, decided):** a simple dashboard/service you run to **create, activate, and revoke** license keys. Each license covers **one live site**. Buyers can **request a site move** (server/domain change). **[Builder call/guess]** moves are handled owner-side in the dashboard (deactivate/reactivate or reissue) unless you prefer buyer self-service later.
- **Self-serve install (chosen):** buyer-facing install flow and docs. **[Builder call]** provide a simple **Docker/Docker Compose–based** install path suited to the ~$100/month constraint, with documented prerequisites and an upgrade path.
- **First-run setup (chosen):** guided setup collects **license key, domain, database, initial admin account, and storage/payments keys** (and other required config). **[Builder call]** store config securely (env/secrets) and make rerun/recovery steps clear.
- **Rebranding without code (chosen):** an admin area lets a buyer set **site name, logo, colors, and copy/metadata** (and other branding/theme settings) without editing source. **[Builder call]** implement theme/branding as runtime configuration/assets (not code changes) with sensible defaults.
- **Documentation (chosen):** include buyer-facing **install** and **rebrand** docs. **[Builder call]** also include operator notes for backups/updates and license/activation troubleshooting.

## Technical direction (sensible defaults — [Builder calls])

These are recommended defaults to start planning from; all are **my calls, not owner commitments**, and must fit the **~$100/month** budget now.

- **Architecture:** web application with a clear frontend/backend split; API-driven so a future native app is possible. Mobile-responsive UI with swipe/gesture support for the feed.
- **Stack:** a mainstream, well-supported stack to keep maintenance easy (e.g. TypeScript across frontend and backend, a component framework suited to rich interactive UI, and a relational database for users/content/entitlements/transactions). Prefer managed/low-ops components to stay within budget.
- **Media/video (cost-critical):** store originals and serve transcoded web playback via object storage + CDN/delivery suited to low fixed cost. **With $100/month and no scale/pricing assumptions given,** enforce strict limits (5 min max, upload size caps, quotas), use efficient encoding, and plan lifecycle/retention controls; avoid heavy on-demand transcoding/ML. Budget likely supports only small-scale/early usage until revenue offsets egress/storage—this must be validated in planning.
- **Hosting:** start on managed cloud services (AWS or Azure) or low-cost managed alternatives to minimize fixed baseline; re-evaluate a dedicated server only with clear cost/performance evidence.
- **Auth & accounts:** standard secure authentication, session/device management, and account recovery; **18+ age gate at entry** (decided). Stronger age/identity verification may be required depending on jurisdiction/provider (**open**).
- **Payments:** explore owner-preferred PayPal/Stripe but **verify adult-content eligibility**; be prepared with a compliant adult-friendly provider if needed. Provider choice depends on compliance and business/banking readiness.
- **Search/discovery:** category browsing is primary; keep recommendation logic simple initially (category/recency/popularity/featured) to limit compute cost.
- **Observability:** centralized logs/metrics surfaced in the admin dashboard; alerts for errors, spikes, and new reports/flags.

## Data & concepts (high level)

- **User/Account:** identity, profile, configurable privacy/messaging settings, roles (viewer/creator/admin/staff), friends/connections, messaging state.
- **Media:** video/picture assets, metadata, category, visibility (public/private/paid), price/access rules, processing status, flags/review state.
- **Entitlement/Access:** grants representing what a buyer can access (collection/item), access type (monthly/yearly/one-time/per-video), term/expiry, and source purchase.
- **Transaction:** purchase records, amounts, platform/creator split, status, linkage to payouts.
- **Moderation:** reports, flags, alert state, review actions, and audit trail.
- **Installation & branding:** first-run/install state, license activation record (key/status/bound site/domain as applicable), and runtime branding/theme config (name, logo, colors, copy/metadata) editable without code.
- **License service (separate, owner-operated):** license records, activation/revocation state, site binding, and site-move handling.

## Risks and open questions

1. **Adult-content compliance & jurisdiction (high):** “18+ only” is decided, but operating entity location, countries/regions served or blocked, and required age-verification/consent/record-keeping standards are unspecified. These drive legality, age assurance, geo-blocking, records, and hosting/payment viability—must be resolved before launch.
2. **Payment provider & business readiness (high):** PayPal/Stripe are tentative preferences but often restrict adult content; marketplace splits/payouts and adult eligibility must be confirmed. Legal business entity and banking suitable for adult-content payments/payouts may be required.
3. **Budget vs. video costs (high, tied to anti-goal):** ~$100/month with unspecified scale/pricing is extremely tight for video storage, transcoding, and egress. Feasibility for anything beyond very small/early usage requires explicit limits, quotas, and a validated cost model; income must exceed costs within a year.
4. **Licensing, activation & distribution (high):** online activation requires a reliable owner-operated license service and a clear policy for outages/grace periods, key binding (one live site) and site-move handling, and protection against casual reuse. Exact license terms (what buyers may/may not do) and the packaging approach (how much is source vs. protected) are not yet defined and affect implementation and legal posture.
5. **Revenue split value (medium):** 70/30 vs 80/20 undecided; implement as a configurable platform setting.
6. **Moderation details (medium):** publish-after-automated-checks with flagging/admin review is decided, but specific prohibited categories (beyond illegality) and report response-time expectations are unspecified.
7. **Content organization details (low-medium):** max video length 5 minutes is decided; exact upload size/format caps, private-collection structure nuances, and fixed vs. user-defined categories beyond the initial fixed list are builder defaults pending preference.
8. **Rating/share specifics (low):** exact rating mechanic and share destinations are builder defaults pending preference.

## What’s left to the builder

- Choose the concrete stack, frameworks, libraries, hosting topology (within AWS/Azure or low-cost managed options, **budget-aware**), and a **compliant** payment/media approach consistent with constraints above.
- Define detailed data models, API contracts, and permission/role matrices (including user-configurable privacy/messaging).
- Specify exact UI layouts for responsive breakpoints (including the side-layout variant), interaction details (rating mechanic, share targets), and the creator/upload flow screens.
- Work out media processing pipeline, storage/CDN configuration, and strict cost controls/quotas to fit ~$100/month early on.
- Define alerting rules, moderation/flagging workflows, and audit/log retention details.
- Produce a staged implementation plan and **validate economic/compliance assumptions early** (provider eligibility, cost model). For software planning, use the project’s planning workflow after design approval.

## Agreed / decided in conversation

- Immersive TikTok-style category feed, vertical swipe, with comments + featured in a slide-out panel by default and a **setting toggle** to an always-visible side layout.
- Creator/upload area like TikTok’s, with private/restrict and unlock price options.
- **18+ only.**
- **Upload-to-live:** go live right after automated checks pass; flag and provide an admin review area.
- **Messaging & privacy:** user-configurable (all).
- **Video limit:** max length 5 minutes.
- **Budget now:** ~$100/month.
- **Payment preference (tentative):** PayPal, Stripe (maybe) — subject to adult-content eligibility.
- Free to use; paid access mainly for private collections (and other paid items) with **flat split across the board** (creator 70–80%, site remainder, % TBD) and **monthly / yearly / one-time / per-video** access options.
- Admin needs: logs, usage, user counts, registrations, complaints, money flow; alerts + admin review area for reports/flags; ability to add trusted staff/employees later.
- **Sellable/installable (licensed):** self-serve install + docs; Docker-based install path (cost-aware). First-run setup includes **license key with online activation** against an owner-controlled service, plus domain, DB, admin account, storage/payments keys. **One live site per license**; buyers can request a site move. Owner runs a simple dashboard/service to **create, activate, revoke** keys. Buyers rebrand (site name, logo, colors, copy/metadata) from an admin area without code.
- Sensible defaults delegated to builder for stack/build/how-it-gets-made; working domain `tik.earnable.store`; no code yet; AWS/Azure available.
- Failure condition: hosting/running costs > income after one year.
