import { getSession } from "@/lib/auth";
import { canFetchAsset, isDeliverableKind, isPubliclyVisible, parseRange } from "@/lib/media/delivery";
import { getMedia } from "@/lib/media/records";
import { getStorage } from "@/lib/media/storage";

type Ctx = { params: Promise<{ id: string; kind: string }> };

const notFound = () => new Response("Not found", { status: 404 });

/**
 * Playback delivery for the `web` and `thumbnail` assets.
 * Budget tradeoff: storage.get returns the whole (upload-capped) asset, so Range
 * is served by slicing the in-memory buffer; CDN/object delivery is the later swap-in.
 * Multi-range requests get the full 200 body (permitted by RFC 9110).
 */
export async function GET(request: Request, { params }: Ctx) {
  const { id, kind } = await params;
  if (!isDeliverableKind(kind)) return notFound();

  const media = await getMedia(id);
  if (!media) return notFound();
  const userId = (await getSession())?.user?.id ?? null;
  if (!canFetchAsset(media, userId)) return notFound();

  const asset = media.assets.find((a) => a.kind === kind);
  if (!asset) return notFound();
  const bytes = await getStorage().get(asset.storageKey);
  if (!bytes) return notFound();

  const size = bytes.byteLength;
  const headers: Record<string, string> = {
    "Content-Type": asset.contentType,
    "Accept-Ranges": "bytes",
    // Only public+live bytes may be shared-cached; owner previews of other states never.
    "Cache-Control": isPubliclyVisible(media) ? "public, max-age=3600" : "private, no-store",
    "X-Content-Type-Options": "nosniff",
  };

  const range = parseRange(request.headers.get("range"), size);
  if (range.kind === "unsatisfiable") {
    return new Response(null, { status: 416, headers: { ...headers, "Content-Range": `bytes */${size}` } });
  }
  if (range.kind === "range") {
    const slice = bytes.subarray(range.start, range.end + 1);
    return new Response(new Uint8Array(slice), {
      status: 206,
      headers: {
        ...headers,
        "Content-Range": `bytes ${range.start}-${range.end}/${size}`,
        "Content-Length": String(slice.byteLength),
      },
    });
  }
  return new Response(new Uint8Array(bytes), {
    status: 200,
    headers: { ...headers, "Content-Length": String(size) },
  });
}
