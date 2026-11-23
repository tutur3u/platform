# Cron Control publication

The [Cloudflare workflow](../../.github/workflows/cron-control-cloudflare.yaml)
qualifies a prebuilt Worker, checks its deployment identity against the parity
fixture, and captures live settings before and after production publication.

## Recover a script API conflict

A successful `before` snapshot can be followed by `cf` rejecting a Worker whose
last update came from the script API. A shared secret write can produce this
state while retaining the serving code. Check the raw upload log and recover
the original publication and secret-write receipts before considering another
write. The settings snapshot verifies configuration and rollback identity. Code
identity requires its own evidence.

For a release with identical Cron Control output, compare the complete file
list and SHA-256 of every file in both qualified Build Output artifacts. Use
the original upload receipt to tie those bytes to the serving version, then
use the secret-write receipt to trace any later version that inherited the code.
Refresh the settings snapshot and check the active version, cron set, Durable
Object binding and full secret-name inventory. If these match the reviewed
preimage, the release owner can record that the existing version satisfies the
Cron Control artifact. Retain the failed job's actual outcome in the evidence.

If the artifacts or provider readback differ, stop and prepare a separate
publisher change for review. The pinned `cf` beta enforces strict conflict
handling for both project deploy and version creation. A fixture edit cannot
change that behavior. A replacement publisher needs evidence that it preserves
operator-installed secrets, the Durable Object namespace and migration history,
and the Worker-level cron and ingress settings. Qualify with disposable bindings
and check the production preimage again before any authorized assignment.

## Recognize an approved version already serving

The release owner can provide `CRON_CONTROL_SERVING_PROOF` as a secret in the
`cron-control-production` environment after a separately authorized
publication. An absent record uses the regular strict publisher. An invalid
or stale record fails the job. Adding and clearing the record are separate
operations in the release approval.

1. Qualify the final main SHA first. Retain the successful Cron Control
   workflow's immutable artifact ID and GitHub SHA-256 digest, and hash its
   complete `index.js` module. Publish that exact artifact under the approved
   provider packet and record the actual deployment and version IDs.
2. Prepare the approval record as a JSON object with `sha`, numeric `runId` and
   `artifactId`, bare hex `artifactDigest` and `moduleSha256`, `accountId`,
   `worker`, `deploymentId`, `versionId`, and `settingsHash` from the
   target-stage settings snapshot. Include `ledgerNamespaceId`,
   `migrationTag` (use null when the provider reports no tag), and
   `secretNamesSha256`, the SHA-256 of the complete secret-name array sorted
   and encoded as compact JSON without a trailing newline. The workflow also
   checks for the relay binding. Obtain these from readback and keep secret
   names and values out of the record. Store the canonical single-line
   base64 encoding of its UTF-8 JSON in the masked environment secret.
3. Confirm the production deploy job registers with the deployment
   coordinator: `DEPLOY_COORDINATOR_MODE` must be `observe` or `enforce` and
   `DEPLOY_COORDINATOR_ORIGIN` must be set. With the coordinator off the job
   holds no lease and the proof fails closed with "registered no lease"; a
   fenced lease fails with "the coordinator fenced this job". Neither
   falls back to the strict publisher.
4. Start the approved production planner for that exact SHA. The workflow
   renews its exact coordinator lease, checks public artifact and run
   metadata, and compares the qualified module with the exact deployed
   version's code bytes. After uploading the settings evidence, it renews
   the lease again and refreshes settings, latest version and active traffic
   before recording the marker.
   Retain the attempt and clear the secret under the approved release packet
   before advancing the production pin.

The approval's `runId` must name a `push` run of the Cron Control workflow on
`main` whose head commit is the production SHA, and `artifactId` must be that
run's `cron-control-worker-<sha>` artifact. The workflow starts only when a
commit changes a path in its `paths` filter, such as this directory,
`packages/realtime`, the Cron parity files, `bun.lock` or `package.json`. A
production SHA that changed none of them has no producer run and cannot carry
an approval, so pin a commit that changes one. When that run's `index.js` is
byte-identical to the serving module, issue the approval for the new SHA with
the unchanged deployment and version IDs; no publication is needed.

The approval binds one SHA. If the release moves the pin past a commit that
had a producer run, the new pin needs its own producer run and a fresh
approval; an earlier run in the range does not carry forward. When no Cron
path changed between the current production SHA and the new pin, the
planner's affected gate skips the Cron deploy and no approval is consumed.

GitHub artifact and run metadata are public reads. Cloudflare reads use the
Cron workflow's existing token for settings and version metadata, including
module content.
