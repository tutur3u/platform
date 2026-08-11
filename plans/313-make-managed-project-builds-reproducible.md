# Plan 313: Make Managed External-Project Builds Reproducible

> **Executor instructions:** Make the generated external-project Docker build
> template resolve reviewed immutable build inputs. The same external commit
> and configuration must not silently consume a newer Node or package manager.
>
> **Drift check (run first):**
> `git diff --stat cdef1c5533..HEAD -- scripts/watch-blue-green/projects.js scripts/watch-blue-green/managed-project-build.js scripts/watch-blue-green/managed-project-build.test.js scripts/run-script-tests.js apps/docs/build/devops/web-docker-deployment.mdx tmp/agent-coordination`

## Status

- **Execution status:** BLOCKED — obtain Richfield external-project control-plane transfer
- **Priority:** P0
- **Effort:** M
- **Risk:** MEDIUM
- **Category:** security / dx
- **Depends on:** Richfield external-project control-plane transfer
- **Planned at:** commit `cdef1c5533`, 2026-08-12

## Why this matters

The managed-project deployer records an external source commit as deployed, but
its generated Dockerfile uses mutable `node:22-alpine` and installs latest Bun.
Rebuilding that same commit can therefore run different toolchain bytes or
produce a different artifact while deployment metadata still names only the
unchanged source revision.

## Current state and exact contract

- `scripts/watch-blue-green/projects.js:148-165` renders
  `.platform/Dockerfile.nextjs` with `FROM node:22-alpine` and
  `npm install -g bun`; lines 715-744 write it and run Compose `up --build`;
  lines 905-918 then record the external commit as ready/deployed.
- `renderManagedProjectDockerfile` is exported at lines 991-1004, but the
  existing 444-line `scripts/watch-blue-green-projects.test.js` does not import
  or test it. Keep the new pure authority cohesive in
  `scripts/watch-blue-green/managed-project-build.test.js` rather than adding
  another concern to the broad watcher suite.
- Pin the Node base as `node:22-alpine@sha256:<reviewed top-level multi-arch
  digest>` and retain the readable tag plus review date. Confirm every
  production architecture before selecting it.
- Resolve one package manager before rendering. Read repository-root and app
  `package.json`; if both declare `packageManager`, require equality. Accept an
  exact selector only (`name@full-semver`, optional supported integrity) and
  require its matching single lockfile. For legacy projects without a selector,
  allow only `bun.lock`/`bun.lockb` with the platform fallback `bun@1.3.14`, or
  `package-lock.json` with the npm version already contained in the pinned Node
  image. Legacy pnpm/Yarn projects must add an exact selector before deployment.
  Reject unsupported managers, conflicting lockfiles, and manager/lockfile
  mismatch before `docker compose up`.
- Render exact installation/activation only: Bun uses `1.3.14`; pnpm
  and Yarn use the exact Corepack selector; npm uses `npm ci` and the pinned
  image's recorded npm version. Never run an unversioned global install or
  silently choose newest. Preserve frozen-lockfile installs and existing
  app-root build/start commands.
- The cdef snapshot's `scripts/run-script-tests.js` recursively discovers all
  `scripts/**/*.test.js`, so the focused sibling test is canonical without a
  manifest list. Add a repository assertion only if current discovery does not
  list it; do not edit `package.json`, dependency declarations, or `bun.lock`.
- Put the pure manager resolver and Dockerfile renderer in
  `scripts/watch-blue-green/managed-project-build.js`. Keep the existing export
  from `projects.js` as a thin re-export and avoid growing its 1,006-line
  deployment orchestrator.

## Required skills and preflight

Load `$tuturuuu-ci-docs`, `$tuturuuu-development-tooling`,
`$tuturuuu-agent-coordination`, and `$tuturuuu-commit`. The working Richfield
note owns adjacent external-project control-plane behavior; obtain its explicit
transfer. Tests must not build, pull, or deploy an image.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Focused tests | `node --test scripts/watch-blue-green/managed-project-build.test.js` | Bun/pnpm/Yarn/npm, exact selectors, fallback, conflicts, and Dockerfile rendering pass without Docker/network |
| Canonical enrollment | `node scripts/run-script-tests.js --list | rg '^scripts/watch-blue-green/managed-project-build\.test\.js$' && bun run test:scripts` | the managed-project rendering suite is listed once and passes in the root script gate |
| Mutable absence | `rg -n 'FROM node:22-alpine( |$)|npm install -g bun( |$)|corepack (prepare|use) [^@ ]+($| )' scripts/watch-blue-green/projects.js scripts/watch-blue-green/managed-project-build.js` | no match |
| Script syntax | `node --check scripts/watch-blue-green/projects.js && node --check scripts/watch-blue-green/managed-project-build.js && node --check scripts/watch-blue-green/managed-project-build.test.js` | exit 0 |
| Repository | `bun check && git diff --check` | canonical and whitespace gates pass |

## Scope

**In scope:** focused `managed-project-build.js` resolver/renderer; thin
`projects.js` integration/re-export; new focused sibling test; discovery assertion
only if it has drifted; managed external-project build documentation;
  `apps/docs/build/devops/web-docker-deployment.mdx`; `plans/README.md` status
  only.

**Out of scope:** application Dockerfiles (Plan 310); production Compose images
(Plan 307); external project source dependencies; lockfile rewrites; watcher
state-machine redesign; live image pulls/builds/deployments.

## Steps

1. Add the focused pure resolver/rendering suite for each manager, exact selector, equal or
   conflicting root/app declarations, the Bun/npm legacy fallbacks, rejected
   pnpm/Yarn legacy inputs, lockfile conflicts, app roots, and mutable-string
   absence.
2. Add reviewed Node/Bun/Corepack fallback constants and a fail-closed pure
   package-manager resolver in the focused sibling module; pass its result into
   the renderer and preserve the existing `projects.js` export.
3. Render only pinned base and exact manager commands, then fail before Compose
   when project metadata is ambiguous or unsupported.
4. Prove the existing discovery runner enrolls the new focused test, document
   refresh/rollback, and run all gates. If discovery has drifted, fix the
   directory contract rather than appending a literal test filename.

## Done criteria

- [ ] Generated Dockerfiles contain a reviewed tag+digest Node base.
- [ ] No unversioned package-manager install or activation remains.
- [ ] Exact selectors and deterministic legacy fallbacks cover all four managers.
- [ ] Unsupported/conflicting metadata fails before Docker dispatch.
- [ ] Rendering tests are canonical and all mandatory gates pass.

## STOP conditions

Stop on owner overlap; a supported manager outside the four named above; a
project requiring a floating selector; missing production architecture; a
required manifest/dependency/lockfile change; a need to deploy for verification;
substantial changes to the oversized deployment orchestrator instead of the
focused sibling; or a gate failing twice.

## Maintenance notes

The 1,006-line watcher module is already oversized. Keep this change focused on
pure resolver/rendering helpers; if substantial deployment orchestration must
change, first extract that seam behind stable exports rather than growing the
file further.
