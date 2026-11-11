/**
 * Pure-TypeScript media probing (no FFmpeg, no dependencies).
 *
 * `MediaProbe` is the swap boundary: a future implementation backed by ffprobe
 * can replace `containerProbe` without touching the checks or the pipeline.
 *
 * The probe does two jobs:
 *  1. Integrity: the magic bytes must match the DECLARED content type, and the
 *     container must be structurally sound (not truncated/corrupt).
 *  2. For video, extract the real duration from the container (MP4 `mvhd`,
 *     WebM EBML `Duration` x `TimecodeScale`) so it never has to be trusted
 *     from the client.
 */

export type ProbeFailureCode = "magic_mismatch" | "corrupt" | "unverifiable_duration";

export type ProbeResult =
  | { ok: true; /** Verified duration in seconds; null for images. */ durationSec: number | null }
  | { ok: false; code: ProbeFailureCode; message: string };

export interface MediaProbe {
  probe(bytes: Uint8Array, declaredContentType: string): Promise<ProbeResult>;
}

class ProbeError extends Error {
  constructor(
    readonly code: ProbeFailureCode,
    message: string,
  ) {
    super(message);
  }
}

const corrupt = (message: string) => new ProbeError("corrupt", message);

const ascii = (b: Uint8Array, start: number, end: number) =>
  String.fromCharCode(...b.subarray(start, end));

const startsWith = (b: Uint8Array, sig: number[], offset = 0) =>
  b.length >= offset + sig.length && sig.every((v, i) => b[offset + i] === v);

// ---- Magic bytes -----------------------------------------------------------

/** True when the leading bytes are consistent with the declared (allowlisted) type. */
export function magicMatches(b: Uint8Array, contentType: string): boolean {
  switch (contentType) {
    case "video/mp4":
      return b.length >= 12 && ascii(b, 4, 8) === "ftyp";
    case "video/webm":
      return startsWith(b, [0x1a, 0x45, 0xdf, 0xa3]);
    case "image/jpeg":
      return startsWith(b, [0xff, 0xd8, 0xff]);
    case "image/png":
      return startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case "image/webp":
      return b.length >= 12 && ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 12) === "WEBP";
    default:
      return false;
  }
}

// ---- MP4 -------------------------------------------------------------------

type Box = { type: string; dataStart: number; end: number };

/** Walks the boxes in [start, end). Any box overrunning its parent means truncation/corruption. */
function* mp4Boxes(b: Buffer, start: number, end: number): Generator<Box> {
  let pos = start;
  while (pos < end) {
    if (end - pos < 8) throw corrupt("MP4 box header is truncated");
    let size = b.readUInt32BE(pos);
    const type = ascii(b, pos + 4, pos + 8);
    let header = 8;
    if (size === 1) {
      if (end - pos < 16) throw corrupt("MP4 box header is truncated");
      const big = b.readBigUInt64BE(pos + 8);
      if (big > BigInt(Number.MAX_SAFE_INTEGER)) throw corrupt("MP4 box size is invalid");
      size = Number(big);
      header = 16;
    } else if (size === 0) {
      size = end - pos; // extends to the end of the enclosing container
    }
    if (size < header) throw corrupt("MP4 box size is invalid");
    if (pos + size > end) throw corrupt("MP4 file is truncated (box extends past end of data)");
    yield { type, dataStart: pos + header, end: pos + size };
    pos += size;
  }
}

