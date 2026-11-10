import { describe, it, expect } from "vitest";
import { defaultSettings } from "@/lib/settings";

describe("defaultSettings", () => {
  it("defaults to immersive layout and configurable prefs objects", () => {
    expect(defaultSettings().feedLayout).toBe("immersive");
    expect(defaultSettings().privacyPrefs).toBeTypeOf("object");
    expect(defaultSettings().messagingPrefs).toBeTypeOf("object");
  });
});
