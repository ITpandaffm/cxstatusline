import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { buildArtifacts } from "./build-lib.mjs";

const pluginOut = resolve("plugins/cxstatusline/scripts/manage.mjs");
const rendererOut = resolve("release/cxstatusline-renderer.mjs");
await Promise.all([
  mkdir(dirname(pluginOut), { recursive: true }),
  mkdir(dirname(rendererOut), { recursive: true })
]);
await buildArtifacts({ pluginOut, rendererOut });
