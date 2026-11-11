# Payment provider eligibility (Plan 3, Task 5)

> **This is desk research, not a determination of eligibility.** Everything below comes from the
> providers' and card brands' *published* pages (plus clearly labelled secondary sources). No provider
> was contacted, signed up with, configured or called. Whether this site can actually be boarded can only
> be decided by a provider's own underwriting after an application. Nothing in this document means a
> provider has "confirmed" or "verified" that this site is eligible.

Pages were accessed on **2026-11-11**. Policies change; re-read each source before applying. Where a
page could not be fetched it says so, and anything not read from a fetched page is labelled
**(secondary source)** or **(unverified, from memory)**.

## 1. Stripe and PayPal

### Stripe — adult content is on the *prohibited* list

Source: Stripe, "Prohibited and Restricted Businesses", https://stripe.com/legal/restricted-businesses
(fetched 2026-11-11; the page shows "last updated 2026-09-22").

- The page separates **prohibited** businesses (cannot use Stripe) from **restricted** businesses
  (need additional due diligence). "Adult content and services" is in the **prohibited** section. It
  includes "Pornography and other mature audience content ... designed for the purpose of sexual
  gratification", pay-per-view adult services, adult live-chat features, and AI-generated content
  meeting those criteria.
- "Content creation platforms" (platforms where creators sell exclusive content or receive tips) are
  only *restricted*, but the same page says creators must comply with the list, which "prohibits the
  sale of adult content".

**Conclusion (desk research):** Stripe is not a viable processor for this site's paid adult content.
Stripe Connect payouts do not change this, because the restriction is on what is sold.

### PayPal — sexually oriented digital goods/content are not permitted

**Every PayPal page tried returned HTTP 403 to the fetch tool**, so none of PayPal's text was read
directly. Pages tried:
- https://www.paypal.com/us/legalhub/acceptableuse-full
- https://www.paypal.com/us/legalhub/paypal/acceptableuse-full
- https://www.paypal.com/us/webapps/mpp/ua/acceptableuse-full
- https://www.paypal.com/us/cshelp/article/HELP384 ("What is PayPal's policy on transactions that
  involve sexually oriented goods and services?")
- https://www.paypal.com/selfhelp/article/FAQ569
- https://www.paypal.com/legalhub/braintree/acceptable-use-policy

What follows comes from **web-search result summaries of those PayPal pages (secondary source, not a
fetched page)**, 2026-11-11:
- The help article HELP384 is described as saying PayPal does not permit sexually oriented **digital
  goods or content delivered through a digital medium**. It gives downloadable pictures or videos and
  website subscriptions as examples. It permits certain sexually oriented *physical* goods, US-only.
- The Acceptable Use Policy is described as listing "certain sexually oriented materials or services"
  among prohibited activities. A separate pre-approval chart exists for some other categories.
- The Braintree (a PayPal service) acceptable use policy is described as listing "sexually-oriented or
  pornographic products or services".

**Conclusion (desk research, secondary sources):** PayPal is not a viable processor for this site's
adult video purchases or collection access. A human should open the PayPal pages above in a browser
to confirm the current wording.

## 2. Adult-friendly processor candidates

All four candidates still have live websites. "Not stated" means the page fetched did not say. It does
not mean the feature is missing; ask the provider.

