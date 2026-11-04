import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname } from 'node:path';
import test from 'node:test';
import {
  NativeUploadError,
  productionFailureMessage,
} from './wave1-native-upload-error.mjs';

const knownValue = () => ['abcd1234', 'WXYZ5678', 'efgh9012'].join('');
const retained = (error) =>
  `${JSON.stringify(error)} ${productionFailureMessage(error)}`;

test('known credentials remain redacted across more than 64 separator characters', () => {
  const value = knownValue();
  const error = new NativeUploadError(
    {
      stderr: `[ERROR] bad ${value.slice(0, 12)}${' '.repeat(200)}${value.slice(12)}`,
    },
    [value]
  );
  assert.equal(retained(error).includes(value.slice(0, 12)), false);
  assert.equal(retained(error).includes(value.slice(12)), false);
});

test('clipping an unknown credential removes its short trailing fragment', () => {
  const value = ['abcdefgh', '12345678', 'ABCDEFGH', '90123456'].join('');
  const message = `[ERROR] ${' '.repeat(4065)}${value}`;
  for (const stderr of [
    message,
    JSON.stringify({ errors: [{ code: 10021, message }] }),
  ]) {
    const error = new NativeUploadError({ stderr });
    assert.equal(retained(error).includes(value.slice(0, 12)), false);
    const kept =
      error.uploadFailure.headline ?? error.uploadFailure.cfErrors[0].message;
    assert.equal(kept.trim(), '[ERROR]');
  }
});

test('a known credential split by ANSI at the line boundary leaves no fragment', () => {
  const value = knownValue();
  const error = new NativeUploadError(
    {
      stderr: `[ERROR] ${' '.repeat(4072)}${value.slice(0, 12)}\x1b[0m${value.slice(12)}`,
    },
    [value]
  );
  assert.equal(retained(error).includes(value.slice(0, 12)), false);
  assert.equal(retained(error).includes(value.slice(12)), false);
});

test('decoded provider ANSI needs the second known-value scrub', () => {
  const value = knownValue();
  const error = new NativeUploadError(
    {
      stderr: JSON.stringify({
        errors: [
          {
            code: 10021,
            message: `bad ${value.slice(0, 12)}\x1b[0m ${value.slice(12)}`,
          },
        ],
      }),
    },
    [value]
  );
  assert.equal(error.uploadFailure.cfErrors[0].code, 10021);
  assert.equal(retained(error).includes(value.slice(0, 12)), false);
  assert.equal(retained(error).includes(value.slice(12)), false);
});

test('per-line clipping excludes diagnostic markers beyond the analysis budget', () => {
  const error = new NativeUploadError({
    stderr: `[ERROR] visible${' '.repeat(5000)} [code: 10021]`,
  });
  assert.equal(error.uploadFailure.cfCode, null);
  assert.equal(error.uploadFailure.cfErrors, undefined);
  assert.equal(error.uploadFailure.headline.trim(), '[ERROR] visible');
});

test('decoded provider messages have their own analysis budget', () => {
  const error = new NativeUploadError({
    stderr: JSON.stringify({
      errors: [
        { code: 10021, message: `visible${' '.repeat(5000)}omitted-tail` },
      ],
    }),
  });
  assert.equal(error.uploadFailure.cfErrors[0].message.trim(), 'visible');
  assert.equal(retained(error).includes('omitted-tail'), false);
});

for (const separator of ['\n  \x1b[2m│\x1b[22m ', ' [code: 1]\x1b[0m\n │ '])
  test(`coloured display wraps retain no known-value fragments: ${JSON.stringify(separator)}`, () => {
    const value = knownValue();
    const error = new NativeUploadError(
      {
        stderr: `[ERROR] bad ${value.slice(0, 12)}${separator}${value.slice(12)}`,
      },
      [value]
    );
    assert.equal(retained(error).includes(value.slice(0, 12)), false);
    assert.equal(retained(error).includes(value.slice(12)), false);
  });

