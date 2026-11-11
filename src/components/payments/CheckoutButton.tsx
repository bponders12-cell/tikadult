"use client";

import { useState } from "react";
import type { AccessType } from "@/lib/payments/records";

type Props = {
  accessType: AccessType;
  creatorId?: string;
  mediaId?: string;
  label: string;
};

async function errorMessage(res: Response): Promise<string> {
  if (res.status === 503) return "Payments are not available yet. Please check back later.";
  try {
    return ((await res.json()) as { error?: string }).error ?? `Checkout failed (${res.status})`;
  } catch {
    return `Checkout failed (${res.status})`;
  }
}

/** Starts a checkout through the API, then hands the browser to the provider's page. */
export default function CheckoutButton({ accessType, creatorId, mediaId, label }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/payments/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ accessType, creatorId, mediaId }),
      });
      if (!res.ok) throw new Error(await errorMessage(res));
      const { redirectUrl } = (await res.json()) as { redirectUrl: string };
      window.location.assign(redirectUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Checkout failed.");
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
        <button className="creator-btn" type="button" onClick={onClick} disabled={busy}>
          {busy ? "Starting checkout..." : label}
        </button>
      </div>
    </div>
  );
}
