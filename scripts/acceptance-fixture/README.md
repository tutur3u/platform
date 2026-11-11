# Synthetic isolation fixture

This directory is tooling, outside every app import graph. It has no Next
entrypoint, target URL, acceptance switch, credential configuration or shipping
handler instrumentation. Never execute `fixture.py` directly: only the launcher
establishes its isolation boundary. Nothing here admits Next traffic.

Run the build-free unit suite with
`PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s scripts/acceptance-fixture -v`.
The canary launcher requires Linux, bubblewrap, enabled unprivileged user/PID/net
namespaces and a system Python under `/usr`. Missing capability returns STOP/2.
Do not install capabilities, switch hosts or weaken isolation to make a test pass.
The resource broker remains required for admitted heavy execution.

An independent reviewer supplies a JSON manifest mapping `fixture.py` and
`launcher.py` to their SHA256 values. The invocation is
`python3 scripts/acceptance-fixture/launcher.py MANIFEST STAGE_MS TOTAL_MS`.
Unit-only stage/total bounds are 5000/10000 milliseconds; these are unrelated to
the unadmitted Next traffic proposal. No manifest is generated as an admission
receipt. Digest comparison proves byte equality only, not reviewer approval.

The namespace has no network interfaces connected to the host. External IPv4,
IPv6 and forked-child documentation-address probes must fail with a kernel
unreachable error; timeouts and connection refusal fail the canary. DNS config,
home and inherited environment are absent. CPU, address space, file output,
descriptor and core limits apply before bubblewrap starts. Wall deadlines use
monotonic time and the minimum of stage and total deadlines. Only the owned
process group is killed. PID namespace and die-with-parent are intended to
confine orphan cleanup, but crash/restart behavior requires Linux runtime proof.
Logs expose a fixed schema and digests; child output and exceptions are suppressed.

## Acceptance limits

This is a partial launcher implementation, not an accepted Next adapter. Unit
tests do not establish kernel capability. Serving-artifact/process/executable
binding, sealed immutable mounts against concurrent writes, per-request hard
deadlines, synthetic HTTP backend routing, cancellation/crash teardown tests,
DNS/proxy/redirect canaries and independent trace/nonshipping fence review remain
required. `/usr` is a host runtime mount rather than a sealed runtime image.
Do not use the byte manifest as executable/runtime attestation. The semantics
oracle exercises a separate toy protocol with explicit effects and cookie scopes;
it supplies no Next cookie expectation. Missing effects always fail.

R2 remains an external immutable input at SHA256
`a73096ff89151e9d3449516c6ef624fa507bb1e5333cbe4de1714384ad6099e6`.
Its STOP is retained; it is neither applied nor executed as acceptance.

## Frozen Next closure packet

Source pin: `b4de02d8cd0753425b4a721d04bca087687509c7` (#8200).
Inspect files with `git show PIN:path`; working-tree state is not the packet.

| Public route | Dispatch export | Implementation and effects |
| --- | --- | --- |
| `/api/auth/logout` | POST | `src/legacy-api-routes/auth/logout/route.ts`: resolve user, revoke credentials when present, local signOut, explicit MFA approval cookie deletion on success; signOut error returns 500 |
| `/api/v1/auth/accounts/logout` | POST, OPTIONS | legacy account logout: CORS preflight or logoutCurrentWebAccount; absent active device performs revoke/local signOut, active device delegates removeWebAccount |
| `/api/v1/auth/accounts/logout-all` | POST, OPTIONS | legacy account logout-all: revoke/local signOut; existing device deletes device row and clears device cookie targets; empty account response |

The app routes export these legacy functions. Account errors produce diagnostic
500 responses via accountCorsJson. Device clear scopes are in device-cookies.ts
and crypto.ts; session cookie mutations also depend on the Supabase adapter.
Independent router/handler contract approval must establish the exact cookie
scopes before runtime comparisons; copying clear-target implementation is not an
independent expectation. Include no-device, active-device and provider-error
branches. No deletion PASS may be inferred from absent Set-Cookie.

Route closure must enumerate all three canonical routes, repeated slash,
trailing slash, dot segment, encoded letter/slash, case variants (`API`, `Logout`,
`LOGOUT`), double encoding (`%256C`, `%252F`) and unknown route. For each raw
target, independently resolve redirect/404/method/handler identity using pinned
Next routing contract and emitted manifests. R2's null expectations remain UNKNOWN.
Cross with off/report/enforce, cookie absent/present, bearer absent/present and
raw duplicate/malformed/missing Origin and Fetch Metadata pairs. Retain exact
raw headers and request targets privately; output only approved enum outcomes.
Trace cardinality, dispatch identity, backend effects and cookie scope mutations
must agree. Status alone is insufficient. Trusted Workspace policy is unchanged.

## Web P1 reconciliation for the existing owner

Read-only source chain at the same pin: public-navbar-actions -> shared async
LanguageWrapper -> LanguageToggle Button.onClick -> persistLocalePreference ->
cookies-next setCookie -> router.refresh. Dashboard LanguageWrapper ->
LanguageDropdownWrapper -> LanguageDropdownItem -> SatelliteLanguageItem ->
DropdownMenuItem.onClick; the callback persists the locale then refreshes (or
awaits its supplied onLocaleChange). No inferred locale route replacement.

The owner must reconcile exact d9 deployment ID, source SHA, lock/config hash,
build ID, script URLs and byte digests, route/locale, picker surface, cookie scope
and callback implementation. Capture node connectivity at pointerdown/up/click,
callback count, cookie write arguments and refresh outcome. Reconcile cache and
service-worker asset identity. A mouse target detached before activation is an
invalid activation trial, while old 1bb keyboard success proves only that trial.
P1 remains unreproduced. Shared picker writes require a TTR-specific path handoff.
