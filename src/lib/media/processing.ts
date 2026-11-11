/**
 * Processing seam. The upload-complete endpoint calls this exactly once after
 * moving a record to status=processing / processingStatus=pending.
 *
 * Task 3 (automated checks + transcoding pipeline) implements this: probe
 * duration/format, run checks, then either publish (status=live) or flag/fail.
 * Until then it is a deliberate no-op, so uploads stay in processing/pending
 * and nothing is ever published by the upload flow.
 */
export async function enqueueMediaProcessing(mediaId: string): Promise<void> {
  void mediaId;
}
