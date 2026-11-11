"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = {
  /** Creator share in basis points. */
  creatorShareBps: number;
  min: number;
  max: number;
  /** Admins can change the split; staff see it read-only. */
  editable: boolean;
};

const pct = (bps: number) => `${(bps / 100).toFixed(2).replace(/\.?0+$/, "")}%`;

async function errorMessage(res: Response): Promise<string> {
  try {
    return ((await res.json()) as { error?: string }).error ?? `Save failed (${res.status})`;
  } catch {
    return `Save failed (${res.status})`;
  }
}

/** Creator / platform split for new purchases. */
export default function SplitSettingForm({ creatorShareBps, min, max, editable }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const summary = (
    <p style={{ margin: 0 }}>
      Creators receive <strong>{pct(creatorShareBps)}</strong>, the platform keeps{" "}
      <strong>{pct(10000 - creatorShareBps)}</strong> of each purchase.
    </p>
  );
  if (!editable) return summary;

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    const raw = String(new FormData(e.currentTarget).get("creatorSharePercent") ?? "").trim();
    const bps = Math.round(Number(raw) * 100);
    if (raw === "" || !Number.isFinite(bps) || bps < min || bps > max) {
      setError(`Enter a creator share between ${pct(min)} and ${pct(max)}.`);
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/admin/money/split", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ creatorShareBps: bps }),
      });
      if (!res.ok) throw new Error(await errorMessage(res));
      setSaved(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} style={{ display: "grid", gap: "0.5rem", maxWidth: 420 }}>
      {summary}
      <label style={{ display: "grid", gap: "0.25rem" }}>
        Creator share for new purchases, % ({pct(min)} to {pct(max)})
        <input
          name="creatorSharePercent"
          type="number"
          min={min / 100}
          max={max / 100}
          step="0.01"
          inputMode="decimal"
          defaultValue={creatorShareBps / 100}
          style={{ padding: "0.4rem" }}
        />
      </label>
      {error ? (
        <p role="alert" style={{ margin: 0, color: "#a11" }}>
          {error}
        </p>
      ) : null}
      {saved ? (
        <p role="status" style={{ margin: 0, color: "#176b3a" }}>
          Split saved.
        </p>
      ) : null}
      <div>
        <button type="submit" disabled={busy}>
          {busy ? "Saving..." : "Save split"}
        </button>
      </div>
    </form>
  );
}
