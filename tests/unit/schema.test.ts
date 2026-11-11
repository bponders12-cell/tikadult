import { readFileSync } from "fs";
import { describe, it, expect } from "vitest";
const schema = readFileSync("prisma/schema.prisma", "utf8");
describe("schema", () => {
  it("defines core models and 18+/settings fields", () => {
    expect(schema).toMatch(/model User/);
    expect(schema).toMatch(/ageConfirmedAt/);
    expect(schema).toMatch(/model Category/);
    expect(schema).toMatch(/model UserSettings/);
    expect(schema).toMatch(/feedLayout/);
  });
});

describe("media schema", () => {
  it("extends Media with type, visibility, price, file and processing/flag fields", () => {
    const media = schema.match(/model Media \{[\s\S]*?\n\}/)?.[0] ?? "";
    for (const f of [
      "type ",
      "visibility ",
      "unlockPriceCents",
      "sizeBytes",
      "format",
      "processingStatus",
      "processingError",
      "flagReason",
      "flaggedAt",
      "publishedAt",
      "assets ",
    ]) {
      expect(media).toContain(f);
    }
    expect(media).toMatch(/status\s+MediaStatus/);
    // 32-bit Int would overflow Postgres SUM() aggregates (quota totals) past 2 GB.
    expect(media).toMatch(/sizeBytes\s+BigInt\?/);
  });

  it("defines media enums", () => {
    expect(schema).toMatch(/enum MediaType \{\s*video\s+image\s*\}/);
    expect(schema).toMatch(/enum MediaVisibility \{\s*public\s+private\s+restricted\s*\}/);
    expect(schema).toMatch(/enum ProcessingStatus \{\s*pending\s+processing\s+ready\s+failed\s*\}/);
    expect(schema).toMatch(/enum MediaAssetKind \{\s*original\s+web\s+thumbnail\s*\}/);
  });

  it("defines MediaAsset keyed uniquely by media + kind", () => {
    const asset = schema.match(/model MediaAsset \{[\s\S]*?\n\}/)?.[0] ?? "";
    expect(asset).toMatch(/kind\s+MediaAssetKind/);
    expect(asset).toMatch(/storageKey\s+String/);
    expect(asset).toMatch(/@@unique\(\[mediaId, kind\]\)/);
    expect(asset).toMatch(/onDelete: Cascade/);
  });
});
