import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeT3Accounting } from './usage-normalize.mjs';
import { usageCollector } from './usage-snapshot.mjs';

test('charges a shared physical usage source once and keeps source identity private', async () => {
  const now = new Date('2026-11-21T12:00:00.000Z');
  const machines = ['m4', 'studio'].map((id) => ({ id, label: id }));
  const sharedId = 'private-physical-log-identity';
  const collect = usageCollector({
    root: '/fixture',
    configs: machines.map(({ id }) => ({
      id,
      environmentId: id,
      origin: 'http://127.0.0.1:3773',
    })),
    readSecret: () => 'fixture-bearer',
    now,
    async collect({ environmentId }) {
      const sourcePath = `/fixture/${environmentId}/codex`;
      return {
        quota: { kind: 'unavailable' },
        accounts: [],
        ...normalizeT3Accounting(
          {
            readAt: now.toISOString(),
            sources: [
              {
                status: environmentId === 'studio' ? 'ok' : 'partial',
                fingerprint: {
                  provider: 'codex',
                  resolvedHomePath: sourcePath,
                  physicalSourceId: sharedId,
                },
              },
            ],
            buckets: [
              {
                day: '2026-11-21',
                provider: 'codex',
                model: 'model-a',
                sourcePath,
                costUsd: 2,
                costSource: 'modelPriced',
                unpricedRecords: 0,
                totals: {
                  uncachedInputTokens: 42,
                  cachedInputTokens: 8,
                  cacheCreationTokens: 0,
                  outputTokens: 6,
                },
              },
            ],
          },
          { trackSources: true }
        ),
      };
    },
  });
  const { body } = await collect(machines);
  const stored = JSON.parse(body);
  assert.equal(stored.machines[0].buckets.length, 0);
  assert.equal(stored.machines[0].accounting.kind, 'partial');
  assert.equal(stored.machines[1].buckets[0].costUsd, 2);
  assert.doesNotMatch(
    body,
    /private-physical|bucketSourceIds|fixture-bearer|\/fixture/
  );
});
