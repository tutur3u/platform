# Synthetic native journal proof proposal

**Draft source proposal, unexecuted.** This separate fixture does not change the production
app or recovery branch. Source publication is authorized for independent review only. Workflow dispatch,
registration and remote native resource admission require further review. Nothing here establishes a passing native gate yet.

The dedicated Dart entrypoint imports a byte-identical copy of
`apps/mobile/lib/data/sources/inventory_sale_journal.dart`. The prepare script
copies that file from the reviewed full checkout SHA, records its SHA256, and
builds a disposable Flutter app with the locked `flutter_secure_storage` 11.1.1
plugin. Its default adapter is real; no plugin method mock or in-memory adapter
is installed. Production plugin options are unchanged. No Firebase, Supabase,
auth tokens, customer account, receipt endpoint, invoice transport or other
provider is initialized. Synthetic actor/workspace pairs include the unique CI
run and attempt so no other run's journal can be acknowledged.

## Effects if later admitted and dispatched

The proposed `inventory-native-journal-proof.yaml` has only a manual trigger,
requires a reviewed full SHA and explicit admission input, uses `contents: read`,
and persists no checkout credential. It uses no repository secrets, environments,
deploy/store actions, live data or PR/main push trigger. It checks exact checkout
identity before building. Existing mobile workflows provide the Flutter3.47.x,
Java17 and CocoaPods setup pattern; they do not already execute storage proof.
This proposal deliberately creates a tiny fixture rather than installing the
production mobile app or its Firebase/native dependency surface.

Android: one Ubuntu GitHub runner, maximum 40-minute job; one debug APK build and
one install into a newly created API35 x86_64 Google APIs emulator. Required
preinstalled tooling is checked: SDK manager, AVD manager, adb, emulator, readable
KVM. SDK system-image/tool downloads and Flutter/pub/Gradle resolution happen
**only remotely after admission**. Emulator allocation is 2 cores/2048MiB; no GUI,
audio or snapshot. Boot waits are bounded to 180s, phase waits to 90s each, and
the runtime step to 12min. Guest wifi/data are disabled before fixture execution.
The emulator process is stopped afterward; source and existing app data are not
cleaned on M4.

iOS: a separate macOS GitHub runner, maximum 40-minute job; one debug simulator
build with CocoaPods, no signing/store credentials. A disposable iPhone simulator
uses an actually available iOS runtime selected from `simctl` JSON. It is booted,
installed once, terminated/relaunched between phases, then shut down/deleted after
evidence is collected. No production bundle or device is installed. The runtime
step is bounded to 12min. Android and iOS reports are separately named; neither
platform's pass substitutes for the other. The two proposed jobs can use separate
remote runners concurrently; total requested budget is at most 80 runner-minutes,
plus dependency/system-image/artifact disk on those runners. No M4 disk or native
build budget is requested. Cached SDK/dependency setup is reused where available.

## Assertions and evidence

Four phases run in the **same installed app**, with no uninstall, data clear,
simulator erase, rebuild, bundle ID change or storage-option change between them:

1. `write`: assert each synthetic scope is initially empty; await real journal
   write and exact encoded readback for A/workspace-A, B/workspace-A and
   A/workspace-B. Bodies carry distinct original synthetic UUIDs and fixed USD,
   UTC as-of, IANA timezone and display-label provenance.
2. `read`: after external process death, instantiate a new production journal;
   verify exact encoded identity/payload/provenance in A→B→A and workspace
   A→B→A read order; the unused B/workspace-B pair must return null. Unresolved
   acknowledgement must throw and leave A unchanged.
3. `cleanup`: repeat restart/isolation checks, mark only this run's synthetic
   records confirmed, then acknowledge matching invoice IDs.
4. `verify-clean`: after another external process death, verify all three
   acknowledged records are absent. No broad secure-storage deletion is used.

