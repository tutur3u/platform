# Wave-1 native publication profiles

The admitted Meet/Calendar/Mail/Apps native source and CI are distinct from the
paused `apps/tanstack-web` runtime; their publication remains subject to holds.
Keep staging/production identity in `scripts/ci/wave1-native-profiles.json`; retain
original Void output and seal the derived config with unchanged modules/assets.
The publisher consumes restored same-run bytes after original/restored workerd gates.
Production remains visibly held in addition to planner holds. Owner-provision staging
Workers/secrets/resources before enabling the repository flag; no CI bootstrap or DNS
setup. Keep public build-input fingerprints, hosted SHA/artifact tags, weighted
rollback capture, one-write/fresh-stop checks and honest uncertain outcomes.

Run `scripts/ci/wave1-native-publishers.test.js` through resource admission after changes.
Root `test:scripts` uses `scripts/run-script-tests.js` discovery, including `.test.js`
and `.test.mjs` under `scripts/`, excluding paused implementation suites. New tests
there need no manifest list. Keep deployment credentials out of runtime/build steps.
Meet has a separate isolated staging profile; canonical output never stands in for
staging. See the [publisher runbook](../../../../../apps/docs/build/devops/wave1-native-publishers.mdx)
for provisioning, bounded-work limits and remaining hosted/cutover evidence.

Use the shared validated production publication policy in native entrypoints; do not
read the retired hold-map export. Held profile builds use fixture public inputs.
Staging secrets require a trusted main event and staging profile, including in the
reusable publisher itself. Include imported Void staging configs in their owning
TypeScript project and verify with the app's non-build type-check command.

For Mail's CommonJS path startup failure, preserve the same compatibility flags/date
for both profiles. Void 1.1.12 skips its builtin require adapter for the default
SQLite dialect. Keep Mail's workerd-only builtin adapters (PostCSS path/url/fs and iconv-lite stream) and pre-runtime emitted
asset rejection; do not add a global require shim or claim local config tests prove
emitted Worker startup. Inbound group DKIM verification reaches iconv-lite through
mailauth tools and libmime charset decoding; adapt its stream require to node:stream
ESM rather than removing verification or installing a global require. Its fallback
error message also contains a literal require example: rewrite only that diagnostic
in the workerd build, keeping the conservative emitted-byte guard unchanged. Inspect
emitted match context before claiming a require example is an executable call. Both profile acceptances belong to exact-head CI.

Mail's emitted guard retains its conservative require-byte check and additionally
parses server JavaScript modules to follow Rolldown's exported require helper into
renamed imports. Cover bare/node-prefixed builtin names, quoted/backtick strings,
helper suffixes and minified aliases (for example t(`node:buffer`)); preserve ESM
imports. The DKIM/libmime graph also requires buffer, crypto, dns, https and
string_decoder; bundled deprecation/stream and document-preview helpers require
util/events. Keep their adapters restricted to workerd server require calls.

Email-service cache cleanup must run lazily during use, never through import-time
setInterval: workerd forbids timers outside a handler. Preserve TTL/rate-limit
checks and the timer-free import/expiry regression when changing this path.

## Subdomain rollback capture and smoke

Follow the [cutover tools runbook](../../../../../apps/docs/build/devops/wave1-native-cutover.mdx#subdomain-cutover-tools).
Capture every zone route, including wildcard routes and scriptless exclusions; a
root-URL match cannot establish which routes serve deeper paths. Use the dedicated
zone-scoped `CLOUDFLARE_READONLY_API_TOKEN` (DNS:Read and Workers Routes:Read),
keep capture artifacts in ignored `tmp/` or the private ledger, and never commit
production origin URLs. Run `node --test scripts/native-cutover/*.test.mjs` for
credential isolation, route semantics and smoke failure-continuation coverage.
