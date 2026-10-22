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
