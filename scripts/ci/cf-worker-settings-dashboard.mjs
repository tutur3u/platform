import assert from 'node:assert/strict';
import { isDeepStrictEqual } from 'node:util';

/** Dashboard provenance is admitted only for one reviewed, unchanged version. */
export function verifyDashboardAdmission(
  raw,
  identity,
  admission,
  verifyBindings
) {
  const source = raw.service?.default_environment?.script?.last_deployed_from;
  assert.ok(
    ['dash', 'wrangler', 'api', 'cf', 'cf_cli', 'workers-ci'].includes(source),
    'Worker deployment source unavailable'
  );
  if (source !== 'dash') return;
  assert.ok(
    /^CRON-DASH-ADMIT-1:/.test(admission?.decision ?? '') &&
      /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/.test(
        admission?.versionId ?? ''
      ),
    'dashboard deployment has no reviewed admission'
  );
  const versions = raw.deployments.deployments[0]?.versions;
  assert.ok(
    versions?.length === 1 &&
      versions[0].version_id === admission.versionId &&
      versions[0].percentage === 100,
    'dashboard deployment version differs from admission'
  );
  verifyBindings(raw.settings, identity);
  const sameNames = (names) =>
    isDeepStrictEqual([...names].sort(), [...identity.secrets].sort());
  assert.ok(
    sameNames(raw.secrets.map(({ name }) => name)) &&
      sameNames(
        raw.settings.bindings
          .filter(({ type }) => type === 'secret_text')
          .map(({ name }) => name)
      ),
    'dashboard secret names or count differ'
  );
}
