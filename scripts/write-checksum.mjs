import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { basename } from "node:path";

const input = process.argv[2];
const output = process.argv[3] ?? (input ? input + ".sha256" : undefined);
if (!input || !output) {
  throw new Error("usage: node scripts/write-checksum.mjs <file> [output]");
}

const checksum = createHash("sha256").update(await readFile(input)).digest("hex");
await writeFile(output, checksum + "  " + basename(input) + "\n", "utf8");
