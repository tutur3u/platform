import assert from 'node:assert/strict';
import { profiles } from './wave1-native-profile.mjs';

export function stagingAdmission(raw, app, sha, digest) {
  assert.equal(typeof raw, 'string', 'Missing exact staging admission');
  assert.ok(raw.length <= 4096, 'Staging admission exceeds budget');
  const record = JSON.parse(raw);
  const policy = profiles.stagingAdmission;
  assert.deepEqual(
    Object.keys(record).sort(),
    [
      'schema',
      'app',
      'sourceSha',
      'artifactSha256',
      ...Object.keys(policy),
    ].sort(),
    'Unexpected admission fields'
  );
  assert.equal(record.schema, 1);
  assert.equal(record.app, app, 'Unadmitted app');
  assert.match(record.sourceSha ?? '', /^[a-f0-9]{40}$/);
  assert.equal(record.sourceSha, sha, 'Unadmitted source SHA');
  assert.match(record.artifactSha256 ?? '', /^[a-f0-9]{64}$/);
  if (digest !== undefined)
    assert.equal(record.artifactSha256, digest, 'Unadmitted artifact digest');
  for (const key of [
    'isolation',
    'accountIdEnv',
    'tokenSecret',
    'scopedTokenRequired',
    'residualRisk',
    'maxUploadsPerArtifact',
    'publicationVariable',
  ])
    assert.equal(record[key], policy[key], `Unadmitted staging ${key}`);
  return record;
}
