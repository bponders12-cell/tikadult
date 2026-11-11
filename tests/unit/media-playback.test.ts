import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getSession = vi.fn();
vi.mock("@/lib/auth", () => ({ getSession: () => getSession() }));

import { GET as deliver } from "@/app/api/media/[id]/asset/[kind]/route";
import {
  createMedia,
  listLiveByCategory,
  listLiveByOwner,
  resetMemoryMedia,
  setMediaAsset,
  updateMedia,
  type MediaType,
  type MediaVisibility,
} from "@/lib/media/records";
import { getStorage } from "@/lib/media/storage";
import { buildFeedItems } from "@/lib/media/feed";
import { parseRange } from "@/lib/media/delivery";

const BYTES = Uint8Array.from({ length: 100 }, (_, i) => i);
const ctx = (id: string, kind: string) => ({ params: Promise.resolve({ id, kind }) });
const AGE = { cookie: "age_confirmed=1" };
const get = (id: string, kind: string, range?: string, headers: Record<string, string> = AGE) =>
  deliver(
    new Request(`http://x/api/media/${id}/asset/${kind}`, {
      headers: { ...headers, ...(range ? { range } : {}) },
    }),
    ctx(id, kind),
  );
const as = (id: string | null) => getSession.mockResolvedValue(id ? { user: { id } } : null);

async function seed(
  opts: {
    ownerId?: string;
    category?: string | null;
    visibility?: MediaVisibility;
    live?: boolean;
    type?: MediaType;
    thumb?: boolean;
    title?: string;
  } = {},
) {
  const m = await createMedia({
    ownerId: opts.ownerId ?? "owner1",
    type: opts.type ?? "video",
    visibility: opts.visibility ?? "public",
    categorySlug: opts.category === undefined ? "cat-a" : opts.category,
    title: opts.title ?? "t",
  });
  const key = `media/${m.id}/web`;
  await getStorage().put(key, BYTES);
  await setMediaAsset(m.id, { kind: "web", storageKey: key, contentType: "video/mp4", sizeBytes: 100 });
  if (opts.thumb) {
    const tk = `media/${m.id}/thumb`;
    await getStorage().put(tk, Uint8Array.from([9, 9, 9]));
    await setMediaAsset(m.id, { kind: "thumbnail", storageKey: tk, contentType: "image/jpeg", sizeBytes: 3 });
  }
  if (opts.live !== false) {
    await updateMedia(m.id, { status: "live", processingStatus: "ready", publishedAt: new Date() });
  }
  return m;
}

let dir: string;
beforeEach(async () => {
  delete process.env.DATABASE_URL;
  dir = await mkdtemp(path.join(tmpdir(), "media-play-"));
  process.env.LOCAL_STORAGE_DIR = dir;
  resetMemoryMedia();
  as(null);
});
afterEach(async () => {
  delete process.env.LOCAL_STORAGE_DIR;
  await rm(dir, { recursive: true, force: true });
});

describe("parseRange", () => {
  it("parses start-end, open end and suffix", () => {
    expect(parseRange("bytes=0-9", 100)).toEqual({ kind: "range", start: 0, end: 9 });
    expect(parseRange("bytes=90-", 100)).toEqual({ kind: "range", start: 90, end: 99 });
    expect(parseRange("bytes=-10", 100)).toEqual({ kind: "range", start: 90, end: 99 });
    expect(parseRange("bytes=50-500", 100)).toEqual({ kind: "range", start: 50, end: 99 });
  });
  it("flags unsatisfiable ranges", () => {
    expect(parseRange("bytes=100-", 100)).toEqual({ kind: "unsatisfiable" });
    expect(parseRange("bytes=20-10", 100)).toEqual({ kind: "unsatisfiable" });
    expect(parseRange("bytes=-0", 100)).toEqual({ kind: "unsatisfiable" });
  });
  it("ignores absent, malformed, other-unit and multi-range headers (full body)", () => {
    expect(parseRange(null, 100)).toEqual({ kind: "none" });
    expect(parseRange("garbage", 100)).toEqual({ kind: "none" });
    expect(parseRange("items=0-1", 100)).toEqual({ kind: "none" });
    expect(parseRange("bytes=0-1,5-6", 100)).toEqual({ kind: "none" });
  });
});

