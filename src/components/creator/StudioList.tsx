"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MAX_TITLE_LENGTH } from "@/lib/media/config";
import { centsToDollars, dollarsToCents, statusLabel } from "@/lib/media/format";

export type StudioItem = {
  id: string;
  title: string | null;
  type: string;
  visibility: "public" | "private" | "restricted";
  unlockPriceCents: number | null;
  status: string;
  processingStatus: string;
  processingError: string | null;
  flagReason: string | null;
};

function StudioCard({ item }: { item: StudioItem }) {
  const router = useRouter();
  const [visibility, setVisibility] = useState(item.visibility);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function call(init: RequestInit): Promise<boolean> {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/media/${item.id}`, init);
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? `Request failed (${res.status})`);
        return false;
      }
      router.refresh();
      return true;
    } catch {
      setError("Network error.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function onSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    let price: number | null = null;
    if (visibility !== "public") {
      price = dollarsToCents(String(data.get("price") ?? ""));
      if (Number.isNaN(price)) {
        setError("Enter a valid price like 4.99, or leave it blank for free.");
        return;
      }
    }
    await call({
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: String(data.get("title") ?? ""),
        visibility,
        unlockPriceCents: price,
      }),
    });
  }

  async function onDelete() {
    if (!window.confirm("Delete this item permanently?")) return;
    await call({ method: "DELETE" });
  }

  return (
    <li className="creator-card" data-testid="studio-item">
      <div className="creator-card-head">
        <strong>{item.title || `Untitled ${item.type}`}</strong>
        <span className="creator-badge" data-status={item.status}>
          {statusLabel(item.status, item.processingStatus)}
        </span>
      </div>
      {item.flagReason ? <p className="creator-error">Flagged: {item.flagReason}</p> : null}
      {item.processingError ? <p className="creator-error">{item.processingError}</p> : null}
      <form onSubmit={onSave} className="creator-row">
        <label>
          Title
          <input name="title" type="text" maxLength={MAX_TITLE_LENGTH} defaultValue={item.title ?? ""} />
        </label>
        <fieldset aria-label="Visibility">
          {(["public", "private", "restricted"] as const).map((v) => (
            <label key={v}>
              <input
                type="radio"
                name={`visibility-${item.id}`}
                value={v}
                checked={visibility === v}
                onChange={() => setVisibility(v)}
              />
              {v}
            </label>
          ))}
        </fieldset>
        {visibility !== "public" ? (
          <label>
            Price (USD)
            <input
              name="price"
              type="number"
              min="0"
              step="0.01"
              defaultValue={centsToDollars(item.unlockPriceCents)}
            />
          </label>
        ) : null}
        <button className="creator-btn" type="submit" disabled={busy}>
          Save
        </button>
        <button className="creator-btn danger" type="button" onClick={onDelete} disabled={busy}>
          Delete
        </button>
      </form>
      {error ? (
        <p role="alert" className="creator-error">
          {error}
        </p>
      ) : null}
    </li>
  );
}

export default function StudioList({ items }: { items: StudioItem[] }) {
  if (items.length === 0) return <p className="creator-sub">Nothing uploaded yet.</p>;
  return (
    <ul className="creator-list">
      {items.map((item) => (
        <StudioCard key={item.id} item={item} />
      ))}
    </ul>
  );
}
