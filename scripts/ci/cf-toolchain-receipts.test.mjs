import assert from 'node:assert/strict';
import { accessSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { readReceipts, validateReceipts } from './cf-toolchain-receipts.mjs';
import { REPO_ROOT } from './wrangler-usage.js';

test('cf toolchain receipts schema and operation order', () => {
  const document = validateReceipts();
  assert.deepEqual(document.order[0], 'settings-readback');
});

test('switched operations reference existing parity evidence', () => {
  const { operations } = readReceipts();
  for (const operation of Object.values(operations)) {
    if (operation.status !== 'switched' && operation.status !== 'qualified')
      continue;
    for (const relative of operation.parityEvidence) {
      accessSync(join(REPO_ROOT, relative));
    }
  }
});

test('settings readback production template names cron-control cf publisher', () => {
  const settings = readReceipts().operations['settings-readback'];
  assert.equal(settings.status, 'switched');
  assert.match(
    settings.productionTemplate.workflow,
    /cron-control-cloudflare\.yaml$/
  );
  assert.match(settings.productionTemplate.publisher, /cf deploy --prebuilt/);
});

test('DO sqlite publisher is qualified with cf deploy evidence', () => {
  const item = readReceipts().operations['email-storage-do-void-publisher'];
  assert.equal(item.status, 'qualified');
  assert.match(item.implementation, /coordination/);
  assert.match(item.productionTemplate.publisher, /cf deploy --prebuilt/);
});

test('calendar publisher and native worker templates are recorded as switched or qualified', () => {
  const receipts = readReceipts().operations;
  assert.equal(receipts['calendar-build-output'].status, 'switched');
  assert.match(
    receipts['calendar-build-output'].implementation,
    /calendar-cf-publisher/
  );
  assert.equal(receipts['native-workers-gateway'].status, 'switched');
  assert.ok(
    receipts['native-workers-gateway'].parityEvidence.includes(
      'scripts/ci/fixtures/cf-worker-parity/gateway.json'
    )
  );
});
