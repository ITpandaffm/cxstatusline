import { createHash, timingSafeEqual } from "node:crypto";

export function parseChecksum(text: string): string {
  const checksum = text.trim().split(/\s+/, 1)[0] ?? "";
  if (!/^[a-fA-F0-9]{64}$/.test(checksum)) {
    throw new Error("invalid SHA-256 checksum");
  }
  return checksum.toLowerCase();
}

export function verifySha256(bytes: Uint8Array, expected: string): void {
  const normalized = parseChecksum(expected);
  const actual = createHash("sha256").update(bytes).digest();
  const wanted = Buffer.from(normalized, "hex");
  if (!timingSafeEqual(actual, wanted)) {
    throw new Error("checksum mismatch");
  }
}
