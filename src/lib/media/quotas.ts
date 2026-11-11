import { quotaLimits } from "./config";
import { getStorageUsage } from "./records";

export { quotaLimits };

export type QuotaResult = { ok: true } | { ok: false; status: 429 | 503; error: string };

const formatBytes = (n: number) => {
  const gb = n / 1024 ** 3;
  return gb >= 1 ? `${+gb.toFixed(2)} GB` : `${+(n / 1024 ** 2).toFixed(2)} MB`;
};

/**
 * Upload-init quota gate (fail fast, before a draft record or any bytes exist).
 * Counts every non-removed item, drafts included, so abandoned drafts cannot
 * dodge the caps (the cleanup runner reclaims them after the TTL).
 *  - 429: the caller's own quota (items or bytes) is used up.
 *  - 503: the site-wide storage ceiling is reached; logged as a warning since
 *    admin visibility is a later plan.
 */
export async function checkUploadQuota(
  ownerId: string,
  incomingBytes: number,
  env: Record<string, string | undefined> = process.env,
): Promise<QuotaResult> {
  const limits = quotaLimits(env);

  const mine = await getStorageUsage(ownerId);
  if (mine.count + 1 > limits.maxItemsPerUser) {
    return {
      ok: false,
      status: 429,
      error: `Upload quota reached: you can keep at most ${limits.maxItemsPerUser} items. Delete some to upload more.`,
    };
  }
  if (mine.bytes + incomingBytes > limits.maxBytesPerUser) {
    return {
      ok: false,
      status: 429,
      error: `Storage quota reached: your uploads are limited to ${formatBytes(limits.maxBytesPerUser)} in total. Delete some to upload more.`,
    };
  }

  const total = await getStorageUsage();
  if (total.bytes + incomingBytes > limits.maxTotalBytes) {
    console.warn(
      `[media] Global storage ceiling reached (${total.bytes} of ${limits.maxTotalBytes} bytes used); rejecting upload from ${ownerId}`,
    );
    return {
      ok: false,
      status: 503,
      error: "Uploads are temporarily unavailable: the site is at storage capacity. Please try again later.",
    };
  }
  return { ok: true };
}
