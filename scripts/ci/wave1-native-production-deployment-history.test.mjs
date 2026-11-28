import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertActiveVersionsPresent,
  assertLiveRollbackUnchanged,
  confirmMissingHistoricalVersions,
  readAllDeployments,
} from './wave1-native-production-guards.mjs';

test('R8: deployment history requires an explicit empty terminal page', async () => {
  const first = { id: 'a0000000-0000-0000-0000-000000000001' };
  const second = { id: 'a0000000-0000-0000-0000-000000000002' };
  const pages = [[first], [second], []];
  let reads = 0;
  const options = {
    script: 'fixture',
    fetchJson: async () => ({
      success: true,
      result: { deployments: pages[reads++] },
      result_info: { total_count: 2, total_pages: 2 },
    }),
  };
  assert.deepEqual(await readAllDeployments(options), [first, second]);
  assert.equal(reads, 3);
  reads = 0;
  await assert.rejects(readAllDeployments({ ...options, maxPages: 2 }));
  reads = 0;
  pages[2] = undefined;
  await assert.rejects(
    readAllDeployments(options),
    /Malformed version inventory/u
  );
});

test('R8: confirmed historical absence cannot excuse a missing rollback or active version', async () => {
  const active = 'a0000000-0000-0000-0000-000000000001';
  const historical = 'a0000000-0000-0000-0000-000000000002';
  const deployments = [active, historical].map((version_id) => ({
    versions: [{ version_id, percentage: 100 }],
  }));
  const fixture = { deployments, versionItems: [{ id: active }] };
  const confirmedMissingHistoricalIds = await confirmMissingHistoricalVersions({
    ...fixture,
    isVersionMissing: async (id) => id === historical,
  });
  assertActiveVersionsPresent({ ...fixture, confirmedMissingHistoricalIds });
  await assert.rejects(
    confirmMissingHistoricalVersions({
      ...fixture,
      isVersionMissing: async () => false,
    }),
    /Incomplete version inventory/u
  );
  assert.throws(
    () =>
      assertActiveVersionsPresent({
        ...fixture,
        confirmedMissingHistoricalIds,
        rollback: deployments[1],
      }),
    /rollback deployment/u
  );
  assert.throws(
    () =>
      assertActiveVersionsPresent({
        ...fixture,
        versionItems: [],
        confirmedMissingHistoricalIds: new Set([active]),
      }),
    /active deployment/u
  );
});

test('R8: live rollback compares UUID case without ignoring its split', async () => {
  const id = 'ab000000-0000-0000-0000-000000000001';
  const live = { id, versions: [{ version_id: id, percentage: 100 }] };
  const options = {
    script: 'fixture',
    fetchJson: async () => ({ success: true, result: { deployments: [live] } }),
    expected: {
      id: id.toUpperCase(),
      versions: [{ version_id: id.toUpperCase(), percentage: 100 }],
    },
  };
  await assertLiveRollbackUnchanged(options);
  options.expected.versions[0].percentage = 99;
  await assert.rejects(
    assertLiveRollbackUnchanged(options),
    /version split changed/u
  );
});
