"use client";

import { useState, useTransition } from "react";

export type FeedLayout = "immersive" | "side";

type Props = {
  value: FeedLayout;
  onChange?: (layout: FeedLayout) => void;
  persist?: boolean; // if true, PUT /api/settings
  className?: string;
};

export default function LayoutToggle({
  value,
  onChange,
  persist = false,
  className,
}: Props) {
  const [layout, setLayout] = useState<FeedLayout>(value);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [prevValue, setPrevValue] = useState<FeedLayout>(value);
  if (prevValue !== value) {
    setPrevValue(value);
    setLayout(value);
  }

  async function select(next: FeedLayout) {
    if (next === layout) return;
    const prev = layout;
    setLayout(next);
    setError(null);
    onChange?.(next);

    if (!persist) return;

    startTransition(async () => {
      try {
        const res = await fetch("/api/settings", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ feedLayout: next }),
        });
        if (!res.ok) {
          throw new Error("save-failed");
        }
      } catch {
        setLayout(prev);
        onChange?.(prev);
        setError("Could not save layout preference.");
      }
    });
  }

  return (
    <div className={className}>
      <div role="group" aria-label="Feed layout">
        <button
          type="button"
          aria-pressed={layout === "immersive"}
          onClick={() => select("immersive")}
          disabled={pending}
        >
          Immersive
        </button>
        <button
          type="button"
          aria-pressed={layout === "side"}
          onClick={() => select("side")}
          disabled={pending}
        >
          Side
        </button>
      </div>
      {error ? <p role="alert">{error}</p> : null}
    </div>
  );
}
