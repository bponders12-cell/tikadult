import { NextResponse } from "next/server";
import { getOwnedMedia, jsonError, requireUserId, toPublicMedia, type IdContext } from "@/lib/media/api";
import { enqueueMediaProcessing } from "@/lib/media/processing";
import { updateMedia } from "@/lib/media/records";
import { getStorage } from "@/lib/media/storage";

/**
 * Upload step 3 (complete): verifies the bytes landed, then moves the record to
 * status=processing / processingStatus=pending. This NEVER publishes: going
 * live is the processing pipeline's decision (Task 3), invoked at the single
 * seam below.
 */
export async function POST(_request: Request, { params }: IdContext) {
  const userId = await requireUserId();
  if (!userId) return jsonError("Unauthorized", 401);
  const media = await getOwnedMedia((await params).id, userId);
  if (!media) return jsonError("Not found", 404);
  if (media.status !== "draft") return jsonError("Upload already completed", 409);

  const original = media.assets.find((a) => a.kind === "original");
  if (!original || !(await getStorage().exists(original.storageKey))) {
    return jsonError("No uploaded file found; upload the file first", 409);
  }

  const updated = await updateMedia(media.id, {
    status: "processing",
    processingStatus: "pending",
    sizeBytes: original.sizeBytes ?? media.sizeBytes,
  });
  if (!updated) return jsonError("Not found", 404);

  await enqueueMediaProcessing(updated.id); // <- Task 3 pipeline seam
  return NextResponse.json({ media: toPublicMedia(updated) });
}
