import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("checks out upstream Codex without platform line-ending conversion", async () => {
  const workflow = await readFile(".github/workflows/release.yml", "utf8");
  assert.match(
    workflow,
    /git -c core\.autocrlf=false clone --filter=blob:none https:\/\/github\.com\/openai\/codex\.git upstream/
  );
});
