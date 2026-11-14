import crypto from "crypto";

type HeadersMap = Record<string, string>;

export function hashPayload(payload: string | Uint8Array): string {
  return crypto.createHash("sha256").update(payload).digest("hex");
}

function hmac(key: crypto.BinaryLike | crypto.KeyObject, data: string): Buffer {
  return crypto.createHmac("sha256", key).update(data, "utf8").digest();
}

function hmacHex(key: crypto.BinaryLike | crypto.KeyObject, data: string): string {
  return crypto.createHmac("sha256", key).update(data, "utf8").digest("hex");
}

export function signingKey(
  secretAccessKey: string,
  datestamp: string,
  region: string,
  service: string,
): Buffer {
  const kDate = hmac(`AWS4${secretAccessKey}`, datestamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  return hmac(kService, "aws4_request");
}

function encodeRfc3986(str: string): string {
  return encodeURIComponent(str).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

function canonicalUriFromPath(pathname: string): string {
  // Encode each segment but preserve slashes
  return pathname
    .split("/")
    .map((seg) => encodeRfc3986(seg))
    .join("/");
}

function canonicalQueryString(searchParams: URLSearchParams): string {
  const pairs: Array<[string, string]> = [];
  searchParams.forEach((value, key) => {
    pairs.push([encodeRfc3986(key), encodeRfc3986(value)]);
  });
  pairs.sort((a, b) => (a[0] === b[0] ? a[1].localeCompare(b[1]) : a[0].localeCompare(b[0])));
  return pairs.map(([k, v]) => `${k}=${v}`).join("&");
}

export function canonicalRequest(opts: {
  method: string;
  url: string;
  headers: HeadersMap;
  payloadHash: string;
}): { canonical: string; signedHeaders: string } {
  const u = new URL(opts.url);
  const canonicalUri = canonicalUriFromPath(u.pathname || "/");
  const canonicalQuery = canonicalQueryString(u.searchParams);
  const normalized = Object.entries(opts.headers).map(([k, v]) => [k.toLowerCase().trim(), String(v).trim().replace(/\s+/g, " ") ] as const);
  normalized.sort((a, b) => a[0].localeCompare(b[0]));
  const canonicalHeaders = normalized.map(([k, v]) => `${k}:${v}\n`).join("");
  const signedHeaders = normalized.map(([k]) => k).join(";");
  const canonical = [
    opts.method.toUpperCase(),
    canonicalUri,
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    opts.payloadHash,
  ].join("\n");
  return { canonical, signedHeaders };
}

export function stringToSign(opts: {
  algorithm: string;
  timestamp: string;
  scope: string;
  canonical: string;
}): string {
  return [opts.algorithm, opts.timestamp, opts.scope, hashPayload(opts.canonical)].join("\n");
}

export type SignRequestInput = {
  method: string;
  url: string;
  headers: HeadersMap;
  payloadHash: string;
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  service: string;
  timestamp: string; // x-amz-date
  datestamp: string; // YYYYMMDD
};

export function authorizationHeader(input: SignRequestInput): string {
  const { canonical, signedHeaders } = canonicalRequest(input);
  const scope = `${input.datestamp}/${input.region}/${input.service}/aws4_request`;
  const sts = stringToSign({
    algorithm: "AWS4-HMAC-SHA256",
    timestamp: input.timestamp,
    scope,
    canonical,
  });
  const key = signingKey(input.secretAccessKey, input.datestamp, input.region, input.service);
  const signature = hmacHex(key, sts);
  return `AWS4-HMAC-SHA256 Credential=${input.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
}

// Convenience: build signed headers for a request. Adds x-amz-date, x-amz-content-sha256, host if missing.
export function signRequest(input: {
  method: string;
  url: string;
  headers?: HeadersMap;
  body?: string | Uint8Array;
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  service?: string;
  now?: Date;
}): { headers: Record<string, string> } {
  const now = input.now ?? new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const datestamp = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}`;
  const timestamp = `${datestamp}T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`;
  const payloadHash = hashPayload(input.body ?? "");
  const u = new URL(input.url);
  const headers: HeadersMap = { ...(input.headers ?? {}) };
  if (!headers.host && !headers.Host) headers.host = u.host;
  headers["x-amz-date"] = timestamp;
  headers["x-amz-content-sha256"] = payloadHash;
  const service = input.service ?? "s3";
  const authorization = authorizationHeader({
    method: input.method,
    url: input.url,
    headers,
    payloadHash,
    accessKeyId: input.accessKeyId,
    secretAccessKey: input.secretAccessKey,
    region: input.region,
    service,
    timestamp,
    datestamp,
  });
  headers["authorization"] = authorization;
  return { headers };
}
