import { runChecks } from "./checks";
import type { MediaProbe } from "./probe";
import {
  getMedia,
  setMediaAsset,
  updateMedia,
  type MediaAssetRecord,
  type MediaRecord,
} from "./records";
import { getStorage, type StorageAdapter } from "./storage";

/**
 * Media processing pipeline.
 *
 * Job model: `Media.processingStatus` IS the job record (no job table).
 *   pending -> processing -> ready | failed
 * Upload-complete leaves a record at status=processing / processingStatus=pending
 * and calls `enqueueMediaProcessing`, which runs `processMedia` inline. The same
 * `processMedia` is driven over leftover pending records by
 * `src/workers/media-worker.ts`.
 *
 * Outcomes (see checks.ts for the hard/soft rule list):
 *  - pass  -> status=live, publishedAt set, processingStatus=ready, `web` asset created.
 *  - flag  -> as pass, PLUS flagReason/flaggedAt set (publish-then-review queue).
 *             status stays "live"; the admin queue (Plan 5) keys off flaggedAt.
 *  - fail  -> processingStatus=failed + human-readable processingError, and
 *             status returns to "draft" (never live; the creator can re-upload and
 *             complete again, which resets the item to pending).
 * A crash inside processing is treated as a failure for that item only.
 */

export type ProcessOutcome = "live" | "flagged" | "failed" | "skipped";

export type ProcessDeps = {
  probe?: MediaProbe;
  storage?: StorageAdapter;
};

/**
 * TRANSCODER / THUMBNAILER SEAM. This is the one place a real transcoder
 * (FFmpeg etc.) would plug in. Today there is no transcoding (budget): the
 * "web playback variant" is a passthrough reference to the original's stored
 * bytes, which is valid because only web-safe allowlisted formats (mp4/webm,
 * jpg/png/webp) are accepted. Thumbnails are not generated; an upload-supplied
 * thumbnail asset, if any, is left as-is.
 */
export async function buildPlaybackVariants(
  _media: MediaRecord,
  original: MediaAssetRecord,
): Promise<MediaAssetRecord[]> {
  return [
    {
      kind: "web",
      storageKey: original.storageKey,
      contentType: original.contentType,
      sizeBytes: original.sizeBytes,
    },
  ];
}

async function markFailed(id: string, reason: string): Promise<"failed"> {
  await updateMedia(id, {
    status: "draft",
    processingStatus: "failed",
    processingError: reason,
    publishedAt: null,
  });
  return "failed";
}

export async function processMedia(mediaId: string, deps: ProcessDeps = {}): Promise<ProcessOutcome> {
  const media = await getMedia(mediaId);
  if (!media || media.status !== "processing" || media.processingStatus !== "pending") return "skipped";

  // Single-worker claim (not atomic across processes; the worker is not a daemon).
  await updateMedia(mediaId, { processingStatus: "processing", processingError: null });

  try {
    const original = media.assets.find((a) => a.kind === "original");
    if (!original) return await markFailed(mediaId, "Original upload record is missing");

    const bytes = await (deps.storage ?? getStorage()).get(original.storageKey);
    if (!bytes) return await markFailed(mediaId, "Uploaded file is missing from storage");

    const outcome = await runChecks({
      type: media.type,
      declaredContentType: original.contentType,
      bytes,
      probe: deps.probe,
    });
    if (outcome.verdict === "fail") return await markFailed(mediaId, outcome.reason);

    for (const asset of await buildPlaybackVariants(media, original)) {
      await setMediaAsset(mediaId, asset);
    }

    const now = new Date();
    const flagged = outcome.verdict === "flag";
    await updateMedia(mediaId, {
      status: "live",
      processingStatus: "ready",
      processingError: null,
      publishedAt: now,
      durationSec: outcome.durationSec === null ? media.durationSec : Math.round(outcome.durationSec),
      flagReason: flagged ? outcome.reasons.join("; ") : null,
      flaggedAt: flagged ? now : null,
    });
    return flagged ? "flagged" : "live";
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return await markFailed(mediaId, `Processing error: ${message}`.slice(0, 300));
  }
}

/**
 * Seam called by the upload-complete endpoint. Runs the pipeline inline and
 * never throws: a processing failure must not fail the upload-complete response.
 */
export async function enqueueMediaProcessing(mediaId: string): Promise<void> {
  try {
    await processMedia(mediaId);
  } catch {
    // Could not even record the failure (e.g. DB outage). The record stays
    // processing/pending or processing/processing and is visible to ops.
  }
}
