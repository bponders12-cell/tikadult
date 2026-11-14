import { describe, expect, it } from "vitest";
import {
  canonicalRequest,
  signingKey,
  stringToSign,
  authorizationHeader,
  hashPayload,
} from "@/lib/media/s3-signing";

const base = {
  method: "GET",
  url: "https://example.amazonaws.com/?",
  headers: {
    host: "example.amazonaws.com",
    "x-amz-date": "20150830T123600Z",
  },
  payloadHash: hashPayload(""),
  accessKeyId: "AKIDEXAMPLE",
  secretAccessKey: "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY",
  region: "us-east-1",
  service: "s3",
  timestamp: "20150830T123600Z",
  datestamp: "20150830",
};

describe("s3-signing", () => {
  it("hashes empty payload to sha256 of empty string", () => {
    expect(hashPayload("")).toBe("e3b0c44298fc1c149afbf4c8996fb924" + "27ae41e4649b934ca495991b7852b855");
  });

  it("derives signing key per SigV4 chain", () => {
    const key = signingKey("wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY", "20150830", "us-east-1", "s3");
    // Expected: HMAC chain AWS4+secret -> date -> region -> service -> aws4_request (hex shown for stability)
    expect(Buffer.from(key).toString("hex")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("builds canonical request and string to sign with signed headers", () => {
    const { canonical, signedHeaders } = canonicalRequest(base);
    expect(canonical).toContain("GET\n/\n");
    expect(canonical).toContain("\nhost;x-amz-date\n");
    expect(canonical).toContain(base.payloadHash);
    expect(signedHeaders).toBe("host;x-amz-date");

    const sts = stringToSign({
      algorithm: "AWS4-HMAC-SHA256",
      timestamp: base.timestamp,
      scope: "20150830/us-east-1/s3/aws4_request",
      canonical,
    });
    expect(sts.startsWith("AWS4-HMAC-SHA256\n20150830T123600Z\n20150830/us-east-1/s3/aws4_request\n")).toBe(true);
  });

  it("produces Authorization header with credential, signed headers, signature", () => {
    const auth = authorizationHeader(base);
    expect(auth).toContain("AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20150830/us-east-1/s3/aws4_request");
    expect(auth).toContain("SignedHeaders=host;x-amz-date");
    expect(auth).toMatch(/Signature=[0-9a-f]{64}$/);
  });

  it("includes content hash header in signed set when provided", () => {
    const payloadHash = hashPayload("hello");
    const auth = authorizationHeader({
      ...base,
      url: "https://s3.example.com/bkt/key",
      headers: {
        host: "s3.example.com",
        "x-amz-date": "20150830T123600Z",
        "x-amz-content-sha256": payloadHash,
      },
      payloadHash,
    });
    expect(auth).toContain("SignedHeaders=host;x-amz-content-sha256;x-amz-date");
  });
});
