# HighlightsGrabber

Project tier: T4
Conventions version: 1.0

## Purpose

Firefox extension. It scrapes the user's Kindle highlights from `read.amazon.com/notebook` and saves them as a JSON file. The JSON file is meant for upload to DrClawLights (`README.md`).

## Stack

- Plain JavaScript, Firefox WebExtension Manifest V2 (`manifest.json`). No build step, no bundler.
- Min Firefox 140 desktop and 142 Android (`manifest.json`).
- Dev tools only: `linkedom` (DOM for tests), `@resvg/resvg-js` (icon export), `web-ext` 10 (lint and build, run through `npx`) (`package.json`).
- Tests: Node built-in test runner (`node --test`).
- Distribution: unsigned temporary add-on or a self-signed unlisted `.xpi` (`README.md`).

## Commands

- Install: `npm install` (dev tools only, `README.md`)
- Run: none found. Load `manifest.json` at `about:debugging#/runtime/this-firefox` (`README.md`)
- Test (all): `npm test` (`node --test tests/*.test.js`)
- Test (one): `node --test tests/parse.test.js` (`unverified`, standard Node flag use)
- Lint: `npm run lint` (`npx --yes web-ext@10 lint`)
- Type check: none found
- Build: `npm run build` (`npx --yes web-ext@10 build --overwrite-dest`)
- Icons: `npm run icons` (`scripts/export-icons.mjs`)

Commands come from `package.json` and `README.md`. Not run. `Test (one)` is `unverified`.

## Key paths

- Planning docs: none found
- Design spec: `docs/BRANDING.md` (brand rules), `README.md` (behavior and privacy)
- Source: `background.js` (sync control and storage), `content.js` (scrape on the notebook page), `parse.js` (pure DOM helpers), `popup.html`, `popup.js`, `popup.css`, `manifest.json`
- Tests: `tests/parse.test.js`, fixture `tests/fixtures/annotations.html`
- Brand assets: `assets/brand/` (SVG masters, PNG exports)

## Environment variables

None found. No `.env.example`. No `process.env` use in `scripts/` or the extension code.

## Gotchas

- `parse.js` holds the Amazon page selectors (`parse.js:5`). If Amazon changes the notebook page, the sync breaks. Update the selectors and the fixture together.
- `parse.js` is loaded by `manifest.json` content scripts and by `tests/parse.test.js`. It ends with a `module.exports` guard (`parse.js:114`), so keep it loadable in Node.
- `npm run build` packs every file not in `webExt.ignoreFiles` (`package.json:18-19`). That list names `AGENTS.md` and `CLAUDE.md`, so both stay out of the package.
- The saved data uses the storage key `kindleHighlights` (`background.js:1`).

## Do not

- Do not edit the PNG icons by hand. Edit `assets/brand/icon.svg` and run `npm run icons` (`docs/BRANDING.md`).
- Do not use Amazon or Kindle logos or colors, or "Kindle" in the product name (`docs/BRANDING.md`).
- Do not send highlight data off the device. The extension has no server and declares `data_collection_permissions: none` (`manifest.json`, `README.md`).
- Do not add permissions beyond those in `README.md` without updating its Permissions table.
- Do not commit `node_modules/` or `web-ext-artifacts/` (`.gitignore`).
- Do not edit `package-lock.json` by hand.

## Existing notes

The previous `AGENTS.md` held a copy of a global rules file. Kept unchanged, with headings moved down two levels.

### Agent Rules

User has diagnosed ADHD. Optimize every reply for scannability, brevity and single-threaded focus.

#### Output (chat, commits, code comments, docs)

01. Write in ASD-STE100. Plain, warm peer tone. Exception: profanity allowed for emphasis when context fits.
02. Multi-turn tasks: line 1 is `Step X/Y: <summary>`, then a blank line, then the body.
03. Next line: the answer, command, file path or diff. Rationale below it.
04. Unprompted explanations: max ~150 words. Elaborate only when asked.
05. Lists: max 5 items; group longer lists by priority. Number ordered steps sequentially (1., 2., 3.), never repeated 1.
06. One issue at a time. End actionable replies with one next step (file or command). No time estimates.
07. State required context inline. Never ask the user to remember anything across turns.
08. No "I" narration of process. State results and changes in concrete terms.
09. No apologies, sycophancy or preamble. On error: fix, then state what changed.
10. No code snippets except out-of-task diffs for approval.
11. Emoji only as status markers (✅ ❌ ⚠️). Max one per line. Never in prose, headings or code.
12. No em dashes. No Oxford commas.

#### Process

1. Verify before asserting: source read, grep or authoritative docs. Never use general knowledge for specifics (APIs, headers, pricing).
2. Cite sources (`path/file.go:42` or URL). Label uncited claims "unverified assumption" and state how to verify.
3. State confidence (high/medium/low) on diagnoses and fixes.
4. Ambiguous request: verify first. If still ambiguous, ask one question before any edit.
5. Challenge the user's reasoning when evidence disagrees.
6. A question is not an edit instruction. Answer it.
7. Run independent tool calls in parallel.
8. After 3 failed fix attempts: stop edits, name the unverified assumption, ask one diagnostic question.

#### Edits

1. In-task edits: proceed without approval. Report changes after.
2. Out-of-task edits: propose a diff in chat. Edit only after explicit approval. Diff >40 lines: give a 1-line summary first; user chooses view or proceed.
3. Every error found, in any file, gets a root-cause fix: apply in-task fixes, propose out-of-task fixes. Never label or defer.
4. Prefer removing components over adding. Use the fewest moving parts that satisfy the requirement.
5. Search the codebase for an existing implementation before adding a new pattern.
6. New pattern replaces old: migrate all call sites and delete the old implementation in the same change.
7. Delete unused code after confirming zero references (incl. dynamic imports, config, external consumers).
8. One-time scripts: run from /tmp, delete after, never commit.
9. Mock data only in tests.

#### Testing (TDD)

1. Stub first. Prove failure on an assertion, not a compile error. Write minimum code to pass.
2. Unit test every public function and error branch. Integration test every feature slice.
3. Assert behavior, not implementation. Delete assertions that survive an inverted requirement.

#### Tooling

- Use Makefile targets over direct calls when present (e.g. `make test`).
- Grep for exact search, `rg` for regex. Mermaid for complex system diagrams.
- Instruction files (SKILL.md, **/prompts/**, AGENTS.md, CLAUDE.md): format only with `mdformat --number`.

#### Subagents

- Default to the cheapest adequate model. Follow `.agents/skills/shared/SUBAGENT-STEERABILITY.md` if present.
- Verify subagent completion. Retry incomplete work with a higher turn limit. Report turn-limit exhaustion with ⚠️.
- Ask before engineering work (edits, design, debugging) on a downgraded model. Mechanical, read-only, git and docs work: no prompt.

You are cherished.

## Global conventions (synced copy, edit the global file instead)

#### Communication

- Lead with the bottom line or most important point.
- Be concise, direct, and avoid conversational filler like 'Sure, I can help with that'
- Verify facts against current sources
- Clarify ambiguity and do not assume the user is always right: Ask critical questions with the AskUserQuestion tool when input is unclear before proceeding.

#### ADHD-Friendly Formatting

- Reduce noise, emphasize what matters
- Build scannable sections with clear hierarchy
- Keep paragraphs short and lists tight
- Highlight next actions

#### Style Rules

- No em dashes (use commas, periods, or parentheses)
- No Oxford commas
- Maintain consistent headers, bold cues, and compact bullets
- Avoid "This isn't X, it's Y" constructions
