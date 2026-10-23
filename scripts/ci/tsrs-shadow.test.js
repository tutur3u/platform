const test = require('node:test');
const assert = require('node:assert/strict');

const {
  DEFAULT_PROJECTS,
  annotationsFor,
  compareProject,
  parseArgs,
  summaryTable,
} = require('./tsrs-shadow.js');

const SAMPLE = [
  "src/a.ts(1,45): error TS2307: Cannot find module '@tuturuuu/types' or its corresponding type declarations.",
  "src/b.ts(10,5): error TS2322: Type 'string' is not assignable to type 'number'.",
  "  Type 'string' is not assignable to type 'number'.",
  "error TS6059: File '/repo/apps/web/src/x.ts' is not under 'rootDir'.",
  '',
].join('\n');

test('parseArgs defaults to the parity-qualified project list', () => {
  const options = parseArgs([]);
  assert.deepEqual(options.projects, DEFAULT_PROJECTS);
  assert.equal(options.failOnDiff, false);
  const custom = parseArgs([
    '--project',
    'packages/ui/tsconfig.typecheck.json',
    '--tsrs',
    '/bin/tsrs',
    '--annotate',
  ]);
  assert.deepEqual(custom.projects, ['packages/ui/tsconfig.typecheck.json']);
  assert.equal(custom.tsrs, '/bin/tsrs');
  assert.equal(custom.annotate, true);
  assert.throws(() => parseArgs(['--bogus']), /Unknown argument/);
  assert.throws(() => parseArgs(['--json']), /Missing value/);
});

function fakeSpawn(outputs) {
  const calls = [];
  const spawn = (command, args) => {
    calls.push([command, ...args]);
    const binary = args.find((arg) => outputs[arg]) ?? command;
    return outputs[binary];
  };
  return { calls, spawn };
}

test('compareProject reports parity, mismatches and annotations', () => {
  const { spawn } = fakeSpawn({
    tsc: { status: 2, stdout: SAMPLE, stderr: '' },
    tsrs: {
      status: 2,
      stdout: SAMPLE.split('\n').slice(1).join('\n'),
      stderr: '',
    },
  });
  const result = compareProject('apps/web/tsconfig.json', {
    tsc: 'tsc',
    tsrs: 'tsrs',
    spawn,
    timer: null,
  });
  assert.equal(result.parity, false);
  assert.equal(result.onlyTsc.length, 1);
  assert.deepEqual(result.onlyTsrs, []);
  const [annotation] = annotationsFor(result);
  assert.match(
    annotation,
    /^::warning file=src\/a\.ts,line=1,col=45,title=tsrs shadow \(tsc only\)::/
  );
  assert.match(
    summaryTable([result]),
    /\| `apps\/web\/tsconfig.json` .*\| NO \|/
  );
});

test('compareProject treats differing success status as a mismatch', () => {
  const { spawn } = fakeSpawn({
    tsc: { status: 0, stdout: '', stderr: '' },
    tsrs: { status: 1, stdout: '', stderr: '' },
  });
  const result = compareProject('packages/types/tsconfig.build.json', {
    tsc: 'tsc',
    tsrs: 'tsrs',
    spawn,
    timer: null,
  });
  assert.equal(result.parity, false);
  assert.equal(result.tsrs.crashed, true);
  assert.match(annotationsFor(result)[0], /without diagnostics/);
});
