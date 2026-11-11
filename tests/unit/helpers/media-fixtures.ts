/** Hand-built minimal containers for probe/pipeline tests (no binary blobs). */

const u32 = (n: number) => Buffer.from([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]);

export const box = (type: string, payload: Buffer = Buffer.alloc(0)) =>
  Buffer.concat([u32(8 + payload.length), Buffer.from(type, "ascii"), payload]);

/** Minimal MP4: ftyp + moov(mvhd) + mdat. `moovLast` puts moov after mdat. */
export function mp4(durationSec: number, opts: { timescale?: number; moovLast?: boolean } = {}): Buffer {
  const timescale = opts.timescale ?? 1000;
  const mvhd = Buffer.alloc(100);
  mvhd.writeUInt32BE(timescale, 12);
  mvhd.writeUInt32BE(Math.round(durationSec * timescale), 16);
  const ftyp = box("ftyp", Buffer.concat([Buffer.from("isom"), u32(0), Buffer.from("isom")]));
  const moov = box("moov", box("mvhd", mvhd));
  const mdat = box("mdat", Buffer.alloc(64, 7));
  return Buffer.concat(opts.moovLast ? [ftyp, mdat, moov] : [ftyp, moov, mdat]);
}

/** EBML element with a 1-byte (<127) or 8-byte size field. */
function el(idHex: string, payload: Buffer, wideSize = false): Buffer {
  let size: Buffer;
  if (wideSize) {
    size = Buffer.alloc(8);
    size[0] = 0x01;
    size.writeUInt32BE(payload.length, 4);
  } else {
    if (payload.length >= 127) throw new Error("payload too large for 1-byte size");
    size = Buffer.from([0x80 | payload.length]);
  }
  return Buffer.concat([Buffer.from(idHex, "hex"), size, payload]);
}

/** Minimal WebM: EBML header + Segment(Info(TimecodeScale, Duration) + Cluster). */
export function webm(
  durationSec: number,
  opts: { timecodeScale?: number; omitDuration?: boolean; float32?: boolean } = {},
): Buffer {
  const scale = opts.timecodeScale ?? 1_000_000;
  const ebml = el("1a45dfa3", el("4282", Buffer.from("webm")));
  const units = (durationSec * 1e9) / scale;
  const dur = Buffer.alloc(opts.float32 ? 4 : 8);
  if (opts.float32) dur.writeFloatBE(units);
  else dur.writeDoubleBE(units);
  const info = el(
    "1549a966",
    Buffer.concat([
      el("2ad7b1", u32(scale).subarray(1)), // 3-byte uint is enough for 1e6 (<= 16.7M)
      opts.omitDuration ? Buffer.alloc(0) : el("4489", dur),
    ]),
  );
  const cluster = el("1f43b675", el("e7", Buffer.from([0])));
  return Buffer.concat([ebml, el("18538067", Buffer.concat([info, cluster]), true)]);
}

export function png(): Buffer {
  const chunk = (type: string, data: Buffer) =>
    Buffer.concat([u32(data.length), Buffer.from(type, "ascii"), data, u32(0)]); // CRC not checked
  const ihdr = Buffer.concat([u32(2), u32(2), Buffer.from([8, 2, 0, 0, 0])]);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", Buffer.alloc(8, 1)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

export function jpeg(): Buffer {
  return Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(16, 3), Buffer.from([0xff, 0xd9])]);
}

export function webp(): Buffer {
  const chunk = Buffer.concat([Buffer.from("VP8 "), Buffer.from([8, 0, 0, 0]), Buffer.alloc(8, 5)]);
  const riffSize = Buffer.alloc(4);
  riffSize.writeUInt32LE(4 + chunk.length);
  return Buffer.concat([Buffer.from("RIFF"), riffSize, Buffer.from("WEBP"), chunk]);
}