test('escaped JSON credential-key wrappers hide short values', () => {
  const error = new NativeUploadError({
    stderr: '[ERROR] {\\"token\\":\\"short-value\\"}',
  });
  assert.equal(retained(error).includes('short-value'), false);
});

for (const input of ['string', 'Buffer'])
  for (const known of [true, false])
    test(`${input} capture boundary drops a partial ${known ? 'known' : 'unknown'} token`, () => {
      const value = ['abcdefgh', '12345678', 'ABCDEFGH', '90123456'].join('');
      const count = 1024 * 1024 - '[ERROR] '.length - 20;
      const prefix =
        ' \n'.repeat(Math.floor(count / 2)) + ' '.repeat(count % 2);
      const text = `${prefix}[ERROR] ${value}`;
      for (const size of [text.length, 1024 * 1024]) {
        const stderr =
          input === 'Buffer'
            ? Buffer.from(text).subarray(0, size)
            : text.slice(0, size);
        const error = new NativeUploadError({ stderr }, known ? [value] : []);
        assert.equal(retained(error).includes(value.slice(0, 12)), false);
        assert.equal(error.uploadFailure.headline.trim(), '[ERROR]');
      }
    });

test('line clipping preserves a complete token when the following character is a delimiter', () => {
  const message = `visible${' '.repeat(4084)}whole trailing`;
  const error = new NativeUploadError({
    stderr: JSON.stringify({ errors: [{ code: 10021, message }] }),
  });
  assert.equal(error.uploadFailure.cfErrors[0].message.trim(), 'visible whole');
});

test('one MiB with code markers and hostile space runs stays below one second', () => {
  const moduleUrl = new URL('./wave1-native-upload-error.mjs', import.meta.url)
    .href;
  const code = `
    import assert from 'node:assert/strict';
    import { NativeUploadError, productionFailureMessage } from ${JSON.stringify(moduleUrl)};
    const variants = [
      ' '.repeat(4080) + '[code: 1]x\\n',
      'a' + ' '.repeat(4070) + '[code: 1]x\\n',
      'accepted' + ' '.repeat(4070) + '[code: 1]\\n',
      'a'.repeat(4095) + ' x\\n',
    ];
    const reports = [];
    for (const [variant, line] of variants.entries()) {
      const prefix = '[ERROR] visible\\n';
      const input = (prefix + line.repeat(Math.ceil(1024 * 1024 / line.length)))
        .slice(0, 1024 * 1024);
      assert.equal(Buffer.byteLength(input), 1024 * 1024);
      const times = [];
      for (let i = 0; i < 3; i++) {
        const start = performance.now();
        const error = new NativeUploadError({ stderr: input });
        const receipt = JSON.stringify(error);
        const log = productionFailureMessage(error);
        const elapsed = performance.now() - start;
        assert.equal(error.uploadFailure.cfCode, variant === 3 ? null : 1);
        if (variant < 2 || variant === 3) {
          assert.equal(error.uploadFailure.cfErrors, undefined);
          assert.equal(error.uploadFailure.headline, '[ERROR] visible');
        } else {
          assert.equal(error.uploadFailure.cfErrors.length, 8);
          assert.equal(error.uploadFailure.cfErrors[0].message, 'accepted');
        }
        assert.ok(receipt.length > 0 && log.length > 0);
        assert.ok(elapsed < 1000, 'Code-marker diagnostic exceeded 1000 ms: ' + elapsed);
        times.push(elapsed);
      }
      reports.push({ variant, inputBytes: Buffer.byteLength(input), elapsedMs: times });
    }
    console.log(JSON.stringify(reports));
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
    'Code-marker diagnostic exceeded bounded lifetime'
  );
  assert.equal(result.status, 0, result.stderr);
  const reports = JSON.parse(result.stdout);
  assert.equal(reports.length, 4);
  assert.ok(
    reports.every((report) => report.elapsedMs.every((ms) => ms < 1000))
  );
  console.log(JSON.stringify(reports));
});