Native bridges obtain launch phase and atomically write a completion report with
native process ID. The host requires a fresh matching phase/run/SHA/source digest,
PASS and a different native process ID for every phase. Android explicitly
force-stops and verifies `pidof` reports absence; iOS `simctl terminate` must
succeed before relaunch. Fixed pass/failure codes and synthetic process IDs are saved
in `native-proof.json`; missing, stale or failed markers fail the job. Seven-day
artifacts include the exact source identity, copied source digest, resolved
lock digest/selected storage package versions and selected device/runtime metadata. Provider or customer data
cannot enter these synthetic artifacts.

This proves the exercised default native storage adapter's process durability and
journal key isolation on the selected emulator/simulator. It does **not** prove
production auth SDK logout/account switching, native physical-device locked-state
behavior, the full checkout/controller race lifecycle, or real receipt/auth/DB
semantics. Existing mounted/controller tests cover their source behavior; those
remaining real integration and device gates must stay explicit.

## Unexecuted risks and review points

The Flutter3.47 native template, Kotlin/Swift bridge, plugin deployment targets,
runner SDK/runtime availability and simulator keychain configuration have not
been built or run. Generation/build/boot/plugin/report failures are gate failures,
not storage passes. The disposable fixture dependency graph is seeded from the
production lock but pruned by remote pub get; its resolved lock digest and selected package versions are artifacts,
not a claim that all production native entitlements/options have been exercised.
No integration_test SDK dependency is needed: the dedicated app and native host
phase controls produce the proof directly, without repeated test-tool installs
that could reset state. Review the source diff and exact CI effects before
publishing or executing.

## Activation requires review

`workflow-proposal.yaml` is deliberately stored beside the fixture, outside
`.github/workflows`; this checkpoint registers no runnable repository workflow.
After source/resource review, activation must place the reviewed proposal at
`.github/workflows/inventory-native-journal-proof.yaml`, add it to the
`tuturuuu.ts` CI switchboard and wire the existing `ci-check.yml` gate, then run
applicable workflow validators before publication. Keep the manual-only trigger,
explicit admission, immutable checkout and read-only permissions. Registration,
remote installs/builds, execution and provider/live-data authority are separate;
this local checkpoint does not authorize any of them.

## Disk, output and privacy admission

Before tool downloads, require at least 20GiB free on the Android runner and
12GiB on the iOS runner's temporary filesystem. Android repeats its 20GiB
preflight before SDK image downloads; preparation, iOS runtime admission and
evidence collection require at least 4GiB remaining. These are explicit admission
floors, not hard byte quotas on SDK/dependency downloads; the 40-minute job cap
remains the outer bound. Native commands have 30s timeouts and 64KiB captured
output limits. Fixture generation is capped at 120s/64KiB captured output.

Only three named JSON files may be uploaded: proof-input, environment and
native-proof. Collection rejects any file above 64KiB or aggregate above 192KiB.
The resolved dependency lock is hashed and only storage package version strings
are retained; its raw content is not uploaded. Actual Flutter/Dart/engine, Node,
Java or Xcode versions are captured. Android records selected API/release/ABI,
emulator and adb versions; iOS records only the created simulator's runtime
identifier/version/build and synthetic device ID. Missing version metadata fails
collection/proof rather than implying a pass.

Raw emulator logs go to /dev/null; full device properties and simulator catalog
are not uploaded. The catalog is temporary selection input only. Raw build/pub
output is suppressed. Native exception text is replaced by fixed fixture error
codes and report artifacts whitelist synthetic identifiers/results. The fixture
has no provider clients, credentials, customer accounts or non-synthetic payload
sources. Tool/runtime versions are the only intentionally real environment data.
There is no broad storage deletion; cleanup is confined to this run's synthetic
keys and disposable emulator/simulator. CI job cancellation cleanup is best-effort
with ephemeral runner teardown as the backstop.

The draft follows recovery PR #5708, but is not part of its product assembly.
Native compilation, runtime proof, production auth lifecycle, physical-device
lock states and real receipt/auth/DB behavior remain unexecuted/unverified.

Source-review baseline: `34b2d051ec443521ec15ff3518321b084ca612a9`.
The draft PR description records the exact published checkpoint after these
admission/privacy changes; neither checkpoint has native execution evidence.
