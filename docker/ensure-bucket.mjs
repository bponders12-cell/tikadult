import crypto from "crypto";

function env(name, fallback) {
  const v = process.env[name];
  if (v == null || v === "") return fallback;
  return v;
}


function hashPayload(payload) {
  return crypto.createHash("sha256").update(payload).digest("hex");
}
function hmac(key, data) {
  return crypto.createHmac("sha256", key).update(data, "utf8").digest();
}
function hmacHex(key, data) {
  return crypto.createHmac("sha256", key).update(data, "utf8").digest("hex");
}
function signingKey(secret, datestamp, region, service) {
  return hmac(hmac(hmac(hmac(`AWS4${secret}`, datestamp), region), service), "aws4_request");
}
function encodeRfc3986(str) {
  return encodeURIComponent(str).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}
function canonicalUri(pathname) {
  return pathname.split("/").map(encodeRfc3986).join("/");
}
function canonicalQuery(searchParams) {
  const pairs = [];
  searchParams.forEach((value, key) => pairs.push([encodeRfc3986(key), encodeRfc3986(value)]));
  pairs.sort((a, b) => (a[0] === b[0] ? a[1].localeCompare(b[1]) : a[0].localeCompare(b[0])));
  return pairs.map(([k, v]) => `${k}=${v}`).join("&");
}
function sign(method, urlStr, headersIn, body, { accessKeyId, secretAccessKey, region, service = "s3" }) {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const datestamp = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}`;
  const timestamp = `${datestamp}T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`;
  const payloadHash = hashPayload(body ?? "");
  const u = new URL(urlStr);
  const headers = { ...headersIn };
  if (!headers.host && !headers.Host) headers.host = u.host;
  headers["x-amz-date"] = timestamp;
  headers["x-amz-content-sha256"] = payloadHash;
  const normalized = Object.entries(headers).map(([k, v]) => [k.toLowerCase().trim(), String(v).trim().replace(/\s+/g, " ")]);
  normalized.sort((a, b) => a[0].localeCompare(b[0]));
  const canonicalHeaders = normalized.map(([k, v]) => `${k}:${v}\n`).join("");
  const signedHeaders = normalized.map(([k]) => k).join(";");
  const canonical = [method.toUpperCase(), canonicalUri(u.pathname || "/"), canonicalQuery(u.searchParams), canonicalHeaders, signedHeaders, payloadHash].join("\n");
  const scope = `${datestamp}/${region}/${service}/aws4_request`;
  const sts = ["AWS4-HMAC-SHA256", timestamp, scope, hashPayload(canonical)].join("\n");
  const sig = hmacHex(signingKey(secretAccessKey, datestamp, region, service), sts);
  headers["authorization"] = `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${sig}`;
  return headers;
}

async function main() {
  const endpoint = env("S3_ENDPOINT");
  const bucket = env("S3_BUCKET");
  const accessKeyId = env("S3_ACCESS_KEY_ID");
  const secretAccessKey = env("S3_SECRET_ACCESS_KEY");
  const region = env("S3_REGION", "auto") || "auto";

  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) {
    console.log("[ensure-bucket] S3 not fully configured; skipping bucket ensure (local/dev storage expected).");
    return;
  }

  const base = endpoint.replace(/\/+$/, "");
  const bucketUrl = `${base}/${encodeURIComponent(bucket)}`;
  const creds = { accessKeyId, secretAccessKey, region };

  // Check if bucket exists (HEAD)
  let headers = sign("HEAD", bucketUrl, {}, "", creds);
  let res = await fetch(bucketUrl, { method: "HEAD", headers });
  if (res.status === 200) {
    console.log(`[ensure-bucket] Bucket '${bucket}' exists.`);
    return;
  }
  if (res.status !== 404 && res.status !== 403) {
    // Some S3 impls return 403 for non-existent in certain configs; try create regardless on 403? but safer to attempt create.
  }

  // Create bucket (PUT). MinIO accepts empty body; path-style.
  headers = sign("PUT", bucketUrl, {}, "", creds);
  res = await fetch(bucketUrl, { method: "PUT", headers });
  if (res.ok || res.status === 200 || res.status === 204) {
    console.log(`[ensure-bucket] Created bucket '${bucket}'.`);
    return;
  }
  if (res.status === 409) {
    // BucketAlreadyOwnedByYou / conflict
    console.log(`[ensure-bucket] Bucket '${bucket}' already exists.`);
    return;
  }
  const text = await res.text().catch(() => "");
  throw new Error(`Failed to ensure bucket '${bucket}': HTTP ${res.status} ${text}`);
}

main().catch((e) => {
  console.error("[ensure-bucket] ERROR:", e.message || e);
  process.exit(1);
});
