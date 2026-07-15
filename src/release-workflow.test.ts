import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("checks out upstream Codex without platform line-ending conversion", async () => {
  const workflow = await readFile(".github/workflows/release.yml", "utf8");
  assert.match(workflow, /CARGO_NET_GIT_FETCH_WITH_CLI: "true"/);
  assert.match(
    workflow,
    /git -c core\.autocrlf=false clone --filter=blob:none https:\/\/github\.com\/openai\/codex\.git upstream/
  );
  assert.match(
    workflow,
    /git show "HEAD:patches\/codex-status-line-command\.patch" > "\$RUNNER_TEMP\/codex-status-line-command\.patch"/
  );
  assert.match(
    workflow,
    /git -C upstream apply "\$RUNNER_TEMP\/codex-status-line-command\.patch"/
  );
});
