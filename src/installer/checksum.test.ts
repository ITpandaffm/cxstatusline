import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { parseChecksum, verifySha256 } from "./checksum.js";

test("accepts a matching SHA-256 sidecar", () => {
  const bytes = Buffer.from("verified");
  const checksum = createHash("sha256").update(bytes).digest("hex");

  assert.equal(parseChecksum(checksum + "  asset\n"), checksum);
  assert.doesNotThrow(() => verifySha256(bytes, checksum));
});

test("normalizes uppercase SHA-256 text", () => {
  const checksum = "A".repeat(64);
  assert.equal(parseChecksum(checksum + "\n"), checksum.toLowerCase());
});

test("rejects malformed SHA-256 text", () => {
  assert.throws(() => parseChecksum("not-a-checksum"), /invalid SHA-256/);
  assert.throws(() => parseChecksum("a".repeat(63) + "\n"), /invalid SHA-256/);
});

test("rejects a checksum mismatch", () => {
  assert.throws(
    () => verifySha256(Buffer.from("bad"), "0".repeat(64)),
    /checksum mismatch/
  );
});
