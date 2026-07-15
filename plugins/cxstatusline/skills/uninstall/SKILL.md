---
name: uninstall
description: Safely remove files and managed blocks owned by cxstatusline while preserving official Codex.
---

# Uninstall cxstatusline

1. Explain that the workflow removes only files and marker-delimited blocks recorded as owned by
   cxstatusline. Official `codex`, credentials, sessions, and unrelated config remain untouched.
2. Resolve the plugin root from this skill's location.
3. Run `node <plugin-root>/scripts/manage.mjs plan --uninstall` and show the result.
4. Ask for explicit approval.
5. After approval, run:

   ```bash
   node <plugin-root>/scripts/manage.mjs uninstall --yes
   ```

Stop if ownership cannot be proven. Never delete a launcher, profile block, or config section that
does not match cxstatusline's ownership record.
