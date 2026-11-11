"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { centsToDollars } from "@/lib/media/format";

type Props = {
  creatorId: string;
  creatorLabel: string;
  unpaidCents: number;
  /** ISO time the shown amount was computed; only purchases completed by then are marked. */
  asOf: string;
};

/** Records that a creator's unpaid earnings were paid out off-platform (bookkeeping; moves no money). */
export default function MarkPaidButton({ creatorId, creatorLabel, unpaidCents, asOf }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function onClick() {
    if (!window.confirm(`Mark $${centsToDollars(unpaidCents)} of earnings for ${creatorLabel} as paid out?`)) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/money/payouts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ creatorId, asOf }),
      });
      if (!res.ok) throw new Error(`Failed (${res.status})`);
      const { markedCount, paidCents } = (await res.json()) as { markedCount: number; paidCents: number };
      setMessage({ ok: true, text: `Marked ${markedCount} ($${centsToDollars(paidCents)}).` });
      router.refresh();
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : "Failed." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <span style={{ display: "inline-flex", gap: "0.5rem", alignItems: "center" }}>
      <button type="button" onClick={onClick} disabled={busy || unpaidCents <= 0}>
        {busy ? "Marking..." : "Mark paid"}
      </button>
      {message ? (
        <span role={message.ok ? "status" : "alert"} style={{ color: message.ok ? "#176b3a" : "#a11" }}>
          {message.text}
        </span>
      ) : null}
    </span>
  );
}
