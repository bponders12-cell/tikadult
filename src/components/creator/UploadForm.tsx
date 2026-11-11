"use client";

import { useState } from "react";
import { ACCEPT_ATTRIBUTE, MAX_TITLE_LENGTH } from "@/lib/media/config";
import { dollarsToCents } from "@/lib/media/format";
import type { Category } from "@/lib/categories";

type Visibility = "public" | "private" | "restricted";

async function errorMessage(res: Response): Promise<string> {
  try {
    return ((await res.json()) as { error?: string }).error ?? `Request failed (${res.status})`;
  } catch {
    return `Request failed (${res.status})`;
  }
}

export default function UploadForm({ categories }: { categories: Category[] }) {
  const [visibility, setVisibility] = useState<Visibility>("public");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setDone(false);
    const form = e.currentTarget;
    const data = new FormData(form);
    const file = data.get("file");
    if (!(file instanceof File) || file.size === 0) {
      setError("Choose a file to upload.");
      return;
    }
    let unlockPriceCents: number | null = null;
    if (visibility !== "public") {
      unlockPriceCents = dollarsToCents(String(data.get("price") ?? ""));
      if (Number.isNaN(unlockPriceCents)) {
        setError("Enter a valid price like 4.99, or leave it blank for free.");
        return;
      }
    }
    setBusy(true);
    try {
      // Step 1: init (creates a draft record, tells us where to send bytes).
      const initRes = await fetch("/api/media", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contentType: file.type,
          sizeBytes: file.size,
          title: String(data.get("title") ?? ""),
          categorySlug: String(data.get("category") ?? "") || null,
          visibility,
          unlockPriceCents,
        }),
      });
      if (!initRes.ok) throw new Error(await errorMessage(initRes));
      const init = (await initRes.json()) as {
        media: { id: string };
        upload: { method: string; url: string; headers: Record<string, string> };
      };

      // Step 2: send the bytes to wherever init said (local endpoint today, presigned URL later).
      const putRes = await fetch(init.upload.url, {
        method: init.upload.method,
        headers: init.upload.headers,
        body: file,
      });
      if (!putRes.ok) throw new Error(await errorMessage(putRes));

      // Step 3: complete (moves to processing; it is NOT live until checks pass).
      const doneRes = await fetch(`/api/media/${init.media.id}/complete`, { method: "POST" });
      if (!doneRes.ok) throw new Error(await errorMessage(doneRes));

      form.reset();
      setVisibility("public");
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="creator-form" onSubmit={onSubmit}>
      <label>
        File (MP4/WebM video or JPG/PNG/WebP image)
        <input name="file" type="file" accept={ACCEPT_ATTRIBUTE} required />
      </label>
      <label>
        Title / caption
        <input name="title" type="text" maxLength={MAX_TITLE_LENGTH} />
      </label>
      <label>
        Category
        <select name="category" defaultValue="">
          <option value="">None</option>
          {categories.map((c) => (
            <option key={c.slug} value={c.slug}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <fieldset>
        <legend>Visibility</legend>
        {(["public", "private", "restricted"] as const).map((v) => (
          <label key={v}>
            <input
              type="radio"
              name="visibility"
              value={v}
              checked={visibility === v}
              onChange={() => setVisibility(v)}
            />
            {v[0].toUpperCase() + v.slice(1)}
          </label>
        ))}
      </fieldset>
      {visibility !== "public" ? (
        <label>
          Unlock price (USD, blank = free)
          <input name="price" type="number" min="0" step="0.01" inputMode="decimal" />
        </label>
      ) : null}
      {error ? (
        <p role="alert" className="creator-error">
          {error}
        </p>
      ) : null}
      {done ? (
        <p role="status" className="creator-ok">
          Uploaded. It will go live after automated checks. Track it in your studio.
        </p>
      ) : null}
      <div>
        <button className="creator-btn" type="submit" disabled={busy}>
          {busy ? "Uploading..." : "Upload"}
        </button>
      </div>
    </form>
  );
}
