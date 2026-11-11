import { lifecycleWindows } from "@/lib/media/config";
import {
  clearMediaAssets,
  deleteMedia,
  listStaleByStatus,
  type MediaRecord,
} from "@/lib/media/records";
import { getStorage, type StorageAdapter } from "@/lib/media/storage";

/**
 * Lifecycle cleanup, same on-demand pattern as `runPendingMedia` (no daemon or
 * scheduler: call it from a cron-triggered route or an admin action).
 *
 *  (a) Abandoned drafts: status=draft untouched for MEDIA_DRAFT_TTL_HOURS
 *      (default 24h) are deleted along with their stored bytes. This is what
 *      keeps never-completed uploads from consuming quota/storage forever.
 *  (b) Removed media: bytes of status=removed items older than
 *      MEDIA_REMOVED_RETENTION_DAYS (default 30) are deleted and the asset rows
 *      cleared; the record itself stays as an audit tombstone.
 *
 * Bytes are deleted BEFORE rows, so a failed byte deletion leaves the record
 * for the next run to retry. One item's failure never stops the rest.
 */
export type CleanupDeps = {
  storage?: StorageAdapter;
  now?: Date;
  env?: Record<string, string | undefined>;
};

export type CleanupSummary = {
  draftsDeleted: number;
  removedPurged: number;
  errors: number;
};

/** Passthrough variants share the original's key, so delete each key once. */
async function deleteBytes(storage: StorageAdapter, media: MediaRecord): Promise<void> {
  for (const key of new Set(media.assets.map((a) => a.storageKey))) {
    await storage.delete(key);
  }
}

export async function runMediaCleanup(deps: CleanupDeps = {}): Promise<CleanupSummary> {
  const storage = deps.storage ?? getStorage();
  const now = deps.now ?? new Date();
  const { draftTtlMs, removedRetentionMs } = lifecycleWindows(deps.env);
  const summary: CleanupSummary = { draftsDeleted: 0, removedPurged: 0, errors: 0 };

  for (const draft of await listStaleByStatus("draft", new Date(now.getTime() - draftTtlMs))) {
    try {
      await deleteBytes(storage, draft);
      await deleteMedia(draft.id);
      summary.draftsDeleted++;
    } catch {
      summary.errors++;
    }
  }

  for (const removed of await listStaleByStatus("removed", new Date(now.getTime() - removedRetentionMs))) {
    if (removed.assets.length === 0) continue; // already purged
    try {
      await deleteBytes(storage, removed);
      await clearMediaAssets(removed.id);
      summary.removedPurged++;
    } catch {
      summary.errors++;
    }
  }

  return summary;
}
