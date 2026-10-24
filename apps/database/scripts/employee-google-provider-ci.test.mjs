import assert from 'node:assert/strict';
import { execFile, execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';
import {
  createDockerExecutor,
  finalizeGoogleProviderCI,
  googleProviderImages,
  prepareGoogleProviderCI,
  runGoogleProviderCI,
  selectGoogleProvider,
} from './employee-google-provider-ci.mjs';
import {
  assertGoogleProviderResourcesAbsent,
  cleanupGoogleProvider,
} from './fixtures/employee-address-migration/provider-cleanup.ts';

const head = 'a'.repeat(40);
function fixture(t, mode = '') {
  const receiptDirectory = mkdtempSync(
    path.join(os.tmpdir(), 'google-provider-ci-test-')
  );
  t.after(() => rmSync(receiptDirectory, { recursive: true, force: true }));
  const env = {
    EMPLOYEE_SCHEMA_SOURCE_SHA: head,
    EMPLOYEE_SCHEMA_CONTROL_SHA: head,
    EMPLOYEE_SCHEMA_INCLUDE_GOOGLE_DESTINATION_PROVIDER: 'true',
    EMPLOYEE_SCHEMA_INCLUDE_ADDRESS_MIGRATION: 'true',
    GITHUB_ACTIONS: 'true',
    GITHUB_RUN_ID: '123',
    GITHUB_RUN_ATTEMPT: '1',
    GITHUB_REPOSITORY: 'fixture/repository',
    RUNNER_NAME: 'fixture-runner',
    RUNNER_OS: 'Linux',
    PATH: '/fixture/bin',
    GITHUB_TOKEN: 'must-not-forward-fixture-secret',
  };
  const options = {
    env,
    sourceRoot: '/fixture/source',
    controlRoot: '/fixture/control',
    receiptDirectory,
  };
  const calls = [];
  const dependencies = {
    platform: 'linux',
    git: (_root, args) => (args[0] === 'status' ? '' : head),
    docker: async (args) => {
      calls.push(args);
      if (args[0] === 'context')
        return {
          stdout:
            args[1] === 'show'
              ? 'default\n'
              : JSON.stringify('unix:///var/run/docker.sock'),
        };
      if (args[0] === 'info')
        return {
          stdout: JSON.stringify({
            OSType: mode === 'wrong-daemon' ? 'windows' : 'linux',
          }),
        };
      if (args[0] === 'image')
        return {
          stdout: JSON.stringify([
            {
              Id: `sha256:${'b'.repeat(64)}`,
              Os: 'linux',
              Architecture: 'amd64',
            },
          ]),
        };
      return { stdout: '' };
    },
    resources: {
      assertGoogleProviderResourcesAbsent: async () => {
        calls.push(['assert-absent']);
      },
      cleanupGoogleProvider: async () => {
        calls.push(['cleanup']);
        return { absent: mode !== 'cleanup-failure' };
      },
    },
    run: async (command, args, settings) => {
      calls.push(['run', command, ...args]);
      assert.equal(settings.cwd, options.sourceRoot);
      assert.equal(settings.timeoutMs, 360000);
      assert.equal(settings.env.GITHUB_TOKEN, undefined);
      const suffix = settings.env.EMPLOYEE_GOOGLE_PROVIDER_FIXTURE_ID;
      const prefix = `employee-gotrue-${suffix}`;
      return {
        status: mode === 'child-failure' ? 1 : 0,
        signal: null,
        timedOut: mode === 'timeout',
        processGroupStopped: mode !== 'survivor',
        stdout: [
          {
            stage: 'google_destination_provider',
            qualification: 'PASS',
            fixtureId: mode === 'other-run' ? 'wrong' : suffix,
            migrationPuts: 1,
            preservationNegativeControls: mode === 'missing-controls' ? 0 : 4,
            preservedSessionRows: mode === 'empty-sessions' ? 0 : 1,
            preservedRefreshRows: mode === 'empty-tokens' ? 0 : 1,
            actualGoTrue: true,
            googleClaims: 'SQL_SEEDED_FIXTURE',
            identityTransition: 'ONE_VERIFIED_EMAIL_ADDITION',
            lostAcknowledgement: 'INSPECT_NO_REPLAY',
          },
          {
            cleanup: {
              absent: true,
              containers: [`${prefix}-auth`, `${prefix}-db`],
              network: prefix,
            },
          },
        ]
          .map((row) => JSON.stringify(row))
          .join('\n'),
      };
    },
  };
  return {
    options,
    dependencies,
    calls,
    receipt: () =>
      JSON.parse(
        readFileSync(
          path.join(receiptDirectory, 'google-provider.json'),
          'utf8'
        )
      ),
  };
}
test('Google provider selection is default-off and requires address migration', () => {
  assert.equal(selectGoogleProvider(undefined, undefined), false);
  assert.equal(selectGoogleProvider('false', 'true'), false);
  assert.equal(selectGoogleProvider('true', 'true'), true);
  assert.throws(() => selectGoogleProvider('true', 'false'));
  assert.throws(() => selectGoogleProvider('yes', 'true'));
});
test('a bound provider receipt qualifies only after required observations and independent cleanup', async (t) => {
  const f = fixture(t);
  const result = await runGoogleProviderCI(f.options, f.dependencies);
  assert.equal(result.qualified, true);
  assert.equal(f.receipt().runId, '123');
  assert.equal(f.receipt().sourceSha, head);
  assert.equal(f.receipt().images.length, 2);
  assert.deepEqual(
    f.calls.filter((row) => row[0] === 'pull').map((row) => row[1]),
    googleProviderImages
  );
  assert.equal(f.calls.filter((row) => row[0] === 'run').length, 1);
  assert.equal(f.calls.at(-1)[0], 'cleanup');
  assert.equal(await finalizeGoogleProviderCI(f.options, f.dependencies), true);
});
for (const mode of [
  'empty-sessions',
  'empty-tokens',
  'missing-controls',
  'other-run',
  'timeout',
  'survivor',
  'child-failure',
  'cleanup-failure',
]) {
  test(`retains durable failure and cleanup for ${mode}`, async (t) => {
    const f = fixture(t, mode);
    const result = await runGoogleProviderCI(f.options, f.dependencies);
    assert.equal(result.qualified, false);
    assert.equal(f.receipt().status, 'failed');
    assert.equal(f.calls.filter((row) => row[0] === 'run').length, 1);
    assert.equal(f.calls.at(-1)[0], 'cleanup');
    assert.equal(
      await finalizeGoogleProviderCI(f.options, f.dependencies),
      false
    );
  });
}
test('incomplete upstream execution cannot turn a prepared receipt into success', async (t) => {
  const f = fixture(t);
  prepareGoogleProviderCI(f.options, f.dependencies.git);
  assert.equal(
    await finalizeGoogleProviderCI(f.options, f.dependencies),
    false
  );
  assert.equal(f.receipt().status, 'failed');
  assert.equal(f.receipt().qualified, false);
});
test('different source/control fails before daemon or provider work with a run-bound receipt', async (t) => {
  const f = fixture(t);
  f.options.env.EMPLOYEE_SCHEMA_CONTROL_SHA = 'c'.repeat(40);
  await assert.rejects(runGoogleProviderCI(f.options, f.dependencies));
  assert.equal(f.calls.length, 0);
  assert.equal(f.receipt().runId, '123');
  assert.equal(f.receipt().qualified, false);
  assert.equal(f.receipt().failure, 'selection_or_binding');
});
test('wrong daemon cannot pull images or launch a provider', async (t) => {
  const f = fixture(t, 'wrong-daemon');
  assert.equal(
    (await runGoogleProviderCI(f.options, f.dependencies)).qualified,
    false
  );
  assert.equal(
    f.calls.filter((row) => ['pull', 'run'].includes(row[0])).length,
    0
  );
});

test('remote Docker overrides fail before images or provider work', async (t) => {
  const f = fixture(t);
  f.options.env.DOCKER_HOST = 'tcp://unadmitted.invalid:2375';
  assert.equal(
    (await runGoogleProviderCI(f.options, f.dependencies)).qualified,
    false
  );
  assert.equal(
    f.calls.filter((row) => ['pull', 'run'].includes(row[0])).length,
    0
  );
});

const fixtureId = '11111111-1111-4111-8111-111111111111';
test('production synchronous Docker adapter feeds actual absence parser and cleanup', async () => {
  let commands = 0;
  const execute = createDockerExecutor((command, args, settings) => {
    assert.equal(command, 'docker');
    assert.equal(args[1], 'inspect');
    assert.equal(settings.encoding, 'utf8');
    commands++;
    return execFileSync(
      process.execPath,
      [
        '-e',
        'process.stderr.write(process.argv[1]);process.exit(1)',
        `Error: No such ${args[0]}: ${args[2]}\n`,
      ],
      settings
    );
  });
  await assertGoogleProviderResourcesAbsent(execute, fixtureId);
  assert.equal((await cleanupGoogleProvider(execute, fixtureId)).absent, true);
  assert.equal(commands, 7);
});
for (const failure of [
  { status: 1, signal: 'SIGTERM' },
  { status: null, signal: 'SIGKILL' },
  { status: 1, signal: null, code: 'ETIMEDOUT' },
  { status: 1, signal: null, killed: true },
  { status: 1, signal: null, timedOut: true },
  { status: 1 },
  { status: 2, signal: null },
  { status: '1', signal: null },
]) {
  test(`sync adapter never treats unknown exit ${JSON.stringify(failure)} as absence`, async () => {
    const execute = createDockerExecutor((_command, args) => {
      throw Object.assign(new Error('synthetic subprocess failure'), {
        stderr: `Error: No such ${args[0]}: ${args[2]}\n`,
        ...failure,
      });
    });
    await assert.rejects(
      assertGoogleProviderResourcesAbsent(execute, fixtureId),
      /cleanup_inspect_unknown/
    );
  });
}
test('ordinary synchronous exit1 with unknown stderr stays unknown', async () => {
  const execute = createDockerExecutor(() => {
    throw Object.assign(new Error('daemon down'), {
      status: 1,
      signal: null,
      stderr: 'Cannot connect to the Docker daemon',
    });
  });
  await assert.rejects(
    assertGoogleProviderResourcesAbsent(execute, fixtureId),
    /cleanup_inspect_unknown/
  );
});
function persist(f, name, value) {
  writeFileSync(
    path.join(f.options.receiptDirectory, name),
    JSON.stringify(value)
  );
}
function intentFor(receipt) {
  return Object.fromEntries(
    [
      'version',
      'sourceSha',
      'controlSha',
      'repository',
      'runId',
      'runAttempt',
      'fixtureId',
    ].map((key) => [key, receipt[key]])
  );
}
for (const status of ['completed', 'failed']) {
  test(`same run ${status} cannot be prepared or execute a replacement provider`, async (t) => {
    const f = fixture(t, status === 'failed' ? 'child-failure' : '');
    await runGoogleProviderCI(f.options, f.dependencies);
    const before = f.receipt();
    assert.equal(before.status, status);
    const calls = f.calls.length;
    assert.throws(() => prepareGoogleProviderCI(f.options, f.dependencies.git));
    await assert.rejects(runGoogleProviderCI(f.options, f.dependencies));
    assert.deepEqual(f.receipt(), before);
    assert.equal(f.calls.length, calls);
    assert.equal(f.calls.filter(([kind]) => kind === 'run').length, 1);
  });
}
test('concurrent same-tuple reentry while provider is running preserves original UUID and intent', async (t) => {
  const f = fixture(t);
  const run = f.dependencies.run;
  f.dependencies.run = async (...args) => {
    const before = f.receipt();
    assert.equal(before.status, 'started');
    assert.throws(() => prepareGoogleProviderCI(f.options, f.dependencies.git));
    await assert.rejects(runGoogleProviderCI(f.options, f.dependencies));
    assert.deepEqual(f.receipt(), before);
    return run(...args);
  };
  assert.equal(
    (await runGoogleProviderCI(f.options, f.dependencies)).qualified,
    true
  );
  assert.equal(f.calls.filter(([kind]) => kind === 'run').length, 1);
});
test('persisted intent blocks crash-gap replay even while receipt is still prepared', async (t) => {
  const f = fixture(t);
  prepareGoogleProviderCI(f.options, f.dependencies.git);
  const before = f.receipt();
  persist(f, 'google-provider-execution.json', intentFor(before));
  await assert.rejects(runGoogleProviderCI(f.options, f.dependencies));
  assert.deepEqual(f.receipt(), before);
  assert.equal(f.calls.length, 0);
  assert.equal(
    await finalizeGoogleProviderCI(f.options, f.dependencies),
    false
  );
  assert.equal(f.receipt().fixtureId, before.fixtureId);
  assert.equal(f.receipt().qualified, false);
  assert.equal(f.calls.filter(([kind]) => kind === 'run').length, 0);
});
for (const mode of ['', 'cleanup-failure']) {
  test(`interrupted started receipt recovers original UUID cleanup without replay: ${mode || 'absent'}`, async (t) => {
    const f = fixture(t, mode);
    // Establish real controller-shaped host/intent, then restore its persisted
    // provider-phase snapshot to model a different process resuming after death.
    let interrupted;
    const run = f.dependencies.run;
    f.dependencies.run = async (...args) => {
      interrupted = f.receipt();
      return run(...args);
    };
    await runGoogleProviderCI(f.options, f.dependencies);
    persist(f, 'google-provider.json', interrupted);
    const cleanup = f.dependencies.resources.cleanupGoogleProvider;
    f.dependencies.resources.cleanupGoogleProvider = async (
      execute,
      suffix
    ) => {
      assert.equal(suffix, interrupted.fixtureId);
      return cleanup(execute, suffix);
    };
    const calls = f.calls.filter(([kind]) => kind === 'run').length;
    await assert.rejects(runGoogleProviderCI(f.options, f.dependencies));
    assert.equal(
      await finalizeGoogleProviderCI(f.options, f.dependencies),
      false
    );
    const recovered = f.receipt();
    assert.equal(recovered.fixtureId, interrupted.fixtureId);
    assert.equal(recovered.failure, 'interrupted_provider_outcome_unknown');
    assert.equal(
      recovered.recovery.cleanupSucceeded,
      mode !== 'cleanup-failure'
    );
    assert.equal(recovered.primarySucceeded, false);
    assert.equal(recovered.processGroupStopped, false);
    assert.equal(recovered.qualified, false);
    assert.equal(f.calls.filter(([kind]) => kind === 'run').length, calls);
    const afterCleanupCalls = f.calls.length;
    assert.equal(
      await finalizeGoogleProviderCI(f.options, f.dependencies),
      false
    );
    assert.equal(f.calls.length, afterCleanupCalls);
    assert.deepEqual(f.receipt(), recovered);
    assert.throws(() => prepareGoogleProviderCI(f.options, f.dependencies.git));
    await assert.rejects(runGoogleProviderCI(f.options, f.dependencies));
  });
}
test('failed outcome survives cleanup recovery and foreign run/attempt cannot replace it', async (t) => {
  const f = fixture(t, 'child-failure');
  await runGoogleProviderCI(f.options, f.dependencies);
  const before = f.receipt();
  f.options.env.GITHUB_RUN_ATTEMPT = '2';
  assert.equal(
    await finalizeGoogleProviderCI(f.options, f.dependencies),
    false
  );
  assert.deepEqual(f.receipt(), before);
  await assert.rejects(runGoogleProviderCI(f.options, f.dependencies));
  assert.throws(() => prepareGoogleProviderCI(f.options, f.dependencies.git));
  assert.deepEqual(f.receipt(), before);
  f.options.env.GITHUB_RUN_ATTEMPT = '1';
  assert.equal(
    await finalizeGoogleProviderCI(f.options, f.dependencies),
    false
  );
  assert.equal(f.receipt().failure, before.failure);
  assert.equal(f.receipt().fixtureId, before.fixtureId);
  assert.equal(f.receipt().qualified, false);
});

test('separate controller killed during provider work recovers persisted ownership and never relaunches', async (t) => {
  const f = fixture(t);
  const witness = path.join(
    f.options.receiptDirectory,
    'provider-entered.json'
  );
  const controller = new URL(
    './employee-google-provider-ci.mjs',
    import.meta.url
  ).href;
  const script = `
    import {runGoogleProviderCI} from ${JSON.stringify(controller)};
    import {writeFileSync} from 'node:fs';
    const options = JSON.parse(process.argv[1]);
    await runGoogleProviderCI(options, {
      platform: 'linux',
      git: (_root, args) => args[0] === 'status' ? '' : options.env.EMPLOYEE_SCHEMA_SOURCE_SHA,
      docker: async (args) => ({stdout:
        args[0] === 'context' ? args[1] === 'show' ? 'default' : JSON.stringify('unix:///var/run/docker.sock') :
        args[0] === 'info' ? JSON.stringify({OSType:'linux'}) :
        args[0] === 'image' ? JSON.stringify([{Id:'sha256:'+'b'.repeat(64),Os:'linux',Architecture:'amd64'}]) : ''}),
      resources: {assertGoogleProviderResourcesAbsent: async () => {},
        cleanupGoogleProvider: async () => {throw new Error('must not reach finally after SIGKILL')}},
      run: async (_command, _args, settings) => {
        writeFileSync(${JSON.stringify(witness)}, JSON.stringify({
          fixtureId:settings.env.EMPLOYEE_GOOGLE_PROVIDER_FIXTURE_ID, providerEntries:1}));
        process.kill(process.pid, 'SIGKILL');
      }
    });`;
  assert.throws(
    () =>
      execFileSync(
        process.execPath,
        ['--input-type=module', '-e', script, JSON.stringify(f.options)],
        { stdio: 'pipe', timeout: 10000 }
      ),
    (error) => error.signal === 'SIGKILL' && error.status === null
  );
  const entered = JSON.parse(readFileSync(witness, 'utf8'));
  const interrupted = f.receipt();
  assert.equal(interrupted.status, 'started');
  assert.equal(interrupted.phase, 'provider');
  assert.equal(interrupted.fixtureId, entered.fixtureId);
  assert.equal(interrupted.primarySucceeded, false);
  assert.throws(() => prepareGoogleProviderCI(f.options, f.dependencies.git));
  await assert.rejects(runGoogleProviderCI(f.options, f.dependencies));
  assert.deepEqual(f.receipt(), interrupted);
  f.dependencies.resources.cleanupGoogleProvider = async (_execute, suffix) => {
    assert.equal(suffix, entered.fixtureId);
    f.calls.push(['cleanup', suffix]);
    return {
      absent: true,
      containers: [
        `employee-gotrue-${suffix}-auth`,
        `employee-gotrue-${suffix}-db`,
      ],
      network: `employee-gotrue-${suffix}`,
      volumes: [],
    };
  };
  assert.equal(
    await finalizeGoogleProviderCI(f.options, f.dependencies),
    false
  );
  const recovered = f.receipt();
  assert.equal(recovered.failure, 'interrupted_provider_outcome_unknown');
  assert.equal(recovered.fixtureId, entered.fixtureId);
  assert.equal(recovered.recovery.cleanupSucceeded, true);
  assert.equal(recovered.recovery.cleanup.absent, true);
  assert.equal(recovered.primarySucceeded, false);
  assert.equal(recovered.processGroupStopped, false);
  assert.equal(recovered.qualified, false);
  assert.equal(f.calls.filter(([kind]) => kind === 'cleanup').length, 1);
  assert.equal(f.calls.filter(([kind]) => kind === 'run').length, 0);
  assert.deepEqual(JSON.parse(readFileSync(witness, 'utf8')), entered);
  assert.equal(
    await finalizeGoogleProviderCI(f.options, f.dependencies),
    false
  );
  assert.deepEqual(f.receipt(), recovered);
  assert.equal(f.calls.filter(([kind]) => kind === 'cleanup').length, 1);
});

test('unchanged async Docker error code remains compatible with shared absence parser', async () => {
  const execute = async (args) =>
    promisify(execFile)(
      process.execPath,
      [
        '-e',
        'process.stderr.write(process.argv[1]);process.exit(1)',
        `Error: No such ${args[0]}: ${args[2]}\n`,
      ],
      { encoding: 'utf8', timeout: 10000 }
    );
  await assertGoogleProviderResourcesAbsent(execute, fixtureId);
});
for (const failure of ['signal', 'timeout', 'spawn']) {
  test(`real synchronous ${failure} cannot be parsed as resource absence`, async () => {
    const execute = createDockerExecutor((_command, args, settings) => {
      if (failure === 'spawn')
        return execFileSync(
          '/nonexistent-google-provider-test-binary',
          [],
          settings
        );
      return execFileSync(
        process.execPath,
        [
          '-e',
          failure === 'signal'
            ? 'process.stderr.write(process.argv[1]);process.kill(process.pid,"SIGTERM")'
            : 'setInterval(()=>{},1000)',
          `Error: No such ${args[0]}: ${args[2]}\n`,
        ],
        { ...settings, timeout: failure === 'timeout' ? 20 : 10000 }
      );
    });
    await assert.rejects(
      assertGoogleProviderResourcesAbsent(execute, fixtureId),
      /cleanup_inspect_unknown/
    );
  });
}
for (const foreign of [false, true]) {
  test(`recovery passes persisted UUID through actual cleanup ownership checks: foreign=${foreign}`, async (t) => {
    const f = fixture(t, 'child-failure');
    await runGoogleProviderCI(f.options, f.dependencies);
    const before = f.receipt();
    const suffix = before.fixtureId;
    const prefix = `employee-gotrue-${suffix}`;
    const resources = new Map([
      [
        `${prefix}-auth`,
        {
          Id: 'owned-auth',
          Name: `/${prefix}-auth`,
          Config: {
            Labels: {
              'employee-gotrue-qualification': foreign ? fixtureId : suffix,
            },
          },
          Mounts: [],
        },
      ],
      [
        `${prefix}-db`,
        {
          Id: 'owned-db',
          Name: `/${prefix}-db`,
          Config: {
            Labels: {
              'employee-gotrue-qualification': suffix,
            },
          },
          Mounts: [],
        },
      ],
      [
        prefix,
        {
          Id: 'owned-network',
          Labels: { 'employee-gotrue-qualification': suffix },
        },
      ],
    ]);
    const commands = [];
    const daemon = f.dependencies.docker;
    f.dependencies.docker = async (args) => {
      if (args[0] === 'context' || args[0] === 'info') return daemon(args);
      commands.push(args);
      if (args[1] === 'inspect') {
        const value = resources.get(args[2]);
        if (value) return { stdout: JSON.stringify([value]) };
        throw { code: 1, stderr: `Error: No such ${args[0]}: ${args[2]}` };
      }
      const id = args[0] === 'rm' ? args[3] : args[2];
      for (const [key, value] of resources)
        if (value.Id === id) resources.delete(key);
      return { stdout: '' };
    };
    f.dependencies.resources = { cleanupGoogleProvider };
    assert.equal(
      await finalizeGoogleProviderCI(f.options, f.dependencies),
      false
    );
    const recovered = f.receipt();
    assert.equal(recovered.failure, before.failure);
    assert.equal(recovered.recovery.cleanupSucceeded, !foreign);
    assert.equal(recovered.recovery.cleanup.network, prefix);
    assert.equal(recovered.fixtureId, suffix);
    assert.equal(recovered.qualified, false);
    assert.equal(resources.has(`${prefix}-auth`), foreign);
    assert.equal(
      commands.some((args) => args[0] === 'rm' && args[3] === 'owned-auth'),
      !foreign
    );
    assert.equal(f.calls.filter(([kind]) => kind === 'run').length, 1);
  });
}

test('repeat preparation preserves the initial UUID and permits only its first execution', async (t) => {
  const f = fixture(t);
  prepareGoogleProviderCI(f.options, f.dependencies.git);
  const prepared = f.receipt();
  assert.throws(() => prepareGoogleProviderCI(f.options, f.dependencies.git));
  assert.deepEqual(f.receipt(), prepared);
  const result = await runGoogleProviderCI(f.options, f.dependencies);
  assert.equal(result.fixtureId, prepared.fixtureId);
  assert.equal(result.qualified, true);
  assert.equal(f.calls.filter(([kind]) => kind === 'run').length, 1);
});
test('malformed existing receipt is preserved rather than replaced with a fresh fixture', async (t) => {
  const f = fixture(t);
  const file = path.join(f.options.receiptDirectory, 'google-provider.json');
  writeFileSync(file, '{interrupted-invalid-receipt');
  assert.throws(() => prepareGoogleProviderCI(f.options, f.dependencies.git));
  await assert.rejects(runGoogleProviderCI(f.options, f.dependencies));
  assert.equal(
    await finalizeGoogleProviderCI(f.options, f.dependencies),
    false
  );
  assert.equal(readFileSync(file, 'utf8'), '{interrupted-invalid-receipt');
  assert.equal(f.calls.length, 0);
});

test('CI controller boundary contracts use installed exact source before provider work', () => {
  const workflow = readFileSync(
    new URL(
      '../../../.github/workflows/employee-schema-contract.yaml',
      import.meta.url
    ),
    'utf8'
  );
  const prepare = workflow.indexOf(
    '      - name: Bind optional Google provider qualification'
  );
  const install = workflow.indexOf(
    '      - name: Install exact source dependencies'
  );
  const contracts = workflow.indexOf(
    '      - name: Verify optional Google provider receipt gates'
  );
  const provider = workflow.indexOf(
    '      - name: Qualify optional Google destination provider'
  );
  assert.ok(
    prepare >= 0 &&
      prepare < install &&
      install < contracts &&
      contracts < provider
  );
  const step = workflow.slice(
    contracts,
    workflow.indexOf('      - name:', contracts + 1)
  );
  assert.match(step, /if: inputs.include_google_destination_provider == true/);
  assert.match(
    step,
    /working-directory: source\n {8}run: node --test apps\/database\/scripts\/employee-google-provider-ci.test.mjs/
  );
  assert.match(workflow, /EMPLOYEE_SCHEMA_CONTROL_SHA: \$\{\{ github.sha \}\}/);
  // The source checkout is the dispatched commit (source == control).
  assert.match(workflow, /ref: \$\{\{ github.sha \}\}\n {10}path: source/);
  assert.doesNotMatch(workflow, /ref: \$\{\{ inputs\./);
});
