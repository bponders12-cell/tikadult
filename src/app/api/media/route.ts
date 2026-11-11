import { NextResponse } from "next/server";
import {
  categoryErrorOrThrow,
  jsonError,
  readJson,
  requireUserId,
  toPublicMedia,
} from "@/lib/media/api";
import { createMedia, listMediaByOwner } from "@/lib/media/records";
import { validateInit } from "@/lib/media/validation";

/** List the signed-in user's own media (studio). */
export async function GET() {
  const userId = await requireUserId();
  if (!userId) return jsonError("Unauthorized", 401);
  const items = await listMediaByOwner(userId);
  return NextResponse.json({ media: items.map(toPublicMedia) });
}

/**
 * Upload step 1 (init): validates metadata, creates a draft record and returns
 * where to send the bytes. The `upload` descriptor is the seam for a future
 * presigned-URL (S3) flow: swap `url` for a presigned URL, nothing else changes.
 */
export async function POST(request: Request) {
  const userId = await requireUserId();
  if (!userId) return jsonError("Unauthorized", 401);
  const parsed = await readJson(request);
  if (!parsed.ok) return jsonError("Invalid JSON", 400);

  const v = validateInit(parsed.body);
  if (!v.ok) return jsonError(v.error, v.status);

  let media;
  try {
    media = await createMedia({
      ownerId: userId,
      type: v.value.type,
      visibility: v.value.visibility,
      unlockPriceCents: v.value.unlockPriceCents,
      title: v.value.title,
      categorySlug: v.value.categorySlug,
      durationSec: v.value.durationSec,
      sizeBytes: v.value.sizeBytes,
      format: v.value.contentType,
    });
  } catch (e) {
    return categoryErrorOrThrow(e);
  }
  return NextResponse.json(
    {
      media: toPublicMedia(media),
      upload: {
        method: "PUT",
        url: `/api/media/${media.id}/upload`,
        headers: { "content-type": v.value.contentType },
      },
    },
    { status: 201 },
  );
}