describe("asset delivery route", () => {
  it("404s anonymous callers without the age cookie, even for public+live", async () => {
    const m = await seed();
    expect((await get(m.id, "web", undefined, {})).status).toBe(404);
    expect((await get(m.id, "web", undefined, { cookie: "age_confirmed=0" })).status).toBe(404);
  });

  it("serves anonymous callers with the age cookie, with non-shared-cacheable headers", async () => {
    const m = await seed();
    const res = await get(m.id, "web");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, max-age=3600");
    expect(res.headers.get("vary")).toBe("Cookie");
  });

  it("owner session works without the age cookie", async () => {
    const m = await seed({ live: false });
    as("owner1");
    expect((await get(m.id, "web", undefined, {})).status).toBe(200);
  });

  it("serves 200 with full bytes, content-type, length and Accept-Ranges", async () => {
    const m = await seed();
    const res = await get(m.id, "web");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("video/mp4");
    expect(res.headers.get("accept-ranges")).toBe("bytes");
    expect(res.headers.get("content-length")).toBe("100");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(BYTES);
  });

  it("serves 206 with the exact sliced bytes and Content-Range", async () => {
    const m = await seed();
    const res = await get(m.id, "web", "bytes=10-19");
    expect(res.status).toBe(206);
    expect(res.headers.get("content-range")).toBe("bytes 10-19/100");
    expect(res.headers.get("content-length")).toBe("10");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(BYTES.slice(10, 20));
  });

  it("supports open-ended and suffix ranges", async () => {
    const m = await seed();
    const open = await get(m.id, "web", "bytes=95-");
    expect(open.headers.get("content-range")).toBe("bytes 95-99/100");
    expect(new Uint8Array(await open.arrayBuffer())).toEqual(BYTES.slice(95));
    const suffix = await get(m.id, "web", "bytes=-4");
    expect(suffix.status).toBe(206);
    expect(new Uint8Array(await suffix.arrayBuffer())).toEqual(BYTES.slice(96));
  });

  it("returns 416 with Content-Range */size when unsatisfiable", async () => {
    const m = await seed();
    const res = await get(m.id, "web", "bytes=200-300");
    expect(res.status).toBe(416);
    expect(res.headers.get("content-range")).toBe("bytes */100");
  });

  it("answers multi-range with the full 200 body", async () => {
    const m = await seed();
    const res = await get(m.id, "web", "bytes=0-1,5-6");
    expect(res.status).toBe(200);
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(BYTES);
  });

  it("serves the thumbnail kind with its own content type", async () => {
    const m = await seed({ thumb: true });
    const res = await get(m.id, "thumbnail");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/jpeg");
    expect(Array.from(new Uint8Array(await res.arrayBuffer()))).toEqual([9, 9, 9]);
  });

  it("404s for a missing asset kind, unknown kind, original kind and unknown media", async () => {
    const m = await seed();
    expect((await get(m.id, "thumbnail")).status).toBe(404);
    expect((await get(m.id, "bogus")).status).toBe(404);
    expect((await get(m.id, "original")).status).toBe(404);
    expect((await get("nope", "web")).status).toBe(404);
  });

  it("404s to anonymous callers for non-live or non-public media", async () => {
    const draft = await seed({ live: false });
    const priv = await seed({ visibility: "private" });
    const restricted = await seed({ visibility: "restricted" });
    for (const m of [draft, priv, restricted]) expect((await get(m.id, "web")).status).toBe(404);
  });

  it("404s to other signed-in users too", async () => {
    const priv = await seed({ visibility: "private" });
    as("someone-else");
    expect((await get(priv.id, "web")).status).toBe(404);
  });

  it("lets owners fetch their own non-public and unpublished items (privately cached)", async () => {
    const priv = await seed({ visibility: "private" });
    const draft = await seed({ live: false });
    as("owner1");
    const a = await get(priv.id, "web");
    expect(a.status).toBe(200);
    expect(a.headers.get("cache-control")).toMatch(/private/);
    expect((await get(draft.id, "web")).status).toBe(200);
  });

  it("404s when the stored bytes are missing", async () => {
    const m = await seed();
    await getStorage().delete(`media/${m.id}/web`);
    expect((await get(m.id, "web")).status).toBe(404);
  });
});

describe("feed queries", () => {
  it("listLiveByCategory returns only live+public items of that category", async () => {
    const a = await seed({ title: "a" });
    await seed({ live: false });
    await seed({ visibility: "private" });
    await seed({ visibility: "restricted" });
    await seed({ category: "cat-b" });
    const b = await seed({ title: "b" });
    const rows = await listLiveByCategory("cat-a");
    expect(rows.map((r) => r.id).sort()).toEqual([a.id, b.id].sort());
  });

  it("listLiveByOwner returns only that owner's live+public items", async () => {
    const mine = await seed({ ownerId: "u9" });
    await seed({ ownerId: "u9", visibility: "private" });
    await seed({ ownerId: "u9", live: false });
    await seed({ ownerId: "other" });
    expect((await listLiveByOwner("u9")).map((r) => r.id)).toEqual([mine.id]);
  });
});

describe("buildFeedItems", () => {
  it("maps live media to playable slides with delivery URLs and poster", async () => {
    const v = await seed({ thumb: true, title: "Clip" });
    const img = await seed({ type: "image", title: "Pic" });
    const items = await buildFeedItems("cat-a");
    const byId = Object.fromEntries(items.map((i) => [i.id, i]));
    expect(byId[v.id].media).toEqual({
      type: "video",
      src: `/api/media/${v.id}/asset/web`,
      posterSrc: `/api/media/${v.id}/asset/thumbnail`,
    });
    expect(byId[v.id].title).toBe("Clip");
    expect(byId[img.id].media).toEqual({
      type: "image",
      src: `/api/media/${img.id}/asset/web`,
      posterSrc: null,
    });
  });

  it("skips live items lacking a web asset", async () => {
    const m = await createMedia({ ownerId: "o", type: "video", visibility: "public", categorySlug: "cat-a" });
    await updateMedia(m.id, { status: "live" });
    const items = await buildFeedItems("cat-a");
    expect(items.every((i) => i.id !== m.id)).toBe(true);
  });

  it("falls back to placeholders when the category has no live public media", async () => {
    await seed({ visibility: "private" });
    await seed({ category: "cat-b" });
    const items = await buildFeedItems("cat-a");
    expect(items).toHaveLength(3);
    expect(items.every((i) => i.media === undefined)).toBe(true);
  });
});
