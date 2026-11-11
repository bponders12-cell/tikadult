"use client";

import { useState } from "react";
import { centsToDollars, dollarsToCents } from "@/lib/media/format";
import type { CreatorPricing } from "@/lib/payments/pricing";

const FIELDS = [
  { key: "monthlyPriceCents", label: "Monthly (30 days)" },
  { key: "yearlyPriceCents", label: "Yearly (365 days)" },
  { key: "oneTimePriceCents", label: "One-time unlock (no expiry)" },
] as const;

async function errorMessage(res: Response): Promise<string> {
  try {
    return ((await res.json()) as { error?: string }).error ?? `Save failed (${res.status})`;
  } catch {
    return `Save failed (${res.status})`;
  }
}

/** Prices for unlocking the creator's whole private collection. Empty = option not offered. */
export default function CollectionPricingForm({ initial }: { initial: CreatorPricing }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    const data = new FormData(e.currentTarget);
    const pricing: CreatorPricing = { monthlyPriceCents: null, yearlyPriceCents: null, oneTimePriceCents: null };
    for (const { key, label } of FIELDS) {
      const cents = dollarsToCents(String(data.get(key) ?? ""));
      if (cents !== null && (Number.isNaN(cents) || cents < 1)) {
        setError(`${label}: enter a price like 9.99, or leave it blank to not offer it.`);
        return;
      }
      pricing[key] = cents;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/payments/pricing", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(pricing),
      });
      if (!res.ok) throw new Error(await errorMessage(res));
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="creator-form" onSubmit={onSubmit}>
      {FIELDS.map(({ key, label }) => (
        <label key={key}>
          {label}, USD
          <input
            name={key}
            type="number"
            min="0.01"
            step="0.01"
            inputMode="decimal"
            placeholder="Not offered"
            defaultValue={centsToDollars(initial[key])}
          />
        </label>
      ))}
      {error ? (
        <p role="alert" className="creator-error">
          {error}
        </p>
      ) : null}
      {saved ? (
        <p role="status" className="creator-ok">
          Collection prices saved.
        </p>
      ) : null}
      <div>
        <button className="creator-btn" type="submit" disabled={busy}>
          {busy ? "Saving..." : "Save prices"}
        </button>
      </div>
    </form>
  );
}
