import Link from "next/link";
import { notFound } from "next/navigation";
import { getSession } from "@/lib/auth";
import { resolveHandles } from "@/lib/media/feed";
import { centsToDollars } from "@/lib/media/format";
import type { AccessType } from "@/lib/payments/records";
import { getMoneyFlowReport, RECENT_TRANSACTIONS_LIMIT } from "@/lib/payments/report";
import { MAX_CREATOR_SHARE_BPS, MIN_CREATOR_SHARE_BPS } from "@/lib/payments/split";
import { getCreatorShareBps } from "@/lib/platform-settings";
import { canAccessAdmin } from "@/lib/rbac";
import MarkPaidButton from "@/components/payments/MarkPaidButton";
import SplitSettingForm from "@/components/payments/SplitSettingForm";

export const instant = false;

const ACCESS_LABELS: Record<AccessType, string> = {
  monthly: "Monthly",
  yearly: "Yearly",
  one_time: "One-time unlock",
  per_video: "Per video",
};

const usd = (cents: number) => `$${centsToDollars(cents)}`;
const pct = (bps: number) => `${(bps / 100).toFixed(2).replace(/\.?0+$/, "")}%`;

const box = { border: "1px solid #ddd", borderRadius: 8, padding: "1rem" } as const;
const table = { borderCollapse: "collapse", width: "100%", fontSize: "0.9rem" } as const;
const cell = { borderBottom: "1px solid #eee", padding: "0.4rem 0.6rem", textAlign: "left" } as const;
const num = { ...cell, textAlign: "right" } as const;

/**
 * Money flow: purchases, split, refunds/chargebacks and creator payouts. Restricted to admin/staff.
 * The page gates itself: the admin layout's check does not control what this page puts in the RSC
 * payload (layouts do not re-render on navigation), so it must not be the only check.
 */
