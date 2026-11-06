import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname } from 'node:path';
import test from 'node:test';
import {
  NativeUploadError,
  productionFailureMessage,
} from './wave1-native-upload-error.mjs';

const token = () => ['abcd1234', 'WXYZ5678', 'efgh9012'].join('');
for (const [name, separator] of [
  ['BEL', '\u0007'],
  ['NUL', '\u0000'],
  ['DEL', '\u007f'],
  ['combining acute', '\u0301'],
  ['combining grapheme joiner', '\u034f'],
  ['box-prefixed wrap', '\n  │ '],
  ['code suffix wrap', ' [code: 10021]\n  │ '],
])
  test(`known token with ${name} keeps no token fragments`, () => {
    const value = token();
    const stderr = `[ERROR] Invalid ${value.slice(0, 12)}${separator}${value.slice(12)}`;
    const error = new NativeUploadError({ stderr }, [value]);
    const retained = `${JSON.stringify(error)} ${productionFailureMessage(error)}`;
    assert.equal(retained.includes(value.slice(0, 12)), false);
    assert.equal(retained.includes(value.slice(12)), false);
  });

test('JSON-escaped control inside a provider message keeps no known-token fragments', () => {
  const value = token();
  const stderr = JSON.stringify({
    errors: [
      {
        code: 10021,
        message: `Invalid ${value.slice(0, 12)}\u0007${value.slice(12)}`,
      },
    ],
  });
  const error = new NativeUploadError({ stderr }, [value]);
  const retained = `${JSON.stringify(error)} ${productionFailureMessage(error)}`;
  assert.equal(retained.includes(value.slice(0, 12)), false);
  assert.equal(retained.includes(value.slice(12)), false);
});

for (const markers of [
  '###[stop-commands] :::error:::',
  '####[set-output name=x] :::',
])
  test(`marker runs cannot recreate workflow commands: ${markers[0]}`, () => {
    for (const stderr of [`[ERROR] ${markers}`, `${markers} [code: 10021]`]) {
      const error = new NativeUploadError({ stderr });
      const text = `${JSON.stringify(error)} ${productionFailureMessage(error)}`;
      assert.equal(text.includes('##['), false);
      assert.equal(text.includes('::'), false);
    }
  });

for (const field of [
  'headers[authorization]',
  '`token`',
  '((pwd))',
  'headers["credentials"]',
])
  test(`wrapped credential key ${field} hides a short value`, () => {
    const error = new NativeUploadError({
      stderr: `[ERROR] ${field}: short-value`,
    });
    assert.equal(JSON.stringify(error).includes('short-value'), false);
    assert.equal(
      productionFailureMessage(error).includes('short-value'),
      false
    );
  });

test('one MiB of adversarial diagnostic text processes below one second in five runs', () => {
  const moduleUrl = new URL('./wave1-native-upload-error.mjs', import.meta.url)
    .href;
  const code = `
    import assert from 'node:assert/strict';
    import { NativeUploadError, productionFailureMessage } from ${JSON.stringify(moduleUrl)};
    const input = '[ERROR] ' + 'a-'.repeat((1024 * 1024 - 8) / 2);
    assert.equal(Buffer.byteLength(input), 1024 * 1024);
    const times = [];
    const known = ['abcd1234', 'WXYZ5678', 'efgh9012'].join('');
    for (let i = 0; i < 5; i++) {
      const start = performance.now();
      const error = new NativeUploadError({ stderr: input }, [known]);
      const log = productionFailureMessage(error);
      const receipt = JSON.stringify(error);
      const elapsed = performance.now() - start;
      assert.ok(typeof error.uploadFailure.headline === 'string');
      assert.ok(error.uploadFailure.headline.length <= 300);
      assert.ok(log.length > 0 && receipt.length > 0);
      assert.ok(elapsed < 1000, 'One MiB diagnostic exceeded 1000 ms: ' + elapsed);
      times.push(elapsed);
    }
    console.log(JSON.stringify({ inputBytes: Buffer.byteLength(input), runs: times.length, elapsedMs: times }));
  `;
  const result = spawnSync(
    process.execPath,
    ['--input-type=module', '-e', code],
    {
      env: {
        PATH: dirname(process.execPath),
        HOME: tmpdir(),
        TMPDIR: tmpdir(),
      },
      timeout: 6000,
      maxBuffer: 65536,
      encoding: 'utf8',
    }
  );
  assert.equal(
    result.error,
    undefined,
    'Diagnostic child exceeded its bounded lifetime'
  );
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.runs, 5);
  assert.ok(report.elapsedMs.every((value) => value < 1000));
  console.log(JSON.stringify(report));
});
