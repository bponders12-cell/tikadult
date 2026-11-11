"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = { transactionId: string };

/** Dev-only "hosted payment page" buttons: simulate the provider's outcome, then show the result. */
export default function FakeCheckoutActions({ transactionId }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const resultUrl = `/checkout/result?tx=${encodeURIComponent(transactionId)}`;

  async function send(outcome: "completed" | "failed") {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/payments/fake/simulate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ transactionId, outcome }),
      });
      if (!res.ok) throw new Error(`Simulation failed (${res.status})`);
      router.push(resultUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Simulation failed.");
      setBusy(false);
    }
  }

  return (
    <div className="creator-form">
      {error ? (
        <p role="alert" className="creator-error">
          {error}
        </p>
      ) : null}
      <div>
        <button className="creator-btn" type="button" onClick={() => send("completed")} disabled={busy}>
          Pay (simulate success)
        </button>{" "}
        <button className="creator-btn" type="button" onClick={() => send("failed")} disabled={busy}>
          Simulate failure
        </button>
      </div>
    </div>
  );
}
