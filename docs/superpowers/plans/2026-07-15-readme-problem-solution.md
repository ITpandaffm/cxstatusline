# README Problem-and-Solution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the cxstatusline README immediately explain the single-line Codex footer problem and show the multi-line result with the supplied screenshots.

**Architecture:** Add two stable PNG assets under `docs/images/`, then replace only the README introduction with an English problem/before/solution/after narrative. Leave the existing installation, adapter, security, contributor, and license sections unchanged.

**Tech Stack:** GitHub-flavored Markdown, PNG screenshots, Node.js 20 repository validation

## Global Constraints

- Keep the README in English.
- Store screenshots as `docs/images/codex-built-in-footer.png` and `docs/images/cxstatusline-multiline-footer.png`.
- Stack screenshots vertically so terminal text remains legible.
- Describe limited horizontal space as the cause of truncation; do not claim that opening multiple terminals changes Codex behavior.
- Link `ccstatusline` to `https://github.com/sirmalloc/ccstatusline` without implying affiliation or endorsement.
- Preserve the existing plugin installation, `cdx`, adapter, security, contributor, and license documentation.

---

### Task 1: Add the visual problem-and-solution introduction

**Files:**
- Create: `docs/images/codex-built-in-footer.png`
- Create: `docs/images/cxstatusline-multiline-footer.png`
- Modify: `README.md:1-12`

**Interfaces:**
- Consumes: the two user-supplied PNG screenshots and the existing v0.2 README introduction.
- Produces: stable relative image paths and an English README opening that flows into the unchanged command-separation section.

- [ ] **Step 1: Copy the supplied screenshots into stable repository paths**

```bash
mkdir -p docs/images
cp /var/folders/8z/mrln6ct50297sd3257h5zw1m0000gq/T/codex-clipboard-L4hKzy.png \
  docs/images/codex-built-in-footer.png
cp /var/folders/8z/mrln6ct50297sd3257h5zw1m0000gq/T/codex-clipboard-H8LknC.png \
  docs/images/cxstatusline-multiline-footer.png
```

Expected: both destination files exist and `file docs/images/*.png` identifies them as PNG images.

- [ ] **Step 2: Replace the README opening with the approved problem-and-solution copy**

Replace the title, current one-sentence description, text mockup, and the sentence introducing the two commands with:

```markdown
# cxstatusline

OpenAI Codex CLI's built-in footer is limited to a single line. When terminal width is constrained—for example, when several terminal windows are open side by side—important status information is truncated.

**Before: built-in Codex footer**

![Built-in Codex single-line footer truncated in a narrow terminal](docs/images/codex-built-in-footer.png)

`cxstatusline` adds a safe, configurable multi-line footer so model, reasoning, context, project, Git, and usage information can stay visible.

**After: cxstatusline multi-line footer**

![cxstatusline showing Codex status information across multiple lines](docs/images/cxstatusline-multiline-footer.png)

It brings Codex CLI an experience comparable to [ccstatusline](https://github.com/sirmalloc/ccstatusline) for Claude Code, while using a plugin-managed adapter built specifically for Codex.

The project keeps the official and enhanced commands intentionally separate:
```

Keep the existing `codex` / `cdx` text block and every section after it unchanged.

- [ ] **Step 3: Validate image and Markdown references**

Run:

```bash
file docs/images/codex-built-in-footer.png docs/images/cxstatusline-multiline-footer.png
node -e 'const fs=require("fs"); const s=fs.readFileSync("README.md","utf8"); const refs=[...s.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/g)].map(m=>m[1]).filter(x=>!/^https?:/.test(x)); for(const ref of refs){if(!fs.existsSync(ref)) throw new Error(`missing ${ref}`)} console.log(`checked ${refs.length} local references`)'
git diff --check
```

Expected: both files are PNG images, every local README reference exists, and `git diff --check` prints no errors.

- [ ] **Step 4: Review the scoped diff**

Run:

```bash
git diff -- README.md docs/images
git status --short
```

Expected: the diff changes only the README introduction, adds the two screenshots, and does not alter the existing installation or security content.

- [ ] **Step 5: Run the repository test suite**

Run:

```bash
npm test
```

Expected: TypeScript build, Node test suite, plugin build, generated-file check, plugin validation, and renderer demo all pass.

- [ ] **Step 6: Commit the README and screenshots**

```bash
git add README.md docs/images/codex-built-in-footer.png docs/images/cxstatusline-multiline-footer.png
git commit -m "docs: show cxstatusline before and after"
```

Expected: one documentation commit containing the README introduction and both PNG assets.
