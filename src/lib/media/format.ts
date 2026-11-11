/** Pure display/convert helpers shared by the upload and studio UIs. */

/** "4.99" -> 499. Returns null for blank input, NaN for unparseable/negative. */
export function dollarsToCents(input: string): number | null {
  const s = input.trim();
  if (s === "") return null;
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return NaN;
  return Math.round(Number(s) * 100);
}

export function centsToDollars(cents: number | null | undefined): string {
  return cents == null ? "" : (cents / 100).toFixed(2);
}

export function statusLabel(status: string, processingStatus: string): string {
  switch (status) {
    case "draft":
      return "Draft (upload not finished)";
    case "processing":
      return processingStatus === "pending" ? "Queued for checks" : "Processing";
    case "live":
      return "Live";
    case "flagged":
      return "Flagged for review";
    case "removed":
      return "Removed";
    default:
      return status;
  }
}
