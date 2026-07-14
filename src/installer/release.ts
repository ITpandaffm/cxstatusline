import { adapterAssetName } from "./paths.js";
import { parseChecksum, verifySha256 } from "./checksum.js";

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export interface VerifiedAsset {
  name: string;
  bytes: Uint8Array;
  checksum: string;
}

export interface VerifiedRelease {
  tag: string;
  adapter: VerifiedAsset;
  renderer: VerifiedAsset;
}

export interface FetchReleaseOptions {
  fetch: FetchLike;
  platform: string;
  arch: string;
  repository?: string;
}

interface GitHubAsset {
  name: string;
  browser_download_url: string;
}

interface GitHubRelease {
  tag_name: string;
  assets: GitHubAsset[];
}

async function requireResponse(response: Response, label: string): Promise<Response> {
  if (!response.ok) throw new Error(label + " failed (" + response.status + ")");
  return response;
}

export async function fetchReleaseAssets(options: FetchReleaseOptions): Promise<VerifiedRelease> {
  const repository = options.repository ?? "ITpandaffm/cxstatusline";
  const apiUrl = "https://api.github.com/repos/" + repository + "/releases/latest";
  const apiResponse = await options.fetch(apiUrl, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "cxstatusline-installer"
    }
  });
  await requireResponse(apiResponse, "GitHub release request");
  const release = await apiResponse.json() as GitHubRelease;
  if (typeof release.tag_name !== "string" || !Array.isArray(release.assets)) {
    throw new Error("invalid GitHub release response");
  }

  const byName = new Map(release.assets.map((asset) => [asset.name, asset]));
  const download = async (name: string): Promise<VerifiedAsset> => {
    const binaryAsset = byName.get(name);
    const checksumAsset = byName.get(name + ".sha256");
    if (!binaryAsset) throw new Error("missing release asset: " + name);
    if (!checksumAsset) throw new Error("missing release asset: " + name + ".sha256");

    const [binaryResponse, checksumResponse] = await Promise.all([
      options.fetch(binaryAsset.browser_download_url, {
        headers: { "User-Agent": "cxstatusline-installer" }
      }),
      options.fetch(checksumAsset.browser_download_url, {
        headers: { "User-Agent": "cxstatusline-installer" }
      })
    ]);
    await requireResponse(binaryResponse, "asset download " + name);
    await requireResponse(checksumResponse, "checksum download " + name);
    const bytes = new Uint8Array(await binaryResponse.arrayBuffer());
    const checksum = parseChecksum(await checksumResponse.text());
    verifySha256(bytes, checksum);
    return { name, bytes, checksum };
  };

  const adapterName = adapterAssetName(options.platform, options.arch);
  const [adapter, renderer] = await Promise.all([
    download(adapterName),
    download("cxstatusline-renderer.mjs")
  ]);
  return { tag: release.tag_name, adapter, renderer };
}