export default async function AdminMoneyPage() {
  const session = await getSession();
  if (!canAccessAdmin(session?.user)) notFound();
  const isAdmin = session?.user?.role === "admin";
  // Captured before the report is read: "Mark paid" then marks at most what this page shows.
  const asOf = new Date().toISOString();
  const [report, creatorShareBps] = await Promise.all([getMoneyFlowReport(), getCreatorShareBps()]);
  const handles = await resolveHandles(
    report.byCreator.flatMap((c) => (c.creatorId ? [c.creatorId] : [])),
  );
  const creatorLabel = (id: string | null) => {
    if (!id) return "Deleted creator";
    const handle = handles.get(id);
    return handle ? `@${handle}` : id;
  };

  const tiles: { title: string; value: string; note?: string }[] = [
    { title: "Completed purchases", value: String(report.totals.count) },
    { title: "Gross", value: usd(report.totals.grossCents) },
    { title: "Platform cut", value: usd(report.totals.platformFeeCents) },
    { title: "Creator earnings", value: usd(report.totals.creatorEarningsCents) },
    {
      title: "Refunds",
      value: `${report.refunded.count} (${usd(report.refunded.grossCents)})`,
      note: `${report.refunded.paidOutCount} already paid out to creators (${usd(report.refunded.paidOutCents)} of earnings)`,
    },
    {
      title: "Chargebacks",
      value: `${report.chargeback.count} (${usd(report.chargeback.grossCents)})`,
      note: `${report.chargeback.paidOutCount} already paid out to creators (${usd(report.chargeback.paidOutCents)} of earnings)`,
    },
    { title: "Pending", value: String(report.pending.count) },
    { title: "Failed", value: String(report.failed.count) },
    { title: "Creator earnings unpaid", value: usd(report.payouts.unpaidCents) },
    { title: "Creator earnings paid", value: usd(report.payouts.paidCents) },
  ];

  return (
    <main style={{ display: "grid", gap: "1.5rem" }}>
      <nav>
        <Link href="/admin">Back to admin</Link>
      </nav>
      <h2 style={{ margin: 0 }}>Money flow</h2>
      <p style={{ margin: 0, color: "#666" }}>
        Totals cover transactions that are currently completed. Refunded and charged-back purchases are
        reported separately and are not included in the totals or in the unpaid/paid creator earnings; their
        tiles show how much of those earnings had already been paid out. All amounts are in USD.
      </p>

      <section
        style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "1rem" }}
      >
        {tiles.map((t) => (
          <article key={t.title} style={box}>
            <h3 style={{ margin: 0, fontSize: "0.9rem", color: "#555" }}>{t.title}</h3>
            <p style={{ margin: "0.25rem 0 0", fontSize: "1.3rem" }}>{t.value}</p>
            {t.note ? <p style={{ margin: "0.25rem 0 0", fontSize: "0.8rem", color: "#666" }}>{t.note}</p> : null}
          </article>
        ))}
      </section>

      <section style={{ ...box, display: "grid", gap: "0.5rem" }}>
        <h3 style={{ margin: 0 }}>Revenue split</h3>
        <SplitSettingForm
          creatorShareBps={creatorShareBps}
          min={MIN_CREATOR_SHARE_BPS}
          max={MAX_CREATOR_SHARE_BPS}
          editable={isAdmin}
        />
        <p style={{ margin: 0, color: "#666" }}>
          A change applies to purchases made after the change; past transactions keep the split they were
          made with.
        </p>
      </section>

      <section>
        <h3>By access type (completed)</h3>
        <table style={table}>
          <thead>
            <tr>
              <th style={cell}>Access type</th>
              <th style={num}>Purchases</th>
              <th style={num}>Gross</th>
            </tr>
          </thead>
          <tbody>
            {(Object.keys(ACCESS_LABELS) as AccessType[]).map((type) => (
              <tr key={type}>
                <td style={cell}>{ACCESS_LABELS[type]}</td>
                <td style={num}>{report.byAccessType[type].count}</td>
                <td style={num}>{usd(report.byAccessType[type].grossCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h3>By creator (completed)</h3>
        {report.byCreator.length === 0 ? (
          <p style={{ color: "#666" }}>No completed purchases yet.</p>
        ) : (
          <table style={table}>
            <thead>
              <tr>
                <th style={cell}>Creator</th>
                <th style={num}>Purchases</th>
                <th style={num}>Gross</th>
                <th style={num}>Creator earnings</th>
                <th style={num}>Unpaid</th>
                <th style={num}>Paid</th>
                {isAdmin ? <th style={cell}>Payout</th> : null}
              </tr>
            </thead>
            <tbody>
              {report.byCreator.map((c) => (
                <tr key={c.creatorId ?? "deleted"}>
                  <td style={cell}>{creatorLabel(c.creatorId)}</td>
                  <td style={num}>{c.count}</td>
                  <td style={num}>{usd(c.grossCents)}</td>
                  <td style={num}>{usd(c.creatorEarningsCents)}</td>
                  <td style={num}>{usd(c.unpaidCents)}</td>
                  <td style={num}>{usd(c.paidCents)}</td>
                  {isAdmin ? (
                    <td style={cell}>
                      {c.creatorId && c.unpaidCents > 0 ? (
                        <MarkPaidButton
                          creatorId={c.creatorId}
                          creatorLabel={creatorLabel(c.creatorId)}
                          unpaidCents={c.unpaidCents}
                          asOf={asOf}
                        />
                      ) : null}
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section>
        <h3>Recent transactions (latest {RECENT_TRANSACTIONS_LIMIT})</h3>
        {report.recent.length === 0 ? (
          <p style={{ color: "#666" }}>No transactions yet.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={table}>
              <thead>
                <tr>
                  <th style={cell}>Date</th>
                  <th style={cell}>Type</th>
                  <th style={cell}>Status</th>
                  <th style={num}>Gross</th>
                  <th style={num}>Platform fee</th>
                  <th style={num}>Creator earnings</th>
                  <th style={num}>Split (creator)</th>
                  <th style={cell}>Payout</th>
                </tr>
              </thead>
              <tbody>
                {report.recent.map((t) => (
                  <tr key={t.id}>
                    <td style={cell}>{t.createdAt.toISOString().replace("T", " ").slice(0, 16)} UTC</td>
                    <td style={cell}>{ACCESS_LABELS[t.accessType]}</td>
                    <td style={cell}>{t.status}</td>
                    <td style={num}>{usd(t.grossCents)}</td>
                    <td style={num}>{usd(t.platformFeeCents)}</td>
                    <td style={num}>{usd(t.creatorEarningsCents)}</td>
                    <td style={num}>{pct(t.creatorShareBps)}</td>
                    <td style={cell}>
                      {t.payoutStatus === "paid" && t.paidOutAt
                        ? `paid ${t.paidOutAt.toISOString().slice(0, 10)}`
                        : t.payoutStatus}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
