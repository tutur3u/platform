import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const planner = require('./test-shards.js');
const root = resolve(import.meta.dirname, '../..');
const source = await readFile(
  join(root, 'scripts/ci/run-test-shard.js'),
  'utf8'
);
const focused = [
  'x',
  '--no-install',
  'vitest',
  'run',
  '--config',
  'vitest.native-auth.config.ts',
  '--maxWorkers=1',
  '--coverage',
  '--coverage.reportsDirectory=coverage/native-auth',
];

async function workspace(t, meetWeight) {
  const directory = await mkdtemp(join(tmpdir(), 'meet-coverage-runner-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await mkdir(join(directory, 'apps'));
  await mkdir(join(directory, 'packages'));
  let other = 0;
  for (const weight of [4, 3, 2, 1]) {
    const meet = weight === meetWeight;
    const name = meet ? 'meet' : `other-${other++}`;
    const folder = join(directory, meet ? 'apps' : 'packages', name);
    await mkdir(folder);
    await writeFile(
      join(folder, 'package.json'),
      JSON.stringify({
        name: meet ? '@tuturuuu/meet' : `@fixture/${name}`,
        scripts: { test: 'vitest run' },
      })
    );
    for (let i = 0; i < weight; i++)
      await writeFile(join(folder, `${i}.test.js`), '');
  }
  return directory;
}

function execute(directory, args, results = [], text = source) {
  const calls = [],
    output = [],
    env = { FIXTURE: 'command-sink' };
  const process = { argv: ['node', 'run-test-shard.js', ...args], env };
  let error;
  try {
    new vm.Script(text, { filename: 'run-test-shard.js' }).runInNewContext({
      __dirname: join(directory, 'scripts/ci'),
      process,
      console: { log: (line) => output.push(JSON.parse(line)) },
      require(id) {
        if (id === 'node:child_process')
          return {
            spawnSync(command, commandArgs, options) {
              calls.push({
                command,
                args: Array.from(commandArgs),
                cwd: options.cwd,
                stdio: options.stdio,
                sameEnvironment: options.env === env,
              });
              return results[calls.length - 1] ?? { status: 0 };
            },
          };
        if (id === './test-shards.js') return planner;
        return require(id);
      },
    });
  } catch (caught) {
    error = caught;
  }
  return { calls, output, error, status: process.exitCode };
}

for (const meetWeight of [4, 3, 2, 1])
  test(`runner follows dynamic Meet ownership at weight ${meetWeight} in all modes and shards`, async (t) => {
    const directory = await workspace(t, meetWeight);
    const shards = planner.planShards(planner.discoverPackages(directory), 4);
    assert.equal(
      shards.findIndex((shard) => shard.packages.includes('@tuturuuu/meet')),
      4 - meetWeight
    );
    for (let index = 0; index < 4; index++) {
      for (const mode of [undefined, '--coverage', '--plan']) {
        const result = execute(directory, [
          String(index),
          '4',
          ...(mode ? [mode] : []),
        ]);
        assert.equal(result.error, undefined);
        assert.equal(result.output.length, 1);
        assert.deepEqual(result.output[0], {
          shard: index,
          total: 4,
          ...shards[index],
        });
        if (mode === '--plan') {
          assert.deepEqual(result.calls, []);
          assert.equal(result.status, undefined);
          continue;
        }
        const ordinary = result.calls[0];
        assert.equal(ordinary.command, 'bun');
        assert.deepEqual(
          ordinary.args,
          planner.commandForShard(shards, index, mode === '--coverage')
        );
        assert.equal(ordinary.cwd, directory);
        assert.equal(ordinary.stdio, 'inherit');
        assert.equal(ordinary.sameEnvironment, true);
        const owns = shards[index].packages.includes('@tuturuuu/meet');
        assert.equal(
          result.calls.length,
          mode === '--coverage' && owns ? 2 : 1
        );
        if (result.calls.length === 2) {
          assert.equal(result.calls[1].command, 'bun');
          assert.deepEqual(result.calls[1].args, focused);
          assert.equal(result.calls[1].cwd, join(directory, 'apps/meet'));
          assert.equal(result.calls[1].stdio, 'inherit');
          assert.equal(result.calls[1].sameEnvironment, true);
        }
        assert.equal(result.status, 0);
      }
    }
  });

for (const failure of [
  { status: 17 },
  { status: null, signal: 'SIGTERM' },
  { status: null, signal: null },
  { error: new Error('ordinary spawn failure') },
])
  test(`ordinary failure ${failure.error ? 'spawn' : (failure.status ?? failure.signal ?? 'null')} prevents focused coverage and retains outcome`, async (t) => {
    const directory = await workspace(t, 4);
    const result = execute(directory, ['0', '4', '--coverage'], [failure]);
    assert.equal(result.calls.length, 1);
    if (failure.error) assert.equal(result.error, failure.error);
    else {
      assert.equal(result.error, undefined);
      assert.equal(result.status, failure.status ?? 1);
    }
  });

for (const failure of [
  { status: 23 },
  { status: null, signal: 'SIGTERM' },
  { status: null, signal: null },
  { error: new Error('focused spawn failure') },
])
  test(`focused failure ${failure.error ? 'spawn' : (failure.status ?? failure.signal ?? 'null')} retains its outcome after ordinary success`, async (t) => {
    const directory = await workspace(t, 4);
    const result = execute(
      directory,
      ['0', '4', '--coverage'],
      [{ status: 0 }, failure]
    );
    assert.equal(result.calls.length, 2);
    if (failure.error) assert.equal(result.error, failure.error);
    else {
      assert.equal(result.error, undefined);
      assert.equal(result.status, failure.status ?? 1);
    }
  });

for (const args of [
  ['0', '4', '--other'],
  ['4', '4', '--coverage'],
  ['bad', '4'],
  ['0', '0'],
])
  test(`invalid runner arguments ${args.join(' ')} cannot dispatch`, async (t) => {
    const directory = await workspace(t, 4);
    const result = execute(directory, args);
    assert.ok(result.error);
    assert.deepEqual(result.calls, []);
  });

test('omitting the Meet focused invocation fails the required dispatch contract', async (t) => {
  const directory = await workspace(t, 4);
  const omitted = source.replace(
    "packages.includes('@tuturuuu/meet')",
    "packages.includes('@fixture/omitted')"
  );
  assert.notEqual(omitted, source);
  const result = execute(directory, ['0', '4', '--coverage'], [], omitted);
  assert.equal(result.status, 0);
  assert.equal(result.calls.length, 1);
  assert.throws(() => assert.deepEqual(result.calls[1]?.args, focused));
});