| | CCBill | Segpay | Epoch | Verotel |
| --- | --- | --- | --- | --- |
| Publicly serves adult merchants | Yes. Lists "Adult Business" and "High Risk Business" industries and names "fan sites" and "content platforms" | Homepage 403. Help-centre docs fetched. Adult focus only from secondary sources | Homepage does not mention adult. Adult origin (1996) only from secondary sources | Yes. "Adult? No problem!"; "Are you looking for a credit card processor for your adult business?" |
| One-time purchases | Yes. Creator-platform page lists one-time purchases, tips and gifts, live session tickets | Not explicitly described (signups, one-click sales) | Not stated | Yes. FlexPay "purchase" is a one-off sale |
| Subscriptions / recurring | Yes. Subscription system and recurring billing | Yes. Failed rebills retried 3 more times over 9 days | Not stated | Yes. One-time (fixed-period) and recurring subscriptions |
| Webhooks / postbacks | Webhooks, JSON or URL-encoded: NewSaleSuccess/Failure, RenewalSuccess/Failure, Refund, Chargeback, Return, Void, Cancellation, Expiration and others. **Authenticity is by source-IP allowlist (64.38.212/215/240/241.x); the guide describes no signature** | Postbacks. Member-management ones are synchronous and must answer plain text (default `GOOD`). Transaction ones cover payment, refund, void, chargeback. **No signature or IP check is described**; optional username/password on the receiving URL | Not published. A forum claim says docs are gated (secondary, unverified) | Postbacks: `initial`, `rebill`, `extend`, `downgrade`, `cancel`, `uncancel`, `expiry`, `credit` (= refund), `chargeback`, `upgrade`. **Signed: SHA-256 hex over signature key + alphabetically sorted params** |
| Creator payouts / split support | Not stated. Creator-platform page says to connect "the payout system of your choice", so the platform runs payouts | Not stated | Not stated | Homepage says "Pay your adult talent and affiliates" (no detail); OpenAffiliate product. Split mechanics not stated |
| Published fees | No rates published (pricing page says rates by discussion). States card-scheme annual registration fees for certain MCCs: **Visa $950, Mastercard $1000** | Not published on fetched pages | Not published | **Published.** Basic: 15.5% non-recurring, 17.0% recurring (15.5% + 1.5%, surcharge not on first charge), EUR 500/year. Premium: 13.0–14.0% non-recurring by weekly volume (+1.5% recurring), no annual fee, EUR 25/week below EUR 1,000/week volume, EUR 100 minimum weekly volume. Both: **10% rolling reserve for 6 months**, no chargeback or refund fees, but +2.5% on the rate if the chargeback ratio is ≥ 1.0% (more than 50 tx). Daily payouts |
| Onboarding / KYC / content compliance | No onboarding checklist found (link target 404 / search found nothing). Integration partners for age and content verification: VerifyMyContent, Yoti, AgeChecked, DigiRegs. The VerifyMyContent integration page lists trusted content source, age and identity verification of every participant, participant ID documents, written consent kept on file, and pre-upload review | Not stated (support e-mail only) | Not stated | Not stated beyond "Apply" and a Merchant Agreement link |

Sources, all accessed 2026-11-11:
- CCBill: https://ccbill.com/ ; https://ccbill.com/pricing ; https://ccbill.com/industries/adult-business ;
  https://ccbill.com/industries/content-creator-platforms ; https://ccbill.com/doc/webhooks-user-guide ;
  https://ccbill.com/integration/verifymycontent
- Segpay: https://segpay.com/ (**403, not read**) ;
  https://gethelp.segpay.com/docs/Content/FAQs/FAQ-Platform.htm ;
  https://gethelp.segpay.com/docs/Content/DeveloperDocs/ProcessingAPI/06-Postbacks.htm
- Epoch: https://epoch.com/ (homepage only; says "A pioneer of payment solutions for online merchants
  since 1996"). Adult focus and gated docs are **secondary sources** (merchantmachine.co.uk, a CCBill
  docs page on Epoch cascades), not Epoch's own pages.
- Verotel: https://www.verotel.com/ ; https://www.verotel.com/en/welcometoverotel.html ;
  https://verotel.com/en/pricechart.html ; https://controlcenter.verotel.com/flexpay-doc/subscription.html

## 3. Card-brand rules that affect an adult user-generated-content site

Mastercard's own announcement page returned **HTTP 403** to the fetch tool at both
https://www.mastercard.com/global/en/news-and-trends/perspectives/2021/protecting-our-network-protecting-you-preventing-illegal-adult-content-on-our-network.html
and https://mastercard.com/news/perspectives/2021/protecting-our-network-protecting-you-preventing-illegal-adult-content-on-our-network ,
so the list below comes from a processor's summary:
**CCBill, "Mastercard Standards for Security Rules and Procedures Update"**,
https://ccbill.com/blog/new-mastercard-rules (accessed 2026-11-11; secondary source). The rules are
commonly referred to as Mastercard AN 5196, effective 15 October 2021.

