import { processMedia, type ProcessDeps } from "@/lib/media/processing";
import { processingStaleMs } from "@/lib/media/config";
import { listPendingMedia, listStaleProcessing, updateMedia } from "@/lib/media/records";

/**
 * Standalone worker entry: finds records still awaiting processing
 * (status=processing / processingStatus=pending) and runs the pipeline over
 * each. No daemon or scheduler: invoke it on demand (e.g. from a cron-triggered
 * route or an admin action). One item's crash never stops the rest.
 */
export type WorkerSummary = {
  processed: number;
  live: number;
  flagged: number;
  failed: number;
  skipped: number;
  /** Orphaned processing/processing items moved to the failed state this run. */
  reclaimed: number;
};

export type WorkerDeps = ProcessDeps & {
  now?: Date;
  env?: Record<string, string | undefined>;
};

/**
 * Items whose worker died after claiming them sit at processing/processing
 * forever. Anything untouched for MEDIA_PROCESSING_STALE_MINUTES (default 15)
 * is moved to the existing failure state so the creator can retry.
 */
async function reclaimStale(now: Date, env?: Record<string, string | undefined>): Promise<number> {
  let n = 0;
  for (const m of await listStaleProcessing(new Date(now.getTime() - processingStaleMs(env)))) {
    try {
      await updateMedia(m.id, {
        status: "draft",
        processingStatus: "failed",
        processingError: "processing interrupted — please retry",
        publishedAt: null,
      });
      n++;
    } catch (e) {
      console.warn(`media-worker: reclaim ${m.id} failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return n;
}

export async function runPendingMedia(deps: WorkerDeps = {}): Promise<WorkerSummary> {
  const summary: WorkerSummary = { processed: 0, live: 0, flagged: 0, failed: 0, skipped: 0, reclaimed: 0 };
  summary.reclaimed = await reclaimStale(deps.now ?? new Date(), deps.env);
  for (const media of await listPendingMedia()) {
    let outcome: Awaited<ReturnType<typeof processMedia>>;
    try {
      outcome = await processMedia(media.id, deps);
    } catch {
      outcome = "failed"; // failure could not even be recorded; counted, loop continues
    }
    if (outcome === "skipped") summary.skipped++;
    else {
      summary.processed++;
      summary[outcome]++;
    }
  }
  return summary;
}
