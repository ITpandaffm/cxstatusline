---
name: setup
description: Install or update cxstatusline and create the short cdx command without replacing official Codex.
---

# Set up cxstatusline

Use this workflow when the user asks to install, configure, or update cxstatusline.

1. Explain that `codex` remains the official command and `cdx` runs the patched adapter.
2. Resolve the plugin root from this skill's location. The manager will live at
   `<plugin-root>/scripts/manage.mjs`.
3. Run the read-only plan command:

   ```bash
   node <plugin-root>/scripts/manage.mjs plan
   ```

4. Show the planned download, install, Codex config, launcher, and optional shell-profile changes.
5. Check whether `~/.local/bin` (or the Windows launcher directory from the plan) is already on
   `PATH`. If it is not, identify the active shell and propose exactly one owned profile block:
   - Zsh: `~/.zshrc` with `--shell zsh`
   - Bash on macOS: `~/.bash_profile` with `--shell bash`
   - Bash elsewhere: `~/.bashrc` with `--shell bash`
   - Fish: `~/.config/fish/config.fish` with `--shell fish`
   - PowerShell: the user's `$PROFILE` path with `--shell powershell`
6. Ask for approval before any network request or filesystem or profile mutation.
7. After approval, run one of:

   ```bash
   node <plugin-root>/scripts/manage.mjs install --yes
   node <plugin-root>/scripts/manage.mjs install --yes --profile <approved-profile> --shell <shell>
   ```

   Use the second form only when the approved PATH block is needed.
8. Run the doctor workflow and report whether a new shell session is required.

Do not use a lifecycle hook for installation. Do not overwrite an unrelated `cdx` command or an
unmanaged `[tui.status_line_command]` section. Never read or copy Codex credentials.
