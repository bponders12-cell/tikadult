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
