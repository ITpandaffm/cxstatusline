import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

function requireValue(condition, message) {
  if (!condition) throw new Error(message);
}

async function readJson(path) {
  return JSON.parse(await readFile(resolve(path), "utf8"));
}

const manifest = await readJson("plugins/cxstatusline/.codex-plugin/plugin.json");
requireValue(manifest.name === "cxstatusline", "plugin name must be cxstatusline");
requireValue(/^\d+\.\d+\.\d+$/.test(manifest.version), "plugin version must be semver");
requireValue(typeof manifest.description === "string" && manifest.description.length > 0, "description is required");
requireValue(manifest.author?.name === "ITpandaffm", "author.name is required");
requireValue(manifest.skills === "./skills/", "skills path must be ./skills/");
requireValue(!("hooks" in manifest), "plugin must not install lifecycle hooks");
for (const field of ["displayName", "shortDescription", "longDescription", "developerName", "category"]) {
  requireValue(typeof manifest.interface?.[field] === "string", "interface." + field + " is required");
}

const marketplace = await readJson(".agents/plugins/marketplace.json");
requireValue(marketplace.name === "cxstatusline", "marketplace name must be cxstatusline");
const entry = marketplace.plugins?.find((plugin) => plugin.name === "cxstatusline");
requireValue(entry, "cxstatusline marketplace entry is required");
requireValue(entry.source?.source === "local", "marketplace source must be local");
requireValue(entry.source?.path === "./plugins/cxstatusline", "marketplace source path is invalid");
requireValue(entry.policy?.installation === "AVAILABLE", "plugin must be available");
requireValue(entry.policy?.authentication === "ON_INSTALL", "authentication policy is required");
requireValue(typeof entry.category === "string", "marketplace category is required");

for (const skill of ["setup", "doctor", "uninstall"]) {
  const text = await readFile(resolve("plugins/cxstatusline/skills", skill, "SKILL.md"), "utf8");
  requireValue(text.startsWith("---\n"), skill + " skill frontmatter is missing");
  requireValue(text.includes("name: " + skill + "\n"), skill + " skill name is invalid");
  requireValue(text.includes("\ndescription: "), skill + " skill description is missing");
  requireValue(!/\b(?:TODO|TBD)\b/.test(text), skill + " skill contains an incomplete token");
}

await readFile(resolve("plugins/cxstatusline/scripts/manage.mjs"));
process.stdout.write("cxstatusline plugin validation passed\n");
