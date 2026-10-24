# SDK supplier channels and rollback

Use `bun sdk:rollout` only for an authorized supplier change. Source publication
never authorizes activation. Keep the existing home, queue and global Bun install.

- Use `--channel dev` for main-built prereleases or `--channel latest` for stable.
- Build private premerge tarballs with `bun sdk:dev-pack` on admitted Thanh,
  never on the M4 during its hold. Supply `--tarball <path-or-url> --sha256 <hash>`.
  Keep branch previews out of npm and public Actions artifacts.
- Repeat `--host <ssh-alias>` for sequential hosts. Busy queues refuse unless a
  bounded `--wait-drain <seconds>` is given. Never kill jobs or create another queue.
- Retain the JSON report, backup and generated rollback command. Setup preview
  and apply preserve roots and limits. Qualification checks the global supplier,
  launchers and a small command in every root. Failure restores the previous
  supplier. Reconcile unknown restore outcomes before retrying.

Automatic targets require `tuturuuuBuild.rolloutProtocol: 1`; older 0.28.0
targets refuse before install. Python 3 is required for manual recovery locking.
Project probes verify accessibility and package metadata, not full test suites.

The [SDK operator guide](../../../../../apps/docs/reference/packages/sdk.mdx#dev-channel-and-private-previews)
owns commands, publisher/environment setup, recovery, promotion and threat model.
`ttr --version` and resource status JSON report channel and source SHA. Older
stable suppliers may have an unknown source; do not infer runtime activation
from source tests or a merged PR.
