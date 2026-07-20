# AI Workflow Note

## Tools used

- **Claude (Anthropic), operating as an agentic coding assistant** with direct file read/write and shell access — used for essentially the entire build: scaffolding, writing every source file, running installs/builds/tests, and debugging environment failures. This note describes that session honestly, including the parts that didn't go smoothly, because I think the friction is more informative than a sanitized summary.

## Where AI materially sped up the work

- **End-to-end scaffolding and boilerplate.** The Next.js API routes, the Zod schemas, the CSS, and the TipTap toolbar wiring were all generated in first-draft form by the agent in minutes rather than the hour-plus it'd take to hand-write and cross-reference TipTap's API. I reviewed and adjusted rather than typed from scratch.
- **Parallel reasoning about tradeoffs.** When the Prisma install broke (see below), the agent proposed the `node:sqlite` alternative, explained the tradeoff, and rewrote the entire data layer against it in one pass — rather than me having to research Node's built-in SQLite API surface myself under time pressure.
- **Test writing.** The `node:test` suite (access control, validation schemas, markdown import) was drafted by the agent alongside the code it tests, which meant coverage existed from the start rather than being bolted on at the end.

## Where the AI hit real friction — and how it was handled

This is the part I want to be specific about, since "practical AI usage" cuts both ways: knowing when to trust the agent's output and when to intervene.

1. **The build environment itself was unreliable for large installs.** `npm install` kept getting interrupted mid-extraction (each shell command in that particular sandbox had a hard ~44-second ceiling), which corrupted a couple of large binary dependencies — most notably Next.js's native SWC compiler binary, which ended up truncated (8.8MB instead of the correct ~131MB). The symptom was brutal to diagnose: `next dev`/`next build` would print one line of output and exit cleanly with code 0, no error, no stack trace. The agent didn't just retry blindly — it methodically ruled out causes (memory limits, network proxy issues, worker-thread/fork support) by writing small isolated repro scripts, eventually forking the failing process manually to observe it die with `SIGBUS`, then used `file` on the binary to notice the ELF header pointed past the end of the actual file — i.e., corruption, not a real incompatibility. That's the specific evidence I'd want to see before accepting "it's an environment problem" as an answer, and it's what convinced me the fix (re-downloading just that one file with a resumable `curl`, rather than re-running the flaky installer) was correct rather than a guess.
2. **Prisma's native engine binary download was blocked** in the sandbox network policy (a third-party CDN outside the npm registry). Rather than let this stall the whole build, the agent flagged it, proposed dropping Prisma for Node's built-in `node:sqlite`, and I accepted that tradeoff explicitly — it's called out in `ARCHITECTURE.md` rather than buried.
3. **A TipTap option (`immediatelyRender`) that doesn't exist in the pinned TipTap version.** Caught by running `tsc --noEmit`, not by trusting the generated code — the agent's first draft used an option from a newer TipTap release than what was actually installed. This is a good example of why "run the type checker" is a workflow step, not an optional extra, when an AI is writing against library versions it can't fully verify from memory.

## What AI-generated output I changed or rejected

- Rejected the first attempt at getting a working install via repeated blind `npm install` retries once it became clear the corruption was structural, not transient — insisted on root-causing the SIGBUS crash instead of continuing to guess.
- Rejected Prisma as the persistence layer once its install dependency was confirmed blocked, in favor of a zero-dependency approach, even though it meant hand-writing SQL instead of using an ORM.
- Adjusted the `tsconfig.json` module resolution and fixed relative-import extensions by hand after `tsc --noEmit` surfaced them, rather than accepting "close enough" TypeScript config.

## How correctness, UX, and reliability were verified

- **Type checking:** `tsc --noEmit` run to a clean pass (zero errors) across the whole `src/` and `test/` tree.
- **Automated tests:** 14 `node:test` cases covering access control (owner/shared/denied paths), Zod validation edge cases (blank titles, malformed emails, empty updates), and the markdown/text importer (headings, bold, italic, lists, HTML-escaping of malicious input) — all passing.
- **End-to-end smoke testing against a running server**, not just unit tests: started the dev server and drove the actual HTTP API with `curl` through a full realistic scenario — login as three different seeded users, create a document, edit it, share it, confirm the recipient sees it under "Shared with Me," confirm a third (non-shared) user gets a 404 (not a 403, to avoid leaking document existence) when trying to access it directly, upload a `.md` file and confirm the conversion output, and confirm unauthenticated requests are rejected with 401. All of that was run and its actual output inspected — not assumed to work because the code "looked right."
- **A real production build** (`next build`) was run to completion and confirmed to compile, type-check, and generate all 11 routes successfully, and `next start` was verified to serve traffic — this is what the deployment platform runs, so verifying it locally first (rather than only ever running `next dev`) was deliberate.
