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


For Calendar's private production preparation, use `wave1-native-production.yaml`
on the production branch after the app's explicit policy admission. Its protected
`wave1-calendar-production` environment requires only the production branch, an
no required reviewer and disabled admin bypass. It supplies only the named
`WAVE1_PRODUCTION_CLOUDFLARE_API_TOKEN` to the final upload step. The sealed Calendar/Mail/Apps production profiles have
no routes, workers.dev or preview ingress. Refuse existing hosted Route/Custom
Domain attachments as well: a code deploy to an already attached Worker changes
traffic even with an empty local route list. Preserve the initial private rollback
baseline, exact public inputs and before/after topology. Earlier production runs,
reruns and absent versions never authorize replay of an uncertain upload. Keep
pending/uploaded receipts and reconcile the original operation. Inspect earlier
upload steps across SHAs and all attempts, allowing proven pre-upload refusals.
Keep the original artifact unchanged. An owner-resolved `failed-no-write` attempt
can be matched only through the reviewed append-only production resolutions file,
with exact run/attempt/SHA/digest and both original/current rollback baselines.
Continue checking other history; a later started pending replay remains fenced.
Refuse a hosted version matching either the resolved SHA or digest before the
replay. Keep run, job, artifact and receipt fixtures independent, and run the
21-predicate mutation harness when changing resolution matching.
Upload diagnostics retain only allowlisted process/code fields and bounded,
sanitized provider messages or one ERROR headline. Never retain raw child output
or error causes, and never infer write failure from a diagnostic alone. See the
publisher runbook for redaction limits and independent review requirements.
The public repository exposes workflow logs and receipt artifacts. Unknown
unlabelled secrets below 24 characters cannot be reliably detected. Scrub known
values before normalization, redact complete query/credential values, and
neutralize workflow-command markers; never rely on artifact privacy.
A matching version needs a distinct earlier rollback. Bound all preflight reads
under one deadline, filter attachments to the Worker across all account zones,
and pass only the CLI environment it needs. Dry-run output belongs outside the
sealed artifact; preserve archive rejection of hidden output. No canonical
marker is emitted before the later routing flip and hosted acceptance.
Run `scripts/ci/wave1-native-production.test.mjs` for counting transport/CLI,
no-route profile, held-policy, unknown-outcome and workflow-secret regressions.
