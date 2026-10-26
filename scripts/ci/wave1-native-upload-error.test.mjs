import assert from 'node:assert/strict';
import test from 'node:test';
import { uploadArtifact } from './wave1-native-publish.mjs';
import {
  NativeUploadError,
  productionFailureMessage,
} from './wave1-native-upload-error.mjs';

test('upload failure exposes only numeric exit, signal and CF code metadata', async () => {
  const secret = 'cf_secret_fixture_9b286d92_NEVER_LOG';
  const failure = Object.assign(new Error(`Authorization: Bearer ${secret}`), {
    status: 1,
    signal: 'SIGTERM',
    stderr: Buffer.from(
      `Authorization: Bearer ${secret}\nAPI failed [code: 10021]`
    ),
    stdout: Buffer.from(`Secret binding: ${secret}`),
  });
  await assert.rejects(
    uploadArtifact({
      env: { RUNNER_TEMP: '/tmp' },
      app: 'calendar',
      environment: 'production',
      config: '/tmp/calendar/dist/wave1/wrangler.json',
      sha: 'a'.repeat(40),
      digest: 'b'.repeat(64),
      cfToken: secret,
      p: { accountId: 'c'.repeat(32) },
      exec: () => {
        throw failure;
      },
    }),
    (error) => {
      assert.deepEqual(error.uploadFailure, {
        exitCode: 1,
        signal: 'SIGTERM',
        cfCode: 10021,
        cfErrors: [{ code: 10021, message: 'API failed' }],
      });
      assert.equal(JSON.stringify(error).includes(secret), false);
      assert.equal(error.message.includes(secret), false);
      const logs = [];
      const log = (line) => logs.push(line);
      log(productionFailureMessage(error));
      assert.equal(logs.join('\n').includes(secret), false);
      assert.match(logs[0], /"cfCode":10021/u);
      assert.equal(error.cause, undefined);
      return true;
    }
  );
});

test('an ERROR headline redacts embedded credentials and retains one bounded line', () => {
  const known = 'short-private-value';
  const secrets = [
    known,
    'cf_fixture_token_0123456789abcdef',
    'low-secret',
    'user:pass',
  ];
  const error = new NativeUploadError(
    {
      status: 1,
      stderr: `[ERROR] Rejected ${known} Bearer ${secrets[1]} api_key=low-secret https://user:pass@example.com/path ${'x'.repeat(400)}\nSecret second line`,
    },
    [known]
  );
  assert.ok(error.uploadFailure.headline.length <= 300);
  assert.equal(error.uploadFailure.headline.includes('\n'), false);
  assert.equal(error.uploadFailure.headline.includes('second line'), false);
  for (const secret of secrets) {
    assert.equal(JSON.stringify(error).includes(secret), false);
    assert.equal(productionFailureMessage(error).includes(secret), false);
  }
  assert.match(error.uploadFailure.headline, /Rejected/u);
});

test('provider messages retain the code but redact an embedded secret', () => {
  const secret = 'sb_secret_fixture_0123456789abcdef';
  const error = new NativeUploadError({
    stderr: `Binding token=${secret} rejected [code: 10021]`,
  });
  assert.equal(error.uploadFailure.cfErrors[0].code, 10021);
  assert.equal(JSON.stringify(error).includes(secret), false);
  assert.equal(productionFailureMessage(error).includes(secret), false);
  assert.equal(error.uploadFailure.headline, undefined);
});

test('structured provider pairs are bounded and sanitize embedded secrets', () => {
  const secret = 'sb_secret_fixture_0123456789abcdef';
  const error = new NativeUploadError({
    stderr: JSON.stringify({
      errors: Array.from({ length: 12 }, () => ({
        code: 10021,
        message: `Invalid key=${secret}\nretry`,
      })),
      unrelatedSecret: secret,
    }),
  });
  assert.equal(error.uploadFailure.cfErrors.length, 8);
  assert.equal(JSON.stringify(error).includes(secret), false);
  assert.ok(
    error.uploadFailure.cfErrors.every((e) => !e.message.includes('\n'))
  );
});

test('unrecognized fields and conflicting numeric codes are not retained', () => {
  const secret = 'cf_secret_fixture_UNRECOGNIZED';
  const error = new NativeUploadError({
    status: secret,
    signal: secret,
    stderr: `${secret}\n[code: 10021]\n[code: 10000]`,
    stdout: secret,
    message: secret,
    cause: new Error(secret),
  });
  assert.deepEqual(error.uploadFailure, {
    exitCode: null,
    signal: null,
    cfCode: null,
  });
  assert.equal(JSON.stringify(error).includes(secret), false);
  assert.equal(productionFailureMessage(error).includes(secret), false);
  assert.equal(
    productionFailureMessage(new Error(secret)).includes(secret),
    false
  );
});
