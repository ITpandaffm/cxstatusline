import { posix, win32 } from "node:path";

export interface InstallPathInput {
  platform: string;
  home: string;
  localAppData?: string;
}

export interface InstallPaths {
  root: string;
  adapter: string;
  renderer: string;
  manifest: string;
  launcher: string;
}

export function resolveInstallPaths(input: InstallPathInput): InstallPaths {
  if (input.platform === "win32") {
    const base = input.localAppData ?? win32.join(input.home, "AppData", "Local");
    const root = win32.join(base, "cxstatusline");
    return {
      root,
      adapter: win32.join(root, "codex-cx.exe"),
      renderer: win32.join(root, "renderer.mjs"),
      manifest: win32.join(root, "install.json"),
      launcher: win32.join(root, "bin", "cdx.exe")
    };
  }

  const root = posix.join(input.home, ".local", "share", "cxstatusline");
  return {
    root,
    adapter: posix.join(root, "codex-cx"),
    renderer: posix.join(root, "renderer.mjs"),
    manifest: posix.join(root, "install.json"),
    launcher: posix.join(input.home, ".local", "bin", "cdx")
  };
}

export function adapterAssetName(platform: string, arch: string): string {
  const key = platform + "/" + arch;
  const assets: Record<string, string> = {
    "darwin/arm64": "codex-cx-darwin-arm64",
    "darwin/x64": "codex-cx-darwin-x64",
    "linux/arm64": "codex-cx-linux-arm64",
    "linux/x64": "codex-cx-linux-x64",
    "win32/x64": "codex-cx-windows-x64.exe"
  };
  const asset = assets[key];
  if (!asset) throw new Error("unsupported platform: " + key);
  return asset;
}
