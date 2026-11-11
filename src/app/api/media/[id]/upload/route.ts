import { NextResponse } from "next/server";
import { ALLOWED_FORMATS, maxUploadBytes, type UploadMediaType } from "@/lib/media/config";
import { getOwnedMedia, jsonError, requireUserId, toPublicMedia, type IdContext } from "@/lib/media/api";
import { setMediaAsset } from "@/lib/media/records";
import { getStorage } from "@/lib/media/storage";

/** Reads the request body, aborting (returns null) as soon as it exceeds `cap` bytes. */
async function readCapped(request: Request, cap: number): Promise<Uint8Array | null> {
  if (!request.body) return new Uint8Array(0);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > cap) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}

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
  if (declared !== media.format || !Object.hasOwn(ALLOWED_FORMATS[type], declared)) {
    return jsonError("Content-Type does not match the declared format", 415);
  }

  // The declared size (what init's quota check counted) bounds the read, so a
  // lying client never makes us buffer more than it declared.
  const globalCap = maxUploadBytes(type);
  const cap = Math.min(globalCap, media.sizeBytes ?? globalCap);
  const overMessage = () =>
    cap < globalCap
      ? `Upload is larger than the declared size of ${cap} bytes`
      : `File exceeds the ${globalCap} byte limit`;
  const headerLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(headerLength) && headerLength > cap) {
    return jsonError(overMessage(), 413);
  }

  // Stream with a running counter so a missing/lying content-length (chunked
  // transfer) can never buffer more than `cap` bytes.
  const bytes = await readCapped(request, cap);
  if (bytes === null) return jsonError(overMessage(), 413);
  if (bytes.byteLength === 0) return jsonError("Empty upload", 400);

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
