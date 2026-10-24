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
than restoring over newer state. Candidates install from the stable suppliers
cache; bounded retention preserves referenced cache entries and failed recovery.
A dead preparation owner without `admission/mutation.json` is reclaimable by
ordinary admission. For a legacy retained fence, use the operator guide's stale-admission
procedure: stop new submissions, verify dead owner/child/group and unchanged
token, preserve the directory, and never clear a mutation fence or live queue.
