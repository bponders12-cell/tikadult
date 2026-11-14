import { mkdir, readFile, rm, stat, writeFile } from "fs/promises";
import path from "path";
import { signRequest } from "./s3-signing";

export type PutOptions = { contentType?: string };

/** Minimal blob-storage contract used by the media pipeline. */
export interface StorageAdapter {
  put(key: string, data: Uint8Array, opts?: PutOptions): Promise<void>;
  /** Returns null when the key does not exist. */
  get(key: string): Promise<Buffer | null>;
  exists(key: string): Promise<boolean>;
  /** Idempotent: deleting a missing key is not an error. */
  delete(key: string): Promise<void>;
}

function assertSafeKey(key: string): void {
  const segments = key.split("/");
  if (
    !key ||
    key.includes("\\") ||
    key.includes("\0") ||
    key.startsWith("/") ||
    segments.some((s) => s === ".." || s === "." || s === "")
  ) {
    throw new Error(`Invalid storage key: ${JSON.stringify(key)}`);
  }
}

/** Dev-default adapter storing files under a git-ignored root (`.storage/`). */
export class LocalStorageAdapter implements StorageAdapter {
  private readonly root: string;

  constructor(root: string = path.resolve(process.cwd(), ".storage")) {
    this.root = path.resolve(root);
  }

  private resolve(key: string): string {
    assertSafeKey(key);
    const full = path.resolve(this.root, ...key.split("/"));
    if (!full.startsWith(this.root + path.sep)) {
      throw new Error(`Invalid storage key: ${JSON.stringify(key)}`);
    }
    return full;
  }

  // contentType is meaningless on a local filesystem.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async put(key: string, data: Uint8Array, _opts?: PutOptions): Promise<void> {
    const file = this.resolve(key);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, data);
  }

  async get(key: string): Promise<Buffer | null> {
    try {
      return await readFile(this.resolve(key));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw e;
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      return (await stat(this.resolve(key))).isFile();
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return false;
      throw e;
    }
  }

  async delete(key: string): Promise<void> {
    await rm(this.resolve(key), { force: true });
  }
}

export type S3Config = {
  endpoint: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
};

type Env = Record<string, string | undefined>;

/**
 * Reads S3-compatible config from env. Returns null when no S3 vars are set
 * (local adapter is used); throws if only partially configured.
 */
export function s3ConfigFromEnv(env: Env = process.env): S3Config | null {
  const names = ["S3_ENDPOINT", "S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"] as const;
  if (!names.some((n) => env[n])) return null;
  for (const n of names) {
    if (!env[n]) throw new Error(`Missing ${n} (S3 storage is partially configured)`);
  }
  return {
    endpoint: env.S3_ENDPOINT!,
    bucket: env.S3_BUCKET!,
    accessKeyId: env.S3_ACCESS_KEY_ID!,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY!,
    region: env.S3_REGION || "auto",
  };
}

/**
 * S3-compatible adapter over fetch with SigV4 signing (path-style addressing).
 */
export class S3StorageAdapter implements StorageAdapter {
  constructor(readonly config: S3Config) {}

  private objectUrl(key: string): string {
    assertSafeKey(key);
    const base = this.config.endpoint.replace(/\/+$/, "");
    const bucket = encodeURIComponent(this.config.bucket);
    const keyPath = key.split("/").map((s) => encodeURIComponent(s)).join("/");
    return `${base}/${bucket}/${keyPath}`;
  }

  private async signedFetch(method: string, key: string, body?: Uint8Array, contentType?: string): Promise<Response> {
    const url = this.objectUrl(key);
    const headers: Record<string, string> = {};
    if (contentType) headers["content-type"] = contentType;
    const signed = signRequest({
      method,
      url,
      headers,
      body,
      accessKeyId: this.config.accessKeyId,
      secretAccessKey: this.config.secretAccessKey,
      region: this.config.region || "auto",
      service: "s3",
    });
    return fetch(url, { method, headers: signed.headers, body: body as BodyInit | undefined });
  }

  async put(key: string, data: Uint8Array, opts?: PutOptions): Promise<void> {
    const res = await this.signedFetch("PUT", key, data, opts?.contentType);
    if (!res.ok) {
      throw new Error(`S3 put failed (${res.status}) for ${key}`);
    }
  }

  async get(key: string): Promise<Buffer | null> {
    const res = await this.signedFetch("GET", key);
    if (res.status === 404) return null;
    if (!res.ok) {
      throw new Error(`S3 get failed (${res.status}) for ${key}`);
    }
    const ab = await res.arrayBuffer();
    return Buffer.from(ab);
  }

  async exists(key: string): Promise<boolean> {
    const res = await this.signedFetch("HEAD", key);
    if (res.status === 200) return true;
    if (res.status === 404) return false;
    throw new Error(`S3 head failed (${res.status}) for ${key}`);
  }

  async delete(key: string): Promise<void> {
    const res = await this.signedFetch("DELETE", key);
    if (res.status === 404 || res.ok) return;
    throw new Error(`S3 delete failed (${res.status}) for ${key}`);
  }
}

/**
 * Picks the S3 adapter when env-configured, otherwise the local dev adapter.
 * In production the local fallback is refused: hosted filesystems are usually
 * ephemeral, so silently writing uploads to disk would lose creators' media on
 * the next deploy/restart. Failing loudly at first use beats silent data loss.
 */
export function getStorage(env: Env = process.env): StorageAdapter {
  const s3 = s3ConfigFromEnv(env);
  if (s3) return new S3StorageAdapter(s3);
  if (env.NODE_ENV === "production") {
    throw new Error(
      "Media storage is not configured for production: set S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY (local disk storage is dev-only).",
    );
  }
  return new LocalStorageAdapter(env.LOCAL_STORAGE_DIR || undefined);
}
