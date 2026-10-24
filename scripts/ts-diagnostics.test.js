const test = require('node:test');
const assert = require('node:assert/strict');

const {
  CHECK_FLAGS,
  compareDiagnostics,
  locationKey,
  parseDiagnostics,
  parseMaxRssBytes,
  runChecker,
  timeCommand,
} = require('./ts-diagnostics.js');

const SAMPLE = [
  "src/a.ts(1,45): error TS2307: Cannot find module '@tuturuuu/types' or its corresponding type declarations.",
  "src/b.ts(10,5): error TS2322: Type 'string' is not assignable to type 'number'.",
  "  Type 'string' is not assignable to type 'number'.",
  "error TS6059: File '/repo/apps/web/src/x.ts' is not under 'rootDir'.",
  '',
].join('\n');

test('parseDiagnostics reads located, global and continuation lines', () => {
  const diagnostics = parseDiagnostics(SAMPLE);
  assert.equal(diagnostics.length, 3);
  assert.deepEqual(
    {
      file: diagnostics[0].file,
      line: diagnostics[0].line,
      column: diagnostics[0].column,
      code: diagnostics[0].code,
    },
    { file: 'src/a.ts', line: 1, column: 45, code: 2307 }
  );
  assert.match(diagnostics[1].message, /\nType 'string' is not assignable/);
  assert.equal(diagnostics[2].file, null);
  assert.equal(diagnostics[2].code, 6059);
});

test('compareDiagnostics ignores ordering but keeps multiplicity', () => {
  const tsc = parseDiagnostics(SAMPLE);
  const reordered = [...tsc].reverse();
  assert.equal(compareDiagnostics(tsc, reordered).equal, true);

  const duplicated = [...tsc, tsc[0]];
  const result = compareDiagnostics(tsc, duplicated);
  assert.equal(result.equal, false);
  assert.equal(result.onlyActual.length, 1);
  assert.equal(result.onlyExpected.length, 0);

  const missing = compareDiagnostics(tsc, tsc.slice(1));
  assert.equal(missing.onlyExpected[0].code, 2307);
});

test('locationKey ignores message text but keeps code and position', () => {
  const [first] = parseDiagnostics(SAMPLE);
  const reworded = { ...first, message: 'printed differently' };
  assert.equal(locationKey(first), locationKey(reworded));
  assert.equal(compareDiagnostics([first], [reworded]).equal, false);
  assert.equal(
    compareDiagnostics([first], [reworded], locationKey).equal,
    true
  );
});

test('parseMaxRssBytes supports BSD and GNU time output', () => {
  assert.equal(
    parseMaxRssBytes(
      '        1.34 real\n  1459912704  maximum resident set size\n'
    ),
    1459912704
  );
  assert.equal(
    parseMaxRssBytes('\tMaximum resident set size (kbytes): 2048\n'),
    2048 * 1024
  );
  assert.equal(parseMaxRssBytes('no timing'), null);
});

test('timeCommand selects platform flags and tolerates a missing binary', () => {
  assert.deepEqual(timeCommand('darwin', () => true).args, ['-l']);
  assert.deepEqual(timeCommand('linux', () => true).args, ['-v']);
  assert.equal(
    timeCommand('linux', () => false),
    null
  );
});

test('runChecker passes no-emit flags and detects crashes', () => {
  const calls = [];
  const spawn = (command, args) => {
    calls.push([command, ...args]);
    return { status: 101, stdout: 'thread panicked', stderr: '' };
  };
  const result = runChecker('tsrs', 'apps/web/tsconfig.json', {
    spawn,
    timer: null,
  });
  assert.deepEqual(calls[0], [
    'tsrs',
    '-p',
    'apps/web/tsconfig.json',
    ...CHECK_FLAGS,
  ]);
  assert.equal(result.crashed, true);
  assert.match(result.output, /thread panicked/);
});

test('runChecker supports command prefixes and timing wrappers', () => {
  const calls = [];
  const spawn = (command, args) => {
    calls.push([command, ...args]);
    return {
      status: 2,
      stdout: SAMPLE,
      stderr: '  2048  maximum resident set size\n',
    };
  };
  const result = runChecker(
    ['ttr', 'resources', 'run', '--', 'tsc'],
    'packages/utils/tsconfig.typecheck.json',
    { spawn, timer: { binary: '/usr/bin/time', args: ['-l'] } }
  );
  assert.deepEqual(calls[0].slice(0, 7), [
    '/usr/bin/time',
    '-l',
    'ttr',
    'resources',
    'run',
    '--',
    'tsc',
  ]);
  assert.equal(result.crashed, false);
  assert.equal(result.diagnostics.length, 3);
  assert.equal(result.maxRssBytes, 2048);
});
