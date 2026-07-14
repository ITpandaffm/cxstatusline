import test from "node:test";
import assert from "node:assert/strict";
import { parseInstallArgs } from "./install-cli.js";

test("parses read-only plan and doctor commands", () => {
  assert.deepEqual(parseInstallArgs(["plan", "--json"]), {
    command: "plan",
    json: true,
    yes: false,
    uninstallPlan: false
  });
  assert.deepEqual(parseInstallArgs(["doctor"]), {
    command: "doctor",
    json: false,
    yes: false,
    uninstallPlan: false
  });
});

test("parses approved install options", () => {
  assert.deepEqual(
    parseInstallArgs([
      "install",
      "--yes",
      "--profile",
      "/Users/test/.zshrc",
      "--shell",
      "zsh"
    ]),
    {
      command: "install",
      json: false,
      yes: true,
      uninstallPlan: false,
      profilePath: "/Users/test/.zshrc",
      shell: "zsh"
    }
  );
});

test("parses an uninstall plan", () => {
  assert.deepEqual(parseInstallArgs(["plan", "--uninstall"]), {
    command: "plan",
    json: false,
    yes: false,
    uninstallPlan: true
  });
});

test("rejects unknown commands and flags", () => {
  assert.throws(() => parseInstallArgs(["unknown"]), /unknown command: unknown/);
  assert.throws(() => parseInstallArgs(["doctor", "--force"]), /unknown option: --force/);
});
