import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { buildArtifacts } from "./build-lib.mjs";

const temporary = await mkdtemp(join(tmpdir(), "cxstatusline-generated-"));
try {
  const generatedPlugin = join(temporary, "manage.mjs");
  const generatedRenderer = join(temporary, "renderer.mjs");
  await buildArtifacts({
    pluginOut: generatedPlugin,
    rendererOut: generatedRenderer
  });

  const comparisons = [
    [generatedPlugin, resolve("plugins/cxstatusline/scripts/manage.mjs")],
    [generatedRenderer, resolve("release/cxstatusline-renderer.mjs")]
  ];
  for (const [generated, committed] of comparisons) {
    const [actual, expected] = await Promise.all([
      readFile(generated),
      readFile(committed)
    ]);
    if (!actual.equals(expected)) {
      throw new Error("generated artifact is stale: " + committed);
    }
  }
} finally {
  await rm(temporary, { recursive: true, force: true });
}
