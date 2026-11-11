import { ALLOWED_FORMATS, MAX_VIDEO_DURATION_SEC, maxUploadBytes, mediaTypeForContentType } from "./config";
import { containerProbe, type MediaProbe } from "./probe";

/**
 * Automated checks. Decision rules (fail-closed):
 *
 * HARD FAIL (never publishes):
 *  - content type not on the allowlist, or not matching the record's media type
 *  - empty file, or file larger than the configured size cap
 *  - magic bytes do not match the declared content type
 *  - container unparseable / truncated / corrupt
 *  - video whose duration cannot be verified from the container
 *  - video duration > MAX_VIDEO_DURATION_SEC
 *
 * SOFT FLAG (publish-then-review: goes live AND is flagged for the admin queue):
 *  - video duration at or above NEAR_CAP_FRACTION of the cap ("near_duration_cap"),
 *    a borderline upload worth a human look.
 *
 * Everything else passes.
 */

/** Videos at or above this fraction of the duration cap are flagged for review. */
export const NEAR_CAP_FRACTION = 0.9;

export type CheckInput = {
  type: "video" | "image";
  declaredContentType: string;
  bytes: Uint8Array;
  probe?: MediaProbe;
  env?: Record<string, string | undefined>;
};

export type CheckOutcome =
  | { verdict: "pass"; durationSec: number | null }
  | { verdict: "flag"; durationSec: number | null; reasons: string[] }
  | { verdict: "fail"; reason: string };

const fail = (reason: string): CheckOutcome => ({ verdict: "fail", reason });

export async function runChecks(input: CheckInput): Promise<CheckOutcome> {
  const { type, declaredContentType, bytes } = input;
  const probe = input.probe ?? containerProbe;

  if (
    !Object.hasOwn(ALLOWED_FORMATS[type], declaredContentType) ||
    mediaTypeForContentType(declaredContentType) !== type
  ) {
    return fail(`Unsupported format ${declaredContentType} for a ${type}`);
  }
  if (bytes.byteLength === 0) return fail("Uploaded file is empty");
  if (bytes.byteLength > maxUploadBytes(type, input.env)) return fail("Uploaded file exceeds the size limit");

  const result = await probe.probe(bytes, declaredContentType);
  if (!result.ok) return fail(result.message);

  if (type === "image") return { verdict: "pass", durationSec: null };

  const duration = result.durationSec;
  if (duration === null || !Number.isFinite(duration)) return fail("Video duration could not be verified");
  if (duration > MAX_VIDEO_DURATION_SEC) {
    return fail(`Video is longer than the ${MAX_VIDEO_DURATION_SEC / 60} minute limit`);
  }
  if (duration >= MAX_VIDEO_DURATION_SEC * NEAR_CAP_FRACTION) {
    return {
      verdict: "flag",
      durationSec: duration,
      reasons: [`near_duration_cap: ${Math.round(duration)}s of ${MAX_VIDEO_DURATION_SEC}s maximum`],
    };
  }
  return { verdict: "pass", durationSec: duration };
}
