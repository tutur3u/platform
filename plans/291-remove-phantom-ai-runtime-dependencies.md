# Plan 291: Remove Phantom Runtime Dependencies from the Public AI Package

> **Executor instructions:** Remove only dependencies that have no AI-package
> runtime/config consumer, after proving every repository consumer declares its
> own direct edge. Use Bun for all manifest changes and preserve explicit
> config-driven Chat adapter exceptions.
>
> **Drift check (run first):**
> `git diff --stat cdef1c5533..HEAD -- packages/ai/package.json packages/ai/src ':(glob)apps/*/package.json' ':(glob)packages/*/package.json' scripts/ci/package-runtime-dependency-usage.test.js scripts/ci/npm-package-artifact-smoke.json scripts/ci/npm-package-artifact-smoke.test.js bun.lock tmp/agent-coordination`

## Status

- **Execution status:** BLOCKED — Mail owns `bun.lock`; Plan 236 owns the packed-
  artifact smoke surface; active Zalo/AI Studio lanes require source-inventory review
- **Priority:** P1
- **Effort:** M
- **Risk:** MEDIUM
- **Category:** dependencies / package hygiene / release integrity
- **Depends on:** Plan 236; Mail lockfile transfer and AI source-owner review
- **Planned at:** commit `cdef1c5533`, 2026-08-11

## Why this matters

Public `@tuturuuu/ai` wildcard-exports raw source yet declares 79 unconditional
runtime dependencies. Thirty-five declarations have no literal package-source
consumer, including 25 provider SDKs, so even narrow consumers install a large
phantom SDK/runtime surface. That increases install size, lock churn, update and
vulnerability noise, while workspace hoisting can hide undeclared dependencies
in the apps that actually use them.

## Current state and exact contract

- `packages/ai/package.json` is public, ships `src`, and exports `./*`. Its only
  package scripts are `test` and `type-check`; do not invent a package build.
- A non-test `packages/ai/src/**` literal scan at the planned SHA finds no
  reference to exactly these 35 dependencies:
  `@ai-sdk/amazon-bedrock`, `@ai-sdk/anthropic`, `@ai-sdk/azure`,
  `@ai-sdk/cerebras`, `@ai-sdk/cohere`, `@ai-sdk/deepgram`,
  `@ai-sdk/deepinfra`, `@ai-sdk/deepseek`, `@ai-sdk/elevenlabs`, `@ai-sdk/fal`,
  `@ai-sdk/fireworks`, `@ai-sdk/gateway`, `@ai-sdk/gladia`, `@ai-sdk/groq`,
  `@ai-sdk/hume`, `@ai-sdk/lmnt`, `@ai-sdk/luma`, `@ai-sdk/mistral`,
  `@ai-sdk/openai`, `@ai-sdk/openai-compatible`, `@ai-sdk/perplexity`,
  `@ai-sdk/replicate`, `@ai-sdk/revai`, `@ai-sdk/togetherai`, `@ai-sdk/xai`,
  `@octokit/rest`, `@streamdown/cjk`, `@streamdown/code`, `@streamdown/math`,
  `@streamdown/mermaid`, `@tuturuuu/google`, `@vercel/sandbox`, `bash-tool`,
  `react-dom`, and `streamdown`.
- `@ai-sdk/google-vertex` is genuinely imported by
  `packages/ai/src/object/year-plan/route.ts` and is not in the removal set.
  Chat adapter/state packages are registry/config-driven and must remain unless
  their exact loader metadata is separately retired. Do not infer that a string
  provider ID in `supported-providers.ts` loads an SDK.
- `packages/ai/src/react.ts` publicly re-exports `@ai-sdk/react`. Keep that SDK
  as a runtime dependency, but move the host `react` runtime from unconditional
  `dependencies` to `peerDependencies` with the current compatible range and a
  matching development dependency for package tests/typechecking. Remove
  `react-dom` with the 35 candidates because AI source neither imports nor
  re-exports it. The usage test treats an exact public re-export's documented
  host peer as a separate checked peer requirement, not as a config-loader or
  unused-runtime exception.
- Before removal, search all `apps/**` and `packages/**` source/config for each
  candidate. If a different workspace imports one, confirm that workspace's
  package manifest directly declares it; add the dependency there with Bun if
  missing. A transitive/hoisted declaration is not sufficient. STOP rather than
  moving a dependency when the owning workspace is ambiguous or actively owned.
- Add `scripts/ci/package-runtime-dependency-usage.test.js`, discovered by the
  completed Plan 004 runner. It parses the AI manifest, recursively inventories
  non-test source imports/exports/dynamic-import literals, and fails for an
  unconditional AI dependency with no source use or documented config-loader
  exception. Keep a narrow checked exception map whose entry names the loader
  file/registry symbol and rationale; do not allow a package-wide wildcard.
- After Plan 236 lands, add a representative public AI subpath to its exact
  installed-tarball matrix. The smoke must install only the prepared artifact's
  declared dependency graph and import that subpath without repository links.

## Required skills and preflight

