import { NextResponse } from "next/server";
import { ALLOWED_FORMATS, maxUploadBytes, type UploadMediaType } from "@/lib/media/config";
import { getOwnedMedia, jsonError, requireUserId, toPublicMedia, type IdContext } from "@/lib/media/api";
import { setMediaAsset } from "@/lib/media/records";
import { getStorage } from "@/lib/media/storage";

/**
 * Upload step 2 (local-adapter byte receiver): PUT the raw file body.
 * A presigned-URL S3 flow replaces this endpoint without changing the records
 * model: the client PUTs straight to storage, then calls /complete.
 */
export async function PUT(request: Request, { params }: IdContext) {
  const userId = await requireUserId();
  if (!userId) return jsonError("Unauthorized", 401);
  const media = await getOwnedMedia((await params).id, userId);
  if (!media) return jsonError("Not found", 404);
  if (media.status !== "draft") return jsonError("Upload already completed", 409);

  const type = media.type as UploadMediaType;
  const declared = (request.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (declared !== media.format || !(declared in ALLOWED_FORMATS[type])) {
    return jsonError("Content-Type does not match the declared format", 415);
  }

  const cap = maxUploadBytes(type);
  const headerLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(headerLength) && headerLength > cap) {
    return jsonError(`File exceeds the ${cap} byte limit`, 413);
  }

  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength === 0) return jsonError("Empty upload", 400);
  if (bytes.byteLength > cap) return jsonError(`File exceeds the ${cap} byte limit`, 413);

  const ext = ALLOWED_FORMATS[type][declared];
  const storageKey = `media/${userId}/${media.id}/original.${ext}`;
  await getStorage().put(storageKey, bytes, { contentType: declared });
  await setMediaAsset(media.id, {
    kind: "original",
    storageKey,
    contentType: declared,
    sizeBytes: bytes.byteLength,
  });
  return NextResponse.json({ ok: true, sizeBytes: bytes.byteLength, media: toPublicMedia(media) });
}