function probeMp4(b: Buffer): number {
  let moov: Box | null = null;
  for (const box of mp4Boxes(b, 0, b.length)) {
    if (box.type === "moov" && !moov) moov = box;
  }
  if (!moov) throw corrupt("MP4 has no moov box");
  for (const box of mp4Boxes(b, moov.dataStart, moov.end)) {
    if (box.type !== "mvhd") continue;
    const v = b[box.dataStart];
    let timescale: number;
    let duration: number;
    if (v === 0) {
      if (box.end - box.dataStart < 20) throw corrupt("MP4 mvhd box is truncated");
      timescale = b.readUInt32BE(box.dataStart + 12);
      duration = b.readUInt32BE(box.dataStart + 16);
    } else if (v === 1) {
      if (box.end - box.dataStart < 32) throw corrupt("MP4 mvhd box is truncated");
      timescale = b.readUInt32BE(box.dataStart + 20);
      duration = Number(b.readBigUInt64BE(box.dataStart + 24));
    } else {
      throw corrupt("MP4 mvhd has an unknown version");
    }
    if (timescale === 0) throw corrupt("MP4 mvhd has a zero timescale");
    return duration / timescale;
  }
  throw corrupt("MP4 moov has no mvhd box");
}

// ---- WebM / EBML -----------------------------------------------------------

const ID_EBML = 0x1a45dfa3;
const ID_SEGMENT = 0x18538067;
const ID_INFO = 0x1549a966;
const ID_TIMECODE_SCALE = 0x2ad7b1;
const ID_DURATION = 0x4489;

type Element = { id: number; dataStart: number; end: number | null };

/** Reads one EBML element header. `end` is null for the "unknown size" marker. */
function readElement(b: Buffer, pos: number, limit: number): Element {
  if (pos >= limit) throw corrupt("WebM element header is truncated");
  const idLen = Math.clz32(b[pos]) - 23; // leading zeros of the byte + 1
  if (idLen < 1 || idLen > 4 || pos + idLen > limit) throw corrupt("WebM element id is invalid");
  let id = 0;
  for (let i = 0; i < idLen; i++) id = id * 256 + b[pos + i];

  const sPos = pos + idLen;
  if (sPos >= limit) throw corrupt("WebM element header is truncated");
  const sLen = Math.clz32(b[sPos]) - 23;
  if (sLen < 1 || sLen > 8 || sPos + sLen > limit) throw corrupt("WebM element size is invalid");
  let size = b[sPos] & (0xff >> sLen);
  let allOnes = size === 0xff >> sLen;
  for (let i = 1; i < sLen; i++) {
    size = size * 256 + b[sPos + i];
    if (b[sPos + i] !== 0xff) allOnes = false;
  }
  const dataStart = sPos + sLen;
  return { id, dataStart, end: allOnes ? null : dataStart + size };
}

function readUint(b: Buffer, start: number, end: number): number {
  if (end - start < 1 || end - start > 8) throw corrupt("WebM unsigned element has an invalid size");
  let v = 0;
  for (let i = start; i < end; i++) v = v * 256 + b[i];
  return v;
}

function probeWebm(b: Buffer): number {
  const header = readElement(b, 0, b.length);
  if (header.id !== ID_EBML || header.end === null || header.end > b.length) {
    throw corrupt("WebM EBML header is invalid or truncated");
  }
  const seg = readElement(b, header.end, b.length);
  if (seg.id !== ID_SEGMENT) throw corrupt("WebM has no Segment element");
  if (seg.end !== null && seg.end > b.length) {
    throw corrupt("WebM file is truncated (Segment extends past end of data)");
  }
  const segEnd = seg.end ?? b.length;

  let timecodeScale = 1_000_000; // EBML default: 1 ms
  let durationUnits: number | null = null;
  let pos = seg.dataStart;
  while (pos < segEnd) {
    const el = readElement(b, pos, segEnd);
    if (el.end === null) break; // unknown-size child (live stream): cannot skip, stop walking
    if (el.end > segEnd) throw corrupt("WebM file is truncated (element extends past end of data)");
    if (el.id === ID_INFO) {
      let ip = el.dataStart;
      while (ip < el.end) {
        const child = readElement(b, ip, el.end);
        if (child.end === null || child.end > el.end) throw corrupt("WebM Info element is malformed");
        if (child.id === ID_TIMECODE_SCALE) {
          timecodeScale = readUint(b, child.dataStart, child.end);
        } else if (child.id === ID_DURATION) {
          const len = child.end - child.dataStart;
          if (len === 4) durationUnits = b.readFloatBE(child.dataStart);
          else if (len === 8) durationUnits = b.readDoubleBE(child.dataStart);
          else throw corrupt("WebM Duration element has an invalid size");
        }
        ip = child.end;
      }
    }
    pos = el.end;
  }

  if (durationUnits === null) {
    throw new ProbeError("unverifiable_duration", "WebM does not declare a duration");
  }
  if (timecodeScale === 0) throw corrupt("WebM TimecodeScale is zero");
  return (durationUnits * timecodeScale) / 1e9;
}

