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

const block = (kind: "model" | "enum", name: string) =>
  (schema.match(new RegExp(`${kind} ${name} \\{[\\s\\S]*?\\n\\}`))?.[0] ?? "").replace(/^\s*\/\/\/.*$/gm, "");

describe("payments schema", () => {
  it("defines the payment enums", () => {
    expect(block("enum", "EntitlementScope")).toMatch(/creator\s+media/);
    expect(block("enum", "PayoutStatus")).toMatch(/unpaid\s+paid/);
    expect(block("enum", "TransactionStatus")).toMatch(/pending\s+completed\s+failed\s+refunded\s+chargeback/);
    expect(block("enum", "EntitlementType")).toMatch(/monthly\s+yearly\s+one_time\s+per_video/);
  });

  it("defines Entitlement with scope targets, term and lookup indexes", () => {
    const e = block("model", "Entitlement");
    expect(e).toMatch(/scope\s+EntitlementScope/);
    expect(e).toMatch(/creatorId\s+String\?/);
    expect(e).toMatch(/mediaId\s+String\?/);
    expect(e).toMatch(/type\s+EntitlementType/);
    expect(e).toMatch(/status\s+EntitlementStatus/);
    expect(e).toMatch(/startsAt\s+DateTime/);
    expect(e).toMatch(/endsAt\s+DateTime\?/);
    expect(e).toMatch(/@@index\(\[userId/);
  });

  it("stores Transaction money as BigInt and snapshots the split", () => {
    const t = block("model", "Transaction");
    for (const f of ["grossCents", "platformFeeCents", "creatorEarningsCents"]) {
      expect(t).toMatch(new RegExp(`${f}\\s+BigInt\\b`));
    }
    expect(t).toMatch(/creatorShareBps\s+Int\b/);
    expect(t).toMatch(/accessType\s+EntitlementType/);
    expect(t).toMatch(/status\s+TransactionStatus/);
    expect(t).toMatch(/payoutStatus\s+PayoutStatus\s+@default\(unpaid\)/);
    expect(t).toMatch(/paidOutAt\s+DateTime\?/);
    expect(t).toMatch(/completedAt\s+DateTime\?/);
    expect(t).toMatch(/@@unique\(\[provider, providerRef\]\)/);
    expect(t).toMatch(/entitlementId\s+String\?\s+@unique/);
    expect(t).toMatch(/onDelete: SetNull/);
    expect(t).not.toMatch(/onDelete: Cascade/);
    for (const i of ["status", "creatorId", "buyerId"]) expect(t).toContain(`@@index([${i}])`);
  });

  it("defines PaymentEvent de-duplication, CreatorPricing and PlatformSetting", () => {
    expect(block("model", "PaymentEvent")).toMatch(/@@unique\(\[provider, eventId\]\)/);
    const p = block("model", "CreatorPricing");
    expect(p).toMatch(/userId\s+String\s+@unique/);
    for (const f of ["monthlyPriceCents", "yearlyPriceCents", "oneTimePriceCents"]) {
      expect(p).toMatch(new RegExp(`${f}\\s+Int\\?`));
    }
    const s = block("model", "PlatformSetting");
    expect(s).toMatch(/key\s+String\s+@id/);
    expect(s).toMatch(/value\s+Json/);
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
