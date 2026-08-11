# Plan 310: Pin Production Dockerfile Base Images by Digest

> **Executor instructions:** Make every external Dockerfile base and Dockerfile
> frontend reachable from production Compose immutable by reviewed
> multi-architecture digest. Do not change application dependencies or image
> versions in this plan.
>
> **Drift check (run first):**
> `git diff --stat cdef1c5533..HEAD -- docker-compose.web.prod.yml docker-compose/compose.web.prod.web.yml docker-compose/compose.web.prod.sidecars.yml docker-compose/compose.web.prod.ops.yml apps/web/Dockerfile apps/tanstack-web/Dockerfile apps/backend/Dockerfile apps/chat-realtime/Dockerfile apps/hive-realtime/Dockerfile apps/hive/Dockerfile apps/meet-realtime/Dockerfile apps/supermemory/Dockerfile apps/discord/Dockerfile.markitdown apps/storage-unzip-proxy/Dockerfile apps/web/docker/blue-green-watcher.Dockerfile apps/web/docker/docker-control.Dockerfile apps/web/docker/cron-runner.Dockerfile scripts/lib/production-dockerfile-bases.js scripts/ci/production-dockerfile-bases.test.js scripts/check-docker-web.js scripts/ci/release-workflows.test.js apps/docs/build/devops/github-actions-runbook.mdx tmp/agent-coordination`

## Status

- **Execution status:** BLOCKED — sequence after Plan 307 and obtain native-CI/Forms path transfers
- **Priority:** P0
- **Effort:** M
- **Risk:** MEDIUM
- **Category:** security / dx
- **Depends on:** Plan 307; native CI/cache and Forms Docker/release-test transfer
- **Planned at:** commit `cdef1c5533`, 2026-08-12

## Why this matters

Production Compose builds application images from mutable tag-only `FROM`
references, and nine reachable Dockerfiles also request the mutable external
frontend `# syntax=docker/dockerfile:1.7`. Rebuilding the same commit can
therefore consume different upstream bytes even after bases are pinned,
weakening rollback reproducibility and leaving a supply-chain path into
production workloads.

## Current state and exact contract

- Production builds include Web, TanStack Web, Backend, Chat Realtime,
  Hive/Hive Realtime, Meet Realtime, Supermemory, Discord Markitdown, and
  Storage Unzip Proxy, plus the blue/green watcher, Docker-control proxy, and
  cron runner from `compose.web.prod.ops.yml`. Examples include mutable
  `oven/bun:1.3.14`, `node:24-bookworm-slim`, `rust:1-alpine`, and
  `gcr.io/distroless/static-debian12:nonroot` bases.
- Derive the authoritative Dockerfile set by parsing the `build.context` and
  optional `dockerfile` values from the root production Compose graph; do not
  use a hand-maintained app allowlist. Resolve variable/default expressions
  exactly or fail closed with file/line diagnostics.
- Pin every external stage as `repository:tag@sha256:<64 lowercase hex>` using
  the reviewed top-level multi-architecture manifest-list digest. Retain the
  readable tag and add a review-date comment. Repeated identities use the same
  digest. Local `FROM <stage>` references are exempt; variable-only external
  bases are rejected unless resolved to an exact pinned default.
- Inventory external `# syntax=` directives in the same discovered Dockerfile
  set. Pin each as `docker/dockerfile:1.7@sha256:<reviewed manifest digest>` (or
  the exact registry-qualified equivalent returned by the resolver), retain the
  readable tag, and require one digest for repeated identities. Dockerfiles
  without an external directive may keep using the bundled frontend.
- Add an offline parser/test in `scripts/lib/production-dockerfile-bases.js` and
  root-discovered script test. It rejects mutable base or syntax references,
  digest-only references without readable tags, malformed/variable digests,
  repeated-tag disagreement, unresolved Compose build paths, and production
  Dockerfiles omitted from validation.
- Integrate the focused module minimally into `scripts/check-docker-web.js` and
  keep the already oversized validator from growing materially. Coordinate the
  shared release-workflow test only where it inventories production Docker.
- Document resolve/review/update/rollback. Digest resolution is an explicit
  networked operator step; canonical tests remain offline. Do not restart or
  deploy production.

## Required skills and preflight

Load `$tuturuuu-ci-docs`, `$tuturuuu-development-tooling`,
`$tuturuuu-agent-coordination`, and `$tuturuuu-commit`. Execute after Plan 307
and obtain native-CI plus Forms-owned exact paths. Confirm every production
architecture is present in each selected manifest list.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Inventory | `bun scripts/check-docker-web.js --list-production-dockerfile-bases` | one deduplicated exact tag identity per stdout line for external stages and frontend directives; diagnostics name every reachable reference and none remains unresolved |
| Resolve | `while IFS= read -r ref; do docker buildx imagetools inspect "$ref" | awk -v ref="$ref" '/^Manifests:/ { top=0 } BEGIN { top=1 } top && $1 == "MediaType:" { media=$2 } top && $1 == "Digest:" { digest=$2 } END { if (media !~ /(image.index|manifest.list)/ || digest !~ /^sha256:[0-9a-f]+$/ || length(digest) != 71) exit 1; print ref, digest }'; done < <(bun scripts/check-docker-web.js --list-production-dockerfile-bases)` | every unique tag prints one reviewed top-level multi-architecture manifest-list digest |
| Focused tests | `bun test scripts/ci/production-dockerfile-bases.test.js scripts/ci/release-workflows.test.js` | valid and every negative fixture pass offline |
| Docker gate | `bun scripts/check-docker-web.js` | production Compose/Dockerfile contract passes |
| Script fleet | `bun test:scripts` | root-discovered script tests pass |
| Repository | `bun check && git diff --check` | canonical and whitespace gates pass |

## Scope

**In scope:** production root plus Web/sidecar/ops Compose fragments for build
discovery; every Dockerfile they reach, including all three `apps/web/docker/*`
operational images; their external `FROM` and `# syntax=` references; focused
parser/test; minimal Docker/release validator assertions; existing DevOps
runbook.

**Out of scope:** Plan 307 sidecar `image:` references; development/test
Dockerfiles; base-version upgrades; app code/dependencies; Renovate installation;
production deployment/restart.

## Steps

1. Build the offline Compose-to-Dockerfile inventory and red fixtures.
2. Resolve and review all unique current tags, then pin every external stage
   and external Dockerfile frontend directive.
3. Integrate the parser into canonical Docker/script gates without broadening
   the oversized validator.
4. Document atomic refresh and rollback, then run every mandatory gate.

## Done criteria

- [ ] Every external base reachable from production Compose is tag+digest pinned.
- [ ] Every external Dockerfile frontend directive in that graph is
      tag+digest pinned, or the Dockerfile intentionally uses bundled syntax.
- [ ] Repeated identities cannot drift and local stages remain valid.
- [ ] Adding a mutable or untracked production base fails an offline test.
- [ ] Current platform architectures exist in every reviewed manifest list.
- [ ] All mandatory gates pass.

## STOP conditions

Stop on Plan 307/owner overlap; unresolved Compose variables; a base or
Dockerfile frontend without an official multi-arch manifest; frontend/BuildKit
incompatibility; architecture loss; a required version upgrade; application
dependency changes; or a gate failing twice.

## Maintenance notes

Treat readable tags as intent and digests as identity. Refresh all stages for a
shared tag atomically after provenance and architecture review.
