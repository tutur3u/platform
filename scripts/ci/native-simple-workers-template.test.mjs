import assert from 'node:assert/strict';
import { accessSync, readFileSync } from 'node:fs';
import test from 'node:test';
import { readReceipts } from './cf-toolchain-receipts.mjs';

const template = 'apps/cron-control';

for (const app of ['api', 'gateway', 'status-api']) {
  test(`${app} carries a cf-worker-parity baseline and cron-control template pointer`, () => {
    const baseline = JSON.parse(
      readFileSync(`scripts/ci/fixtures/cf-worker-parity/${app}.json`, 'utf8')
    );
    assert.equal(baseline.migrationTemplate, template);
    accessSync(`apps/${app}/cloudflare.config.ts`);
    assert.equal(typeof baseline.identity?.name, 'string');
  });
}

test('native Workers and gateway queue item names cron-control production shape', () => {
  const item = readReceipts().operations['native-workers-gateway'];
  assert.equal(item.status, 'switched');
  assert.ok(
    item.parityEvidence.includes(
      'scripts/ci/native-simple-workers-template.test.mjs'
    )
  );
});
