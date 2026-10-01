# Synthetic native journal proof proposal

**Source-only, unexecuted.** This separate fixture does not change the production
app or recovery branch. Publication, workflow dispatch and remote native resource
admission require review. Nothing here establishes a passing native gate yet.

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
succeed before relaunch. Commands, pass/failure status and process IDs are saved
in `native-proof.json`; missing, stale or failed markers fail the job. Seven-day
artifacts include the exact source identity, copied source digest, resolved
fixture dependency lock and device/runtime metadata. Provider or customer data
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
production lock but pruned by remote pub get; its resolved lock is an artifact,
not a claim that all production native entitlements/options have been exercised.
No integration_test SDK dependency is needed: the dedicated app and native host
phase controls produce the proof directly, without repeated test-tool installs
that could reset state. Review the source diff and exact CI effects before
publishing or executing.
