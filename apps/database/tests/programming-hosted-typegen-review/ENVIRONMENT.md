# Hosted CLI environment boundary (source proposal only)

This proposal remains inert. The original source `077b8a9a` is frozen. Its only
approved run failed before staging; lifecycle and effective kernel/firewall
preflight were not reached, and successful cleanup was a no-state early return.
The retired workflow is not re-registered here. No further run is authorized.

The pinned CLI 2.117.0 source at
[`21db8559`](https://github.com/supabase/cli/tree/21db855916f2c2b12f61cde923a27094b8528b23)
establishes the relevant inputs:

- [Consent](https://github.com/supabase/cli/blob/21db855916f2c2b12f61cde923a27094b8528b23/apps/cli/src/shared/telemetry/consent.ts)
  defaults to granted without persisted consent; either
  `SUPABASE_TELEMETRY_DISABLED=1` or `DO_NOT_TRACK=1` denies it.
- [CLI settings](https://github.com/supabase/cli/blob/21db855916f2c2b12f61cde923a27094b8528b23/apps/cli/src/shared/config/cli-settings.layer.ts)
  consume ambient token, API, debug and telemetry variables.
  [Legacy settings](https://github.com/supabase/cli/blob/21db855916f2c2b12f61cde923a27094b8528b23/apps/cli/src/config/legacy-cli-settings.layer.ts)
  also resolve profile, project and workdir from the environment.
- [Global home](https://github.com/supabase/cli/blob/21db855916f2c2b12f61cde923a27094b8528b23/apps/cli/src/shared/config/supabase-home.ts)
  honors `SUPABASE_HOME`, otherwise `HOME/.supabase`.
  [Credentials](https://github.com/supabase/cli/blob/21db855916f2c2b12f61cde923a27094b8528b23/apps/cli/src/shared/auth/credentials.layer.ts)
  use keyring then an `access-token` file; `SUPABASE_NO_KEYRING=1` bypasses keyring.
- [Modern project discovery](https://github.com/supabase/cli/blob/21db855916f2c2b12f61cde923a27094b8528b23/apps/cli/src/shared/config/cli-project-home.layer.ts)
  walks ancestors for `.supabase/project.json`; the
  [legacy resolver](https://github.com/supabase/cli/blob/21db855916f2c2b12f61cde923a27094b8528b23/apps/cli/src/config/legacy-project-ref.layer.ts)
  can read `supabase/.temp/project-ref`.

Every proposal CLI probe and lifecycle/cleanup helper receives a constructed,
frozen allowlist. Both telemetry flags and no-keyring are forced to `1`.
HOME, SUPABASE_HOME, XDG and Docker configuration point into private directories
under the owned runner-local proof root. Ambient environment objects are never
spread or queried for credentials. Token/profile/project/API/proxy/debug/loader
and Docker context variables are absent. OAuth values are fixed synthetic
strings; the image registry remains the reviewed `ghcr.io` value. The native CLI
path and original temporary root remain available to preserve isolated-helper
identity and cleanup contracts. PATH is fixed to standard system directories.

Probes run in an empty private directory with an explicit owned workdir. Helpers
retain repository cwd for identity validation; their CLI workdir is the already
validated disposable root. Admission checks existing profile/token state and
linked/dotenv markers by filesystem metadata only, without reading contents.
The modern ancestor walk is checked too. Symlinked private directories or
configuration directories fail closed. Only environments created by the
allowlist builder can reach captured probes. Subprocess output stays bounded and
in memory; errors emit fixed phase/outcome labels.

These checks do not implement a blanket host-network firewall. Host CLI/image
retrieval still has network capability; telemetry is disabled explicitly and
ambient authentication/project selection is excluded. Existing fail-closed
Docker cgroup/BPF/bridge policy remains the protection for container SQL egress
and is unchanged. Its effective runtime behavior, full migrations, SQL suite,
typegen and actual cleanup still require separately authorized hosted proof.
Synthetic tests exercise environment construction, subprocess forwarding,
marker rejection and process ownership; they do not prove upstream CLI behavior
or kernel policy enforcement in a live runner.
