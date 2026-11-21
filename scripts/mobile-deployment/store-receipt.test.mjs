import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  alertAction,
  buildReceipt,
  receiptMarkdown,
} from './store-receipt.mjs';
import { vietnameseTestNotes } from './testflight-vi-notes.mjs';

const base = {
  GITHUB_SHA: 'a'.repeat(40),
  GITHUB_SERVER_URL: 'https://github.com',
  GITHUB_REPOSITORY: 'tutur3u/platform',
  GITHUB_RUN_ID: '1',
  GITHUB_RUN_ATTEMPT: '1',
  MOBILE_BUILD_NAME: '0.27.20',
  MOBILE_BUILD_NUMBER: '578001',
  RESULT_CHECK: 'success',
  RESULT_GATE: 'success',
  RESULT_PREFLIGHT: 'success',
  RESULT_ANDROID: 'success',
  RESULT_IOS: 'success',
};

test('receipt records version, store build number and per-store result', () => {
  const receipt = buildReceipt({ ...base, GOOGLE_PLAY_BETA_TRACKS: 'alpha' });
  assert.equal(receipt.status, 'published');
  assert.equal(receipt.version, '0.27.20');
  assert.equal(receipt.buildNumber, '578001');
  assert.equal(receipt.playTestingTrackCount, 1);
  assert.match(receiptMarkdown(receipt), /Store build number: `578001`/);
  assert.match(receiptMarkdown(receipt), /none \(internal only\)/);
});

test('receipt never echoes private group names or unvalidated values', () => {
  const receipt = buildReceipt({
    ...base,
    GOOGLE_PLAY_BETA_TRACKS: 'alpha,[x](https://evil)\n@team',
    TESTFLIGHT_EXTERNAL_BETA_GROUPS: 'Secret Customers,VIP',
    MOBILE_BUILD_NAME: '1.0.0\n# injected',
  });
  const text = receiptMarkdown(receipt);
  assert.equal(receipt.playTestingTrackCount, 2);
  assert.equal(receipt.testflightExternalGroupCount, 2);
  assert.equal(receipt.version, null);
  assert.doesNotMatch(text, /Secret|VIP|evil|@team|injected|alpha/);
});

test('a failed CI check is a failed receipt stage', () => {
  const receipt = buildReceipt({
    ...base,
    RESULT_CHECK: 'failure',
    RESULT_GATE: '',
    RESULT_PREFLIGHT: '',
    RESULT_ANDROID: '',
    RESULT_IOS: '',
  });
  assert.deepEqual(receipt.failed, ['check']);
});

test('any failed or cancelled stage opens or updates the alert issue', () => {
  const failed = buildReceipt({ ...base, RESULT_IOS: 'failure' });
  assert.equal(failed.status, 'failed');
  assert.deepEqual(failed.failed, ['ios']);
  assert.equal(alertAction(failed, null), 'open');
  assert.equal(alertAction(failed, { number: 9 }), 'comment');
  const preflight = buildReceipt({
    ...base,
    RESULT_PREFLIGHT: 'cancelled',
    RESULT_ANDROID: '',
    RESULT_IOS: '',
  });
  assert.deepEqual(preflight.failed, ['preflight']);
});

test('only a run that published both stores closes the alert', () => {
  assert.equal(alertAction(buildReceipt(base), { number: 9 }), 'close');
  assert.equal(alertAction(buildReceipt(base), null), 'none');
  const partial = buildReceipt({ ...base, RESULT_IOS: 'skipped' });
  assert.equal(partial.status, 'incomplete');
  assert.equal(alertAction(partial, { number: 9 }), 'none');
});

test('receipt CLI writes the receipt without contacting GitHub', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'mobile-receipt-'));
  const file = path.join(dir, 'receipt.json');
  const script = fileURLToPath(new URL('./store-receipt.mjs', import.meta.url));
  execFileSync(process.execPath, [script, 'write', file], {
    env: { ...base, GITHUB_TOKEN: '', PATH: process.env.PATH },
    stdio: 'pipe',
  });
  assert.equal(JSON.parse(readFileSync(file, 'utf8')).buildNumber, '578001');
});

test('Vietnamese TestFlight notes localize the generated heading', () => {
  assert.equal(
    vietnameseTestNotes('Please test 0.27.20:\n- Fix login'),
    'Vui lòng kiểm tra 0.27.20:\n- Fix login'
  );
  assert.equal(
    vietnameseTestNotes('Manual notes'),
    'Bản thử nghiệm mới:\nManual notes'
  );
  assert.equal(vietnameseTestNotes(''), '');
  assert.equal(vietnameseTestNotes('x'.repeat(4000)), '');
});
