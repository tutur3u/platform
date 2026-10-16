import assert from 'node:assert/strict';
import test from 'node:test';
import {
  projectStartupOutput,
  startupCategories,
  startupOutputCapture,
  startupStreamLimit,
} from './employee-web-session-startup-diagnostic.mjs';

test('split startup messages yield fixed categories without private text', () => {
  const capture = startupOutputCapture();
  for (const text of [
    'secret=https://private.invalid/token\nFailed to load next.con',
    'fig.ts\nCannot find mod',
    'ule private-path\nEADDR',
    'INUSE',
  ])
    capture.append('stderr', Buffer.from(text));
  assert.deepEqual(capture.receipt(), {
    categories: ['address-in-use', 'missing-module', 'next-config-load'],
    truncated: false,
  });
  assert.ok(!JSON.stringify(capture.receipt()).includes('private'));
});

test('independent streams do not manufacture a diagnostic across streams', () => {
  const capture = startupOutputCapture();
  capture.append('stdout', Buffer.from('EADDR'));
  capture.append('stderr', Buffer.from('INUSE'));
  assert.deepEqual(capture.receipt(), { categories: [], truncated: false });
});

test('flood retains only fixed prefixes and stops scanning later data', () => {
  const capture = startupOutputCapture();
  capture.append('stdout', Buffer.from('SyntaxError: private-secret\n'));
  capture.append('stdout', Buffer.alloc(startupStreamLimit, 120));
  for (let index = 0; index < 1000; index++)
    capture.append('stdout', Buffer.from('EADDRINUSE secret'));
  capture.append('stderr', Buffer.from('bad option: private-option'));
  const receipt = capture.receipt();
  assert.deepEqual(receipt, {
    categories: ['node-option-rejected', 'runtime-syntax'],
    truncated: true,
  });
  receipt.categories.push('private-value');
  assert.deepEqual(capture.receipt(), {
    categories: ['node-option-rejected', 'runtime-syntax'],
    truncated: true,
  });
  capture.append('stderr', Buffer.from('EADDRINUSE'));
  assert.deepEqual(capture.receipt().categories, [
    'node-option-rejected',
    'runtime-syntax',
  ]);
  assert.ok(Buffer.byteLength(JSON.stringify(capture.receipt())) < 512);
});

test('startup projection strips extras and rejects malformed or unbounded lists', () => {
  assert.deepEqual(
    projectStartupOutput({
      categories: [],
      truncated: false,
      secret: 'private',
    }),
    { categories: [], truncated: false }
  );
  for (const candidate of [
    null,
    [],
    {},
    { categories: 'missing-module', truncated: false },
    { categories: ['secret'], truncated: false },
    { categories: ['missing-module', 'missing-module'], truncated: false },
    { categories: Array(100).fill('missing-module'), truncated: true },
    { categories: [], truncated: 'false' },
  ])
    assert.throws(() => projectStartupOutput(candidate));
  assert.deepEqual(
    projectStartupOutput({
      categories: [...startupCategories],
      truncated: true,
    }).categories,
    startupCategories
  );
});

test('unclassified secrets and unsupported stream names never enter receipts', () => {
  const capture = startupOutputCapture();
  capture.append('private-stream', Buffer.from('EADDRINUSE'));
  capture.append(
    'stderr',
    Buffer.from('https://secret.invalid/path token=private-body /private/path')
  );
  assert.deepEqual(capture.receipt(), { categories: [], truncated: false });
});
