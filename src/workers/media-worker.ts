import { processMedia, type ProcessDeps } from "@/lib/media/processing";
import { listPendingMedia } from "@/lib/media/records";

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
};

export async function runPendingMedia(deps: ProcessDeps = {}): Promise<WorkerSummary> {
  const summary: WorkerSummary = { processed: 0, live: 0, flagged: 0, failed: 0, skipped: 0 };
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
