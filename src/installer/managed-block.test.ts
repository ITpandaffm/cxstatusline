import test from "node:test";
import assert from "node:assert/strict";
import { removeManagedBlock, upsertManagedBlock } from "./managed-block.js";

const start = "# BEGIN cxstatusline";
const end = "# END cxstatusline";

test("appends a managed block while preserving existing text", () => {
  assert.equal(
    upsertManagedBlock("model = \"gpt\"\n", start, end, "owned = true"),
    "model = \"gpt\"\n\n# BEGIN cxstatusline\nowned = true\n# END cxstatusline\n"
  );
});

test("replaces exactly one complete managed block", () => {
  const existing = "before\n# BEGIN cxstatusline\nold\n# END cxstatusline\nafter\n";
  assert.equal(
    upsertManagedBlock(existing, start, end, "new"),
    "before\n# BEGIN cxstatusline\nnew\n# END cxstatusline\nafter\n"
  );
});

test("removes only the owned block", () => {
  const existing = "before\n\n# BEGIN cxstatusline\nowned\n# END cxstatusline\n\nafter\n";
  assert.equal(removeManagedBlock(existing, start, end), "before\n\nafter\n");
});

test("rejects partial or duplicate ownership markers", () => {
  assert.throws(
    () => upsertManagedBlock("before\n# BEGIN cxstatusline\n", start, end, "new"),
    /incomplete managed block/
  );
  assert.throws(
    () => upsertManagedBlock(
      "# BEGIN cxstatusline\na\n# END cxstatusline\n# BEGIN cxstatusline\nb\n# END cxstatusline\n",
      start,
      end,
      "new"
    ),
    /multiple managed blocks/
  );
});