Load `$tuturuuu-development-tooling`, `$tuturuuu-ci-docs`,
`$tuturuuu-agent-coordination`, and `$tuturuuu-commit`. Obtain `bun.lock`
transfer from the Mail handoff and exact overlap transfer from Plan 236. Ask the
active Zalo and AI Studio lanes to review the inventory for dynamic/configured
loads; do not modify their source paths. Read root and nearest package AGENTS.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Usage contract | `node --test scripts/ci/package-runtime-dependency-usage.test.js` | every remaining AI runtime dependency is imported or has one checked loader exception |
| Manifest contract | `node -e "const p=require('./packages/ai/package.json');const removed=new Set(['@ai-sdk/amazon-bedrock','@ai-sdk/anthropic','@ai-sdk/azure','@ai-sdk/cerebras','@ai-sdk/cohere','@ai-sdk/deepgram','@ai-sdk/deepinfra','@ai-sdk/deepseek','@ai-sdk/elevenlabs','@ai-sdk/fal','@ai-sdk/fireworks','@ai-sdk/gateway','@ai-sdk/gladia','@ai-sdk/groq','@ai-sdk/hume','@ai-sdk/lmnt','@ai-sdk/luma','@ai-sdk/mistral','@ai-sdk/openai','@ai-sdk/openai-compatible','@ai-sdk/perplexity','@ai-sdk/replicate','@ai-sdk/revai','@ai-sdk/togetherai','@ai-sdk/xai','@octokit/rest','@streamdown/cjk','@streamdown/code','@streamdown/math','@streamdown/mermaid','@tuturuuu/google','@vercel/sandbox','bash-tool','react-dom','streamdown']);if([...removed].some(x=>p.dependencies?.[x]||p.optionalDependencies?.[x]||p.peerDependencies?.[x])||p.dependencies?.react||!p.peerDependencies?.react||!p.devDependencies?.react)process.exit(1)"` | all 35 candidates are absent and React is a peer plus development runtime, not unconditional dependency |
| React boundary | `(cd packages/ai && bun remove react && bun add --dev 'react@^19.2.8' && bun pm pkg set 'peerDependencies.react=^19.2.8') && bun install --lockfile-only` | Bun retains React in devDependencies and the peer contract, removes its unconditional runtime edge, and updates only the expected lockfile entries |
| AI package | `bun run --cwd packages/ai type-check && bun run --cwd packages/ai test` | typecheck and package tests pass |
| Script discovery | `node scripts/run-script-tests.js --list | rg '^scripts/ci/package-runtime-dependency-usage\.test\.js$' && bun run test:scripts` | the invariant is discovered and all script tests pass |
| Packed artifact | `node scripts/ci/npm-package-artifact-smoke.js --prepare-and-smoke packages/ai` | the clean installed AI tarball imports its configured public subpath |
| Repository | `bun check && git diff --check` | repository and whitespace gates pass |
| Scope | `git status --short` | only approved manifests, lockfile, test, and Plan 236 smoke paths changed |

## Scope

**In scope:** `packages/ai/package.json`; `bun.lock`; the new root script test;
actual consumer package manifests only when the preflight proves a missing
direct edge; Plan 236's checked smoke matrix/test only for the AI subpath.

**Out of scope:** changing AI/provider/chat behavior; deleting source or
adapters; replacing provider-selection architecture; package/version/Release
Please changes; publishing; changing unrelated dependency versions; modifying
Zalo/AI Studio owned source; treating peers/dev dependencies as automatically
unused.

## Steps

1. Capture a machine-readable inventory of all 79 AI runtime declarations and
   literal/config-driven package consumers. Reconcile the exact 35 candidates
   above against current source and active-owner review. STOP on any newly found
   AI-package runtime/config consumer; remove that dependency from the candidate
   set only after recording the exact source seam.
2. For candidate imports outside `packages/ai`, map each file to its nearest
   owning `package.json`. Use Bun in that workspace to add a missing direct edge
   before removing the hoisted AI edge. Inspect every manifest/lockfile diff and
   reject unrelated resolution churn.
3. Add the red usage-contract test. Include normal static import/export and
   literal dynamic import forms, test/source exclusions, one fixture for an
   unused dependency, and explicit Chat registry exceptions tied to real loader
   symbols. Prove an arbitrary exception or stale loader path fails.
4. Use `bun remove` from `packages/ai` for the confirmed candidate set; never
   hand-edit dependency fields. Run the exact React boundary command above to
   move `react` to the host peer boundary while retaining it for package
   verification; `bun pm pkg set` is the established deterministic way to keep
   the same runtime in both peer and development categories.
   Verify the exact manifest removal/category changes and bounded lockfile diff,
   then run AI typecheck/tests and every touched consumer's typecheck.
5. Add the AI public subpath to Plan 236's installed-artifact smoke and run the
   focused/script/artifact/repository/whitespace/scope gates.

## Test plan

- The new script test covers an imported dependency, unused dependency,
  type-only/test-only occurrence, literal dynamic import, valid config-loader
  exception, stale exception path, and unbounded exception rejection.
- Run the AI package suite plus typechecks for each consumer manifest changed in
  Step 2. Record those exact commands in the coordination note.
- Reuse Plan 236's temporary clean consumer; do not create a second installer or
  allow workspace fallback.

## Done criteria

- [ ] All 35 confirmed phantom dependencies are absent from the AI runtime manifest.
- [ ] Every remaining runtime declaration has executable source use or one exact checked config-loader exception.
- [ ] React is a declared peer and development runtime for the public React re-export; React DOM is not an AI dependency.
- [ ] Every external source consumer directly declares its own dependency; no hoisting reliance remains.
- [ ] A clean installed AI tarball imports the configured public subpath.
- [ ] AI, touched-consumer, script-discovery, packed-artifact, repository, whitespace, and scope gates pass.

## STOP conditions

Stop on a dynamic/config-driven use of any candidate; an active owner denying
source/manifest review; incomplete Plan 236 or Mail lockfile transfer; Bun
producing unrelated dependency churn; registry/network requirements beyond the
existing credential-free smoke; a public subpath that needs a removed package;
an ambiguous owning workspace; or any mandatory gate failing twice.

## Maintenance notes

Wildcard raw-source exports make every executable import a public runtime edge.
Keep the exception map small and tied to real loader code; a list of package
names without executable loader evidence would merely institutionalize the
phantom surface.