// ---- Images ----------------------------------------------------------------

function probeJpeg(b: Buffer): void {
  let end = b.length;
  while (end > 0 && b[end - 1] === 0) end--; // tolerate trailing zero padding
  if (end < 4 || b[end - 2] !== 0xff || b[end - 1] !== 0xd9) {
    throw corrupt("JPEG is truncated (missing end-of-image marker)");
  }
}

function probePng(b: Buffer): void {
  let pos = 8;
  let first = true;
  while (pos < b.length) {
    if (b.length - pos < 12) throw corrupt("PNG chunk header is truncated");
    const len = b.readUInt32BE(pos);
    const type = ascii(b, pos + 4, pos + 8);
    if (pos + 12 + len > b.length) throw corrupt("PNG is truncated (chunk extends past end of data)");
    if (first) {
      if (type !== "IHDR" || len !== 13) throw corrupt("PNG is missing a valid IHDR chunk");
      if (b.readUInt32BE(pos + 8) === 0 || b.readUInt32BE(pos + 12) === 0) {
        throw corrupt("PNG has zero width or height");
      }
      first = false;
    }
    if (type === "IEND") return;
    pos += 12 + len;
  }
  throw corrupt("PNG is truncated (missing IEND chunk)");
}

function probeWebp(b: Buffer): void {
  if (b.length < 20) throw corrupt("WebP is truncated");
  if (b.readUInt32LE(4) + 8 > b.length) throw corrupt("WebP is truncated (RIFF size exceeds data)");
  if (!["VP8 ", "VP8L", "VP8X"].includes(ascii(b, 12, 16))) {
    throw corrupt("WebP has no recognised image chunk");
  }
}

// ---- Public probe ----------------------------------------------------------

/** Default probe: pure container parsing, no external binaries. */
export const containerProbe: MediaProbe = {
  async probe(bytes, declaredContentType) {
    if (!magicMatches(bytes, declaredContentType)) {
      return {
        ok: false,
        code: "magic_mismatch",
        message: `File contents do not match the declared type ${declaredContentType}`,
      };
    }
    const b = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    try {
      switch (declaredContentType) {
        case "video/mp4":
        case "video/webm": {
          const durationSec = declaredContentType === "video/mp4" ? probeMp4(b) : probeWebm(b);
          if (!Number.isFinite(durationSec) || durationSec < 0) {
            throw corrupt("Container declares an invalid duration");
          }
          if (durationSec === 0) throw corrupt("Container declares a zero duration");
          return { ok: true, durationSec };
        }
        case "image/jpeg":
          probeJpeg(b);
          return { ok: true, durationSec: null };
        case "image/png":
          probePng(b);
          return { ok: true, durationSec: null };
        case "image/webp":
          probeWebp(b);
          return { ok: true, durationSec: null };
        default:
          return { ok: false, code: "magic_mismatch", message: `Unsupported type ${declaredContentType}` };
      }
    } catch (e) {
      if (e instanceof ProbeError) return { ok: false, code: e.code, message: e.message };
      if (e instanceof RangeError) {
        return { ok: false, code: "corrupt", message: "Container is truncated or corrupt" };
      }
      throw e;
    }
  },
};
