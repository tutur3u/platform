# SDK supplier channels and rollback

Use `bun sdk:rollout` only for an authorized supplier change. Source publication
never authorizes activation. Keep the existing home, queue and global Bun install.

- Use `--channel dev` for main-built prereleases or `--channel latest` for stable.
- Build private premerge tarballs with `bun sdk:dev-pack` on an admitted build host;
  do not build on a workstation under a resource hold. Supply `--tarball <path-or-url> --sha256 <hash>`.
  Keep branch previews out of npm and public Actions artifacts.
- Repeat `--host <ssh-alias>` for sequential hosts. Busy queues refuse unless a
  bounded `--wait-drain <seconds>` is given. Never kill jobs or create another queue.
- Retain the JSON report, backup and generated rollback command. Setup preview
  and apply preserve roots and limits. Qualification checks the global supplier,
  launchers and a small command in every root. Failure restores the previous
  supplier. Reconcile unknown restore outcomes before retrying.

Automatic targets require `tuturuuuBuild.rolloutProtocol: 1`; older 0.28.0
targets refuse before install. Python 3 is required on every rollout target and is checked before installation.
Project probes verify accessibility and package metadata, not full test suites.

The [SDK operator guide](../../../../../apps/docs/reference/packages/sdk.mdx#dev-channel-and-private-previews)
owns commands, publisher/environment setup, recovery, promotion and threat model.
`ttr --version` is the bare version machine contract. Resource status JSON
reports channel and source SHA. Older
stable suppliers may have an unknown source; do not infer runtime activation
from source tests or a merged PR.

Later rollback refuses changed global packages, roots, limits or launchers rather
than restoring over newer state; the automatic post-failure restore refuses
when the global package tree changed after install. `cleanup: "failed"` is housekeeping only and never calls for rollback;
`admissionHeld: true` marks a slot/lease ownership problem that keeps admission closed. Candidates install from the stable suppliers
cache; bounded retention preserves referenced cache entries and failed recovery.
A dead preparation owner without `admission/mutation.json` is reclaimable by
ordinary admission. For a legacy retained fence, use the operator guide's stale-admission
procedure: stop new submissions, verify dead owner/child/group and unchanged
token, preserve the directory, and never clear a mutation fence or live queue.

Integrity regressions live in `scripts/sdk-rollout-descriptor.test.js` and
`scripts/sdk-rollout-race.test.js`. The filesystem-injected race tests can run
against historical source with `SDK_ROLLOUT_TEST_REF=<git-ref>`; confirm actual
swap/assertion failures rather than loader errors. Directory identity checks
cover enumeration and recursive hashing. Cache manifests deliberately follow
symlinks and classify/read one descriptor. Run FIFO controls in children with
an explicit kill deadline so a blocking-open defect cannot hang the test runner.

## Balancer controller lock protocol

Drain every controller sharing a ledger before upgrading from PID-directory
locking to SQLite transaction locking. Keep `ledger/mutation-lock.sqlite` in
place while any controller runs; unlinking it would create a second lock inode.
The [fleet balancer runbook](../../../../../apps/docs/build/development-tools/fleet-balancer.mdx#controller-ledger-locking)
owns runtime requirements, legacy-lock recovery and regression coverage.
