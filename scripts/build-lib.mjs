import { build } from "esbuild";

const common = {
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  sourcemap: false,
  legalComments: "none",
  charset: "utf8",
  logLevel: "silent"
};

export async function buildArtifacts({ pluginOut, rendererOut }) {
  await Promise.all([
    build({
      ...common,
      entryPoints: ["src/install-cli.ts"],
      outfile: pluginOut
    }),
    build({
      ...common,
      entryPoints: ["src/cli.ts"],
      outfile: rendererOut
    })
  ]);
}
