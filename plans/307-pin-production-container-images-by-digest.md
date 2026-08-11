# Plan 307: Pin Privileged and Production Container Images by Digest

> **Executor instructions:** Make the production BuildKit and sidecar image
> bytes immutable for a given repository commit. Retain readable tag comments,
> but every executed external image reference must include a reviewed manifest
> list digest.
>
> **Drift check (run first):**
> `git diff --stat cdef1c5533..HEAD -- docker-compose/compose.web.prod.buildkit.yml docker-compose/compose.web.prod.edge.yml docker-compose/compose.web.prod.log-drain.yml docker-compose/compose.web.prod.redis.yml docker-compose/compose.web.prod.sidecars.yml .github/workflows/docker-setup-check.yaml scripts/check-docker-web.js scripts/lib/production-container-images.js scripts/ci/production-container-images.test.js scripts/ci/release-workflows.test.js apps/docs/build/devops/github-actions-runbook.mdx tmp/agent-coordination`

## Status

- **Execution status:** BLOCKED — native CI/cache and Forms release-test owners hold overlapping exact paths
- **Priority:** P0
- **Effort:** M
- **Risk:** MEDIUM
- **Category:** security / dx
- **Depends on:** Plan 298 sequencing; native CI/cache exact-path transfer; Forms release-test transfer
- **Planned at:** commit `cdef1c5533`, 2026-08-12

## Why this matters

The production stack runs a privileged BuildKit daemon and stateful edge/data
sidecars from mutable tags. The CI setup explicitly pulls the same mutable
builder. An identical Git SHA can therefore build or run different upstream
bytes, and tag retargeting reaches a privileged production-adjacent boundary.

## Current state and exact contract

- `compose.web.prod.buildkit.yml:17-19` runs
  `moby/buildkit:buildx-stable-1` with `privileged: true`; the setup workflow
  pulls and configures that tag at lines 99-117.
- Production fragments also use mutable `postgres:16-alpine`,
  `ollama/ollama:latest`, `pgvector/pgvector:pg16`, `redis:7-alpine`,
  `hiett/serverless-redis-http:latest`, `nginx:1.31.0-alpine`, and
  `cloudflare/cloudflared:latest`. Repeated services using the same image must
  use the same digest.
- Resolve and review the current multi-architecture manifest-list digest for
  each of those eight exact tag identities. Write references as
  `repository:tag@sha256:<64 lowercase hex>` so operators retain the tag intent.
  Add a nearby comment recording the upstream tag and review date; never use a
  single-platform child digest.
- The workflow `docker pull` and Buildx `driver-opts` must use the exact same
  BuildKit tag+digest as Compose. Update existing assertions that currently
  require the mutable tag.
- Add focused `scripts/lib/production-container-images.js`, imported minimally
  by the existing oversized Docker validator. It enumerates the five production
  fragments plus the workflow reference and rejects external image values that
  lack `@sha256:` or have malformed digests, variables in the digest, digest
  disagreement for one tag, or a workflow/Compose BuildKit mismatch. Local
  `build:` services are not external image violations.
- Add a root-discovered script test with valid, mutable-tag, malformed-digest,
  mismatched-repeat, and workflow-driver fixtures. It must not contact a
  registry. Registry resolution is an explicit operator update step, not part
  of `bun check`.
- Document the review/update/rollback workflow: resolve a tag's manifest list,
  review release provenance, replace every occurrence atomically, run the
  offline validator, then let CI pull the pinned digest. Rollback restores the
  previous reviewed digest; never retag locally or use `latest` as rollback.
- This plan governs only the listed production BuildKit/sidecar references.
  Application Dockerfile base-image governance is a separate fleet decision;
  do not imply it is covered.

## Required skills and preflight

Load `$tuturuuu-ci-docs`, `$tuturuuu-development-tooling`,
`$tuturuuu-agent-coordination`, and `$tuturuuu-commit`. Obtain the native CI and
`scripts/ci/release-workflows.test.js` transfers, then execute after or rebase
over Plan 298's workflow pinning. Resolve digests only from official registries
with the existing Docker/Buildx tooling; record no registry credentials or
tokens.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Resolve reviewed manifests | `for ref in moby/buildkit:buildx-stable-1 postgres:16-alpine ollama/ollama:latest pgvector/pgvector:pg16 redis:7-alpine hiett/serverless-redis-http:latest nginx:1.31.0-alpine cloudflare/cloudflared:latest; do docker buildx imagetools inspect "$ref" | awk -v ref="$ref" '/^Manifests:/ { top=0 } BEGIN { top=1 } top && $1 == "MediaType:" { media=$2 } top && $1 == "Digest:" { digest=$2 } END { if (media !~ /(image.index|manifest.list)/ || digest !~ /^sha256:[0-9a-f]+$/ || length(digest) != 71) exit 1; print ref, digest }'; done` | eight official top-level multi-architecture manifest-list digests print and are reviewed |
| Inventory | `rg -n '^\s*image:|docker pull|driver-opts:.*image=' docker-compose/compose.web.prod.{buildkit,edge,log-drain,redis,sidecars}.yml .github/workflows/docker-setup-check.yaml` | every executed external reference is tag+digest pinned |
| Focused tests | `bun test scripts/ci/production-container-images.test.js scripts/ci/release-workflows.test.js` | valid/malformed/mismatch fixtures and workflow contract pass |
| Docker validator | `bun scripts/check-docker-web.js` | production Docker configuration passes |
| Workflow policy | `bun test scripts/ci/check-workflow-config.test.js` | workflow policy suite passes |
| Script fleet | `bun test:scripts` | root-discovered script suite passes |
| Repository | `bun check && git diff --check` | canonical and whitespace gates pass |

## Scope

**In scope:** five production Compose fragments; Docker setup workflow; focused
image validator/module/tests; narrow existing validator/test assertions; one
DevOps runbook update.

**Out of scope:** application Dockerfile base images; development Compose;
deploying or restarting production; registry credentials; changing service
versions beyond resolving the reviewed current tags; installing a new update
bot.

## Steps

1. Add the offline parser/test fixtures and make all current mutable references
   fail with exact file/line diagnostics.
2. Resolve and review the eight current tag manifest lists, then pin all eleven
   Compose occurrences and both workflow BuildKit references consistently.
3. Import the focused validator into the existing Docker check and update only
   assertions that intentionally froze the old mutable BuildKit value.
4. Document reviewed digest refresh and rollback without exposing credentials.
5. Run focused tests, Docker/workflow/script fleets, `bun check`, whitespace,
   and exact-scope gates.

## Done criteria

- [ ] Every listed production external image has a reviewed tag+manifest-list digest.
- [ ] Compose and workflow BuildKit identities are byte-identical.
- [ ] Repeated tag identities cannot drift to different digests.
- [ ] Mutable or malformed production references fail an offline canonical test.
- [ ] Update and rollback instructions preserve immutable reviewed bytes.
- [ ] All mandatory gates pass.

## STOP conditions

Stop on active native-CI ownership; a tag without an official multi-arch
manifest; architecture support that differs from the currently deployed host
set; a required service-version upgrade; registry identity ambiguity; a need to
touch application Dockerfiles or production runtime state; or a mandatory gate
failing twice.

## Maintenance notes

Tags remain human-readable intent, not identity. Review and update the digest
as one atomic fleet change whenever an upstream image is intentionally bumped.
