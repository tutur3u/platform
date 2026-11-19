import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { REPO_ROOT } from './wrangler-usage.js';

const RECEIPTS_PATH = 'scripts/ci/fixtures/cf-toolchain-receipts.json';
const STATUSES = new Set(['switched', 'qualified', 'gap']);

export function receiptsPath() {
  return `${REPO_ROOT}/${RECEIPTS_PATH}`;
}

export function readReceipts() {
  return JSON.parse(readFileSync(receiptsPath(), 'utf8'));
}

export function validateReceipts(document = readReceipts()) {
  assert.equal(typeof document.pin?.cf, 'string', 'pin.cf is required');
  assert.equal(
    document.pin?.allowlistPath,
    'scripts/ci/wrangler-usage-allowlist.json',
    'pin.allowlistPath must reference the usage allowlist'
  );
  assert.ok(Array.isArray(document.order), 'order must be an array');
  const operations = document.operations ?? {};
  for (const id of document.order) {
    assert.ok(operations[id], `missing operation ${id}`);
  }
  for (const [id, operation] of Object.entries(operations)) {
    assert.ok(STATUSES.has(operation.status), `${id} has an invalid status`);
    assert.equal(typeof operation.title, 'string', `${id} needs a title`);
    assert.equal(typeof operation.owner, 'string', `${id} needs an owner`);
    if (operation.status === 'switched') {
      assert.equal(
        typeof operation.implementation,
        'string',
        `${id} switched operations need implementation`
      );
      assert.ok(
        Array.isArray(operation.parityEvidence) &&
          operation.parityEvidence.length > 0,
        `${id} switched operations need parityEvidence`
      );
      assert.ok(
        operation.allowlistDelta &&
          Number.isInteger(operation.allowlistDelta.files) &&
          Number.isInteger(operation.allowlistDelta.uses),
        `${id} switched operations need numeric allowlistDelta`
      );
      assert.ok(
        Array.isArray(operation.wranglerGapsRetained),
        `${id} switched operations must list retained Wrangler gaps`
      );
    }
    if (operation.status === 'qualified') {
      assert.equal(
        typeof operation.implementation,
        'string',
        `${id} qualified operations need implementation`
      );
      assert.ok(
        Array.isArray(operation.parityEvidence) &&
          operation.parityEvidence.length > 0,
        `${id} qualified operations need parityEvidence`
      );
    }
  }
  const extra = Object.keys(operations).filter(
    (id) => !document.order.includes(id)
  );
  assert.deepEqual(extra, [], 'operations must match order exactly');
  return document;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    validateReceipts();
    console.log(
      `cf toolchain receipts valid (${readReceipts().order.length} operations)`
    );
  } catch (error) {
    console.error(
      `cf toolchain receipts invalid: ${error instanceof Error ? error.message : error}`
    );
    process.exitCode = 1;
  }
}
