import test from "node:test";
import assert from "node:assert/strict";
import { adapterAssetName, resolveInstallPaths } from "./paths.js";

test("uses stable Unix paths and the cdx launcher", () => {
  assert.deepEqual(resolveInstallPaths({
    platform: "darwin",
    home: "/Users/test"
  }), {
    root: "/Users/test/.local/share/cxstatusline",
    adapter: "/Users/test/.local/share/cxstatusline/codex-cx",
    renderer: "/Users/test/.local/share/cxstatusline/renderer.mjs",
    manifest: "/Users/test/.local/share/cxstatusline/install.json",
    launcher: "/Users/test/.local/bin/cdx"
  });
});

test("uses a user-local Windows installation", () => {
  assert.deepEqual(resolveInstallPaths({
    platform: "win32",
    home: "C:\\Users\\test",
    localAppData: "C:\\Users\\test\\AppData\\Local"
  }), {
    root: "C:\\Users\\test\\AppData\\Local\\cxstatusline",
    adapter: "C:\\Users\\test\\AppData\\Local\\cxstatusline\\codex-cx.exe",
    renderer: "C:\\Users\\test\\AppData\\Local\\cxstatusline\\renderer.mjs",
    manifest: "C:\\Users\\test\\AppData\\Local\\cxstatusline\\install.json",
    launcher: "C:\\Users\\test\\AppData\\Local\\cxstatusline\\bin\\cdx.exe"
  });
});

test("maps supported platform assets", () => {
  assert.equal(adapterAssetName("darwin", "arm64"), "codex-cx-darwin-arm64");
  assert.equal(adapterAssetName("darwin", "x64"), "codex-cx-darwin-x64");
  assert.equal(adapterAssetName("linux", "arm64"), "codex-cx-linux-arm64");
  assert.equal(adapterAssetName("linux", "x64"), "codex-cx-linux-x64");
  assert.equal(adapterAssetName("win32", "x64"), "codex-cx-windows-x64.exe");
});

test("rejects unsupported platform assets", () => {
  assert.throws(
    () => adapterAssetName("win32", "arm64"),
    /unsupported platform: win32\/arm64/
  );
  assert.throws(
    () => adapterAssetName("freebsd", "x64"),
    /unsupported platform: freebsd\/x64/
  );
});
