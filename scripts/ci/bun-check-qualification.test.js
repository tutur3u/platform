const test = require('node:test');
const assert = require('node:assert/strict');
const {
  checkerArgs,
  parseArgs,
  compare,
} = require('./bun-check-qualification.js');

test('native invocation bypasses scripts, caps threads and disables diagnostic grouping', () => {
  assert.deepEqual(
    checkerArgs('bun', 'packages/types/tsconfig.build.json', 6),
    [
      'check',
      '--no-script',
      '--no-pretty',
      '--all',
      '--threads',
      '6',
      '-p',
      'packages/types/tsconfig.build.json',
      '--noEmit',
      '--incremental',
      'false',
      '--composite',
      'false',
    ]
  );
});

test('qualification requires output and a finite admitted budget', () => {
  assert.throws(() => parseArgs([]), /--out/);
  for (const threads of ['0', '9', 'NaN'])
    assert.throws(
      () => parseArgs(['--out', '/tmp/evidence', '--threads', threads]),
      /threads/
    );
  assert.equal(parseArgs(['--out', '/tmp/evidence']).runs, 5);
});

test('parity compares messages, multiplicity, exits and crashes', () => {
  const diagnostic = {
    file: 'src/invalid.ts',
    line: 1,
    column: 1,
    category: 'error',
    code: 2322,
    message: 'bad assignment',
  };
  const result = {
    diagnostics: [diagnostic],
    exitCode: 1,
    signal: null,
    failedWithoutDiagnostics: false,
  };
  assert.equal(compare(result, { ...result, exitCode: 2 }).parity, true);
  assert.equal(
    compare(result, { ...result, diagnostics: [diagnostic, diagnostic] })
      .parity,
    false
  );
  assert.equal(compare(result, { ...result, exitCode: 0 }).parity, false);
  const crash = {
    diagnostics: [],
    exitCode: 1,
    signal: 'SIGKILL',
    failedWithoutDiagnostics: true,
  };
  assert.equal(compare(crash, crash).parity, false);
  assert.equal(
    compare(result, {
      ...result,
      diagnostics: [{ ...diagnostic, message: 'different' }],
    }).parity,
    false
  );
});