- The acquiring bank must confirm the merchant can monitor, block and remove illegal content. Under
  Mastercard's specialty-merchant registration, adult-content merchants are registered by their
  acquirer.
- There must be a written, legally binding agreement between the merchant and each content provider
  (here, each creator).
- The age and identity of creators **and of every person depicted** must be verified and documented.
  Only verified providers may upload.
- Written consent from every participant must be collected and stored.
- **All content must be reviewed before publication** for legality and compliance.
- Promoting content, or allowing search terms, that suggests non-consent or child exploitation is not
  allowed.
- Complaints about illegal or non-consensual content must be handled within **seven business days**.
- There must be a removal process that people depicted can use.

Visa: the Visa Integrity Risk Program (VIRP) classifies adult content (MCC 5967) as a high-integrity-risk
category with similar content-control expectations. A Visa-published PDF was downloaded
(https://visa.cl/content/dam/VCOM/regional/lac/SPA/chile/Documents/visa-integrity-risk-program-chile.pdf)
but its text could not be extracted, so the VIRP details here come only from **secondary sources**
(search summaries of segpay.com, legitscript.com and hbms.com articles). Treat them as unverified.

**Launch implications**
- **Moderation (Plan 5):** today an upload that passes the automated technical checks goes `live`
  immediately. The pipeline is "publish-then-review" (`src/lib/media/processing.ts`): soft-flagged items
  stay live and are only queued for later admin review. There is no human review before publication.
  The card rules require **pre-publication review**, a **complaint path with a 7-business-day handling window**, a
  **removal request path for people depicted**, and search and term controls. Plan 5 must provide these
  before any adult-content processor is used.
- **Creator onboarding and compliance:** the site has only an 18+ viewer gate. It does not verify creator
  identity or age, collect performer IDs or written consent for co-performers, or keep a creator
  agreement. These are likely boarding prerequisites, not post-launch items. Processor partners
  (VerifyMyContent, Yoti and others) or equivalent are needed, as is a records and retention policy
  (and, for US producers, 18 U.S.C. 2257 record-keeping — a legal question for counsel).
- **Viewer age assurance:** secondary sources say self-attestation ("I am over 18") may not satisfy
  VIRP or state laws. Treat this as a compliance decision (it is already a Plan 1 TODO).

## 4. Economics: who bears processing fees

How the code works today (`src/lib/payments/split.ts`, `src/lib/payments/checkout.ts`):
- `computeSplit(grossCents, creatorShareBps)` applies the creator share to the **gross charge**:
  `creatorEarningsCents = floor(gross × bps / 10000)` and the platform keeps the rest.
- The result is snapshotted on the transaction at checkout.
- There is **no processor-fee field** on `Transaction`, so `/admin/money`'s "platform fee" is the
  platform's share **before** processing costs.

If the creator is paid their share of gross, the processor's fee comes out of the platform's remainder:

`platform net = gross × (1 − creatorShare − processorRate)` (ignoring fixed fees)

Using Verotel's published rates (the only adult processor whose rates were published on the pages read),
for a $10.00 sale:

| Split (creator) | Creator gets | Platform share | Fee @13.0% (Premium best) | Fee @15.5% (Basic one-off) | Fee @17.0% (Basic recurring) | Platform net |
| --- | --- | --- | --- | --- | --- | --- |
| 80% (8000 bps, shipped default) | $8.00 | $2.00 | $1.30 | $1.55 | $1.70 | **$0.70 / $0.45 / $0.30** (7.0% / 4.5% / 3.0% of gross) |
| 70% (7000 bps) | $7.00 | $3.00 | $1.30 | $1.55 | $1.70 | **$1.70 / $1.45 / $1.30** (17.0% / 14.5% / 13.0% of gross) |

Further points:
- At 80%, any processor rate above 20% makes every sale loss-making for the platform.
- Verotel's chargeback penalty (+2.5% on the rate at a ≥1.0% chargeback ratio) would take the 80% case
  to 4.5% / 2.0% / 0.5% of gross for the three rates above.
- Rounding: on a $4.99 sale at 80%, the creator gets `floor(399.2) = 399`¢ and the platform 100¢.
  15.5% of 499¢ is about 77¢, leaving the platform about 23¢.
- A **10% rolling reserve held 6 months** (Verotel) is a cash-flow cost. If creators are paid their full
  share promptly, the platform must fund the held 10% from its own cash.
- **Fixed annual costs:** CCBill's pricing page lists card-scheme registration fees of Visa $950 +
  Mastercard $1000 per year for certain high-risk MCCs, about **$162/month**. Verotel Basic's EUR 500/year
  (about EUR 42/month) covers Visa/MC registration. Either is a large share of, or more than, the
  ~$100/month budget. Who pays the scheme fees (merchant vs processor) must be asked during application.
- Refunds and chargebacks: a provider typically keeps or claws back its fee on reversed sales. Our
  ledger revokes the entitlement but records no fee (see section 7). If a creator was already paid out,
  `/admin/money` shows the paid-out reversal, and recovery from the creator is a manual policy decision.

**Owner decision — who bears processing fees:**
(a) the platform absorbs them (the current code's implicit model);
(b) the split is applied to the net after fees (needs a code change: a fee field and a different
`computeSplit` input); or
(c) the creator share is lowered to 70% to absorb fees.

## 5. Recommendation (desk-research recommendation only)

- **Primary: CCBill.** It explicitly serves "fan sites" and "content platforms". It supports one-time
  purchases, tips and subscriptions, and has public webhook docs that include Refund and Chargeback
  events. It names age and content verification partners that match the card-brand requirements.
  Caveats: rates are not published, and webhooks are authenticated by **source-IP allowlist**, not a
  signature (see section 7).
- **Fallback: Verotel.** It publicly accepts adult merchants and **publishes its rates**. It supports
  purchases plus one-time and recurring subscriptions, and its postbacks are **signed** (SHA-256),
  which fits the current `parseWebhook` design best. It mentions paying "adult talent and affiliates".
  Caveats: the rates (13.0–17.0%) leave the platform 3–7% of gross at an 80% split, and there is a 10%
  six-month rolling reserve. Whether it accepts multi-creator UGC platforms is not stated.
- **Also apply to Segpay** as a second fallback (adult and subscription focus per its docs and secondary
  sources; postbacks need a plain-text `GOOD` reply and have no documented signature). **Epoch:**
  insufficient public information to rank it.
- **Not viable:** Stripe (adult content is on its prohibited list) and PayPal (sexually oriented digital
  content not permitted, from secondary sources).

Expect the outcome to depend on underwriting: any of these may decline a new multi-creator UGC platform
without moderation, creator KYC and consent records in place (section 3).

## 6. Owner checklist (before any provider application)

- [ ] **Business entity**: incorporated entity, jurisdiction, and the countries served and blocked.
- [ ] **Banking**: business bank account able to receive high-risk/adult settlements (and the payout
      currency: Verotel pays in USD, EUR or GBP).
- [ ] **Provider application** to the primary, and in parallel to the fallback. Ask each provider:
  - [ ] multi-creator UGC acceptance
  - [ ] rates
  - [ ] reserve
  - [ ] who pays Visa/Mastercard registration
  - [ ] payout options to creators
  - [ ] webhook authentication
  - [ ] required creator KYC and consent tooling
- [ ] **Payout model**: provider-side split/payout to creators, **or** collect-then-pay-manually. The
      second is what the code supports today: `/admin/money` "Mark paid" sets `payoutStatus: "paid"` on a
      creator's completed, unpaid transactions up to a confirmed cut-off. It is bookkeeping only; no money
      moves. Manual payouts make the platform responsible for creator tax forms (e.g. US 1099s) and
      payee KYC — ask an accountant.
- [ ] **Refund and chargeback policy**: buyer-facing refund terms, and whether to claw back creator
      earnings already paid out (the report shows these as "already paid out" reversals; nothing is
      recovered automatically).
- [ ] **Split value**: 70% vs 80%. The shipped default is **80%** (`DEFAULT_CREATOR_SHARE_BPS = 8000`);
      allowed values are 7000–8000 bps, set at `/admin/money` (admin only). Decide together with "who
      bears processing fees" (section 4).
- [ ] **Recurring billing**: keep today's non-renewing 30- and 365-day terms (buyer re-purchases), or add
      auto-renew (needs interface work, see section 7).
- [ ] **Compliance prerequisites** (section 3): pre-publication moderation, complaints and removal, creator
      ID/age verification, co-performer consent records, creator agreement.

## 7. Adding a real provider

All of these were checked against the code on this branch.

1. **Implement `PaymentProvider`** (`src/lib/payments/provider.ts`):
   - `name` (lower-case; it becomes the webhook path segment and the `Transaction.provider` value).
   - `createCheckout({ transactionId, amountCents, currency: "USD", description, successUrl, cancelUrl })`
     → `{ providerRef, redirectUrl }`. The `providerRef` must be what the provider later quotes in
     its events, because reconciliation looks a transaction up by the unique `(provider, providerRef)`.
     If `createCheckout` throws, checkout returns 502 and the pending transaction is left without a
     `providerRef`.
   - `parseWebhook(rawBody, headers)` → `{ eventId, type, providerRef } | null`. It must verify
     authenticity and map provider events to exactly `payment.completed`, `payment.failed`,
     `payment.refunded` or `payment.chargeback`. Return `null` for anything unverifiable (the route then
     answers 400).
     - Map provider event types that have no equivalent (rebill, cancel, expiry and similar) so they are
       ignored safely: return an event the lifecycle ignores, or handle them before returning `null`.
     - `eventId` must be stable across the provider's retries, because duplicates are de-duplicated per
       `(provider, eventId)`.
2. **Register it in `getPaymentProvider()`.** Today that function only knows `"fake"` and throws
   `PaymentsNotConfiguredError` for any other name. Add a branch for the new name (reading its
   credentials lazily, never at module load, because `next build` runs with `NODE_ENV=production`).
3. **Set env vars:**
   - `PAYMENT_PROVIDER=<name>`
   - `PAYMENTS_WEBHOOK_SECRET` (required in production; today it is the fake provider's HMAC key — a real
     adapter can use it as its signing key, or add its own variables)
   - `DATABASE_URL` (required for payments in production)
   - `NEXTAUTH_URL` (used as the origin for the return URLs: `/checkout/result?tx=…`)
4. **Point the provider's webhook/postback at `https://<host>/api/webhooks/payments/<name>`.** The route:
   - accepts **POST only**
   - returns 404 if `<name>` ≠ the configured provider's `name`
   - returns 413 for bodies over 65536 bytes
   - returns 200 JSON for applied, duplicate or ignored events
   - returns 404 for an unknown `providerRef`, so the provider retries

**What the interface and route do not cover yet** (adapter work will hit these):
- **Auto-renewing subscriptions.** There is no rebill event type. Monthly and yearly purchases are
  fixed 30- and 365-day grants with no renewal, and each transaction grants once. A `RenewalSuccess` or
  `rebill` would need a new transaction and grant per renewal.
- **In-app refund initiation.** Refunds and chargebacks are only *received* as events; the app cannot
  start one.
- **Payouts.** No payout API; payouts are tracked manually.
- **Non-signature authenticity.** `parseWebhook` receives only the raw body and headers:
  - CCBill's IP-allowlist check would have to rely on a trusted proxy header (e.g. `x-forwarded-for`
    set by the host), which needs care.
  - Segpay documents neither a signature nor an IP check.
- **Response format and method.** The route always answers JSON. Segpay's synchronous postbacks expect
  a plain-text body (default `GOOD`). If a provider sends GET postbacks or expects a specific text reply
  (e.g. Verotel is believed to expect `OK` — **unverified, from memory**), the route needs a
  per-provider response hook.
- **Single currency (USD) and single secret.** There is one `PAYMENTS_WEBHOOK_SECRET` and no
  per-provider credential variables yet.
- **Processor fees** are not recorded (section 4).
