import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { runOwnedSessionProcess } from './employee-web-session-process.mjs';

export const googleProviderImages = Object.freeze([
  'public.ecr.aws/supabase/postgres:17.11.0.004',
  'public.ecr.aws/supabase/gotrue:v2.197.0',
]);
export function selectGoogleProvider(value, addressMigration) {
  if (![undefined, 'false', 'true'].includes(value))
    throw new Error('Invalid Google provider selection');
  if (value === 'true' && addressMigration !== 'true')
    throw new Error('Google provider requires address migration qualification');
  return value === 'true';
}
function identity(env) {
  assert.match(env.EMPLOYEE_SCHEMA_SOURCE_SHA ?? '', /^[a-f0-9]{40}$/);
  assert.equal(env.EMPLOYEE_SCHEMA_CONTROL_SHA, env.EMPLOYEE_SCHEMA_SOURCE_SHA);
  assert.match(env.GITHUB_RUN_ID ?? '', /^[1-9][0-9]*$/);
  assert.match(env.GITHUB_RUN_ATTEMPT ?? '', /^[1-9][0-9]*$/);
  assert.match(env.GITHUB_REPOSITORY ?? '', /^[\w.-]+\/[\w.-]+$/);
  return {
    sourceSha: env.EMPLOYEE_SCHEMA_SOURCE_SHA,
    controlSha: env.EMPLOYEE_SCHEMA_CONTROL_SHA,
    repository: env.GITHUB_REPOSITORY,
    runId: env.GITHUB_RUN_ID,
    runAttempt: env.GITHUB_RUN_ATTEMPT,
  };
}
const git = (root, args) =>
  execFileSync('git', ['-C', root, ...args], {
    encoding: 'utf8',
    timeout: 10000,
    maxBuffer: 65536,
  }).trim();
export function createDockerExecutor(executeSync = execFileSync) {
  return async (args) => {
    try {
      return {
        stdout: executeSync('docker', args, {
          encoding: 'utf8',
          timeout: args[0] === 'pull' ? 120000 : 30000,
          maxBuffer: 256 * 1024,
          stdio: ['ignore', 'pipe', 'pipe'],
        }),
      };
    } catch (error) {
      // execFileSync reports exit status; async execFile reports numeric code.
      // Signals, spawn errors and timeouts must never become expected absence.
      if (
        Number.isInteger(error?.status) &&
        error.status > 0 &&
        error.signal === null &&
        error.code === undefined &&
        error.killed !== true &&
        error.timedOut !== true &&
        typeof error.stderr === 'string'
      ) {
        error.code = error.status;
        throw error;
      }
      throw new Error('docker_execution_unknown', { cause: error });
    }
  };
}
const docker = createDockerExecutor();
const receiptName = 'google-provider.json';
const intentName = 'google-provider-execution.json';
function readStored(directory, name = receiptName) {
  try {
    return JSON.parse(readFileSync(path.join(directory, name), 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}
function createStored(directory, name, value) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  writeFileSync(
    path.join(directory, name),
    `${JSON.stringify(value, null, 2)}\n`,
    {
      mode: 0o600,
      flag: 'wx',
    }
  );
}
function assertBinding(value, binding) {
  assert.ok(value);
  for (const [key, expected] of Object.entries(binding))
    assert.equal(value[key], expected);
  assert.equal(value.version, 1);
  assert.match(
    value.fixtureId ?? '',
    /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/
  );
}
async function resourcesFor(sourceRoot, dependencies) {
  return (
    dependencies.resources ??
    import(
      pathToFileURL(
        path.join(
          sourceRoot,
          'apps/database/scripts/fixtures/employee-address-migration/provider-cleanup.ts'
        )
      ).href
    )
  );
}
async function dockerHost(env, execute, platform) {
  assert.equal(env.GITHUB_ACTIONS, 'true');
  assert.equal(platform, 'linux');
  assert.ok(
    !env.DOCKER_HOST || env.DOCKER_HOST === 'unix:///var/run/docker.sock'
  );
  assert.ok(!env.DOCKER_CONTEXT || env.DOCKER_CONTEXT === 'default');
  assert.ok(!env.DOCKER_TLS_VERIFY);
  assert.equal((await execute(['context', 'show'])).stdout.trim(), 'default');
  const endpoint = JSON.parse(
    (
      await execute([
        'context',
        'inspect',
        'default',
        '--format',
        '{{json .Endpoints.docker.Host}}',
      ])
    ).stdout
  );
  assert.equal(endpoint, 'unix:///var/run/docker.sock');
  const daemon = JSON.parse(
    (await execute(['info', '--format', '{{json .}}'])).stdout
  );
  assert.equal(daemon.OSType, 'linux');
  return {
    processPlatform: 'linux',
    processArchitecture: process.arch,
    processHostname: os.hostname(),
    dockerEndpoint: endpoint,
    dockerName: typeof daemon.Name === 'string' ? daemon.Name : null,
    dockerServerVersion:
      typeof daemon.ServerVersion === 'string' ? daemon.ServerVersion : null,
    dockerOSType: daemon.OSType,
    runnerName: env.RUNNER_NAME ?? null,
    runnerOS: env.RUNNER_OS ?? null,
  };
}
function store(directory, value) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const file = path.join(directory, 'google-provider.json');
  const temporary = `${file}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, {
    mode: 0o600,
  });
  renameSync(temporary, file);
}
function bound(env, sourceRoot, controlRoot, readGit) {
  const binding = identity(env);
  assert.equal(readGit(sourceRoot, ['rev-parse', 'HEAD']), binding.sourceSha);
  assert.equal(readGit(controlRoot, ['rev-parse', 'HEAD']), binding.controlSha);
  assert.equal(
    readGit(sourceRoot, ['status', '--porcelain', '--untracked-files=no']),
    ''
  );
  assert.equal(
    readGit(controlRoot, ['status', '--porcelain', '--untracked-files=no']),
    ''
  );
  return binding;
}
function providerObservation(stdout, suffix) {
  const rows = stdout
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line));
  const pass = rows.filter(
    (row) => row.stage === 'google_destination_provider'
  );
  assert.equal(pass.length, 1);
  const value = pass[0];
  assert.equal(value.qualification, 'PASS');
  assert.equal(value.actualGoTrue, true);
  assert.equal(value.fixtureId, suffix);
  assert.equal(value.googleClaims, 'SQL_SEEDED_FIXTURE');
  assert.equal(value.migrationPuts, 1);
  assert.equal(value.preservationNegativeControls, 4);
  assert.equal(value.identityTransition, 'ONE_VERIFIED_EMAIL_ADDITION');
  assert.equal(value.lostAcknowledgement, 'INSPECT_NO_REPLAY');
  assert.ok(
    Number.isSafeInteger(value.preservedSessionRows) &&
      value.preservedSessionRows > 0
  );
  assert.ok(
    Number.isSafeInteger(value.preservedRefreshRows) &&
      value.preservedRefreshRows > 0
  );
  const cleanup = rows.filter((row) => row.cleanup);
  assert.equal(cleanup.length, 1);
  assert.equal(cleanup[0].cleanup.absent, true);
  const prefix = `employee-gotrue-${suffix}`;
  assert.deepEqual(cleanup[0].cleanup.containers, [
    `${prefix}-auth`,
    `${prefix}-db`,
  ]);
  assert.equal(cleanup[0].cleanup.network, prefix);
  return {
    migrationPuts: 1,
    preservedSessionRows: value.preservedSessionRows,
    preservedRefreshRows: value.preservedRefreshRows,
    googleClaims: 'SQL_SEEDED_FIXTURE',
    actualGoTrue: true,
  };
}

export function prepareGoogleProviderCI(options, readGit = git) {
  const { env, sourceRoot, controlRoot, receiptDirectory } = options;
  try {
    assert.equal(
      selectGoogleProvider(
        env.EMPLOYEE_SCHEMA_INCLUDE_GOOGLE_DESTINATION_PROVIDER,
        env.EMPLOYEE_SCHEMA_INCLUDE_ADDRESS_MIGRATION
      ),
      true
    );
    const binding = bound(env, sourceRoot, controlRoot, readGit);
    assert.equal(
      readStored(receiptDirectory),
      null,
      'Provider receipt already exists'
    );
    assert.equal(
      readStored(receiptDirectory, intentName),
      null,
      'Provider execution already claimed'
    );
    createStored(receiptDirectory, receiptName, {
      version: 1,
      ...binding,
      fixtureId: randomUUID(),
      status: 'prepared',
      qualified: false,
    });
    return binding;
  } catch (error) {
    // Initial binding failure is durable, but existing ownership is never replaced.
    if (
      readStored(receiptDirectory) === null &&
      readStored(receiptDirectory, intentName) === null
    ) {
      const safe = Object.fromEntries(
        [
          ['sourceSha', 'EMPLOYEE_SCHEMA_SOURCE_SHA', /^[a-f0-9]{40}$/],
          ['controlSha', 'EMPLOYEE_SCHEMA_CONTROL_SHA', /^[a-f0-9]{40}$/],
          ['runId', 'GITHUB_RUN_ID', /^[1-9][0-9]*$/],
          ['runAttempt', 'GITHUB_RUN_ATTEMPT', /^[1-9][0-9]*$/],
          ['repository', 'GITHUB_REPOSITORY', /^[\w.-]+\/[\w.-]+$/],
        ].map(([key, variable, pattern]) => [
          key,
          pattern.test(env[variable] ?? '') ? env[variable] : null,
        ])
      );
      createStored(receiptDirectory, receiptName, {
        version: 1,
        ...safe,
        fixtureId: randomUUID(),
        status: 'failed',
        qualified: false,
        failure: 'selection_or_binding',
      });
    }
    throw new Error('Google provider selection or binding failed', {
      cause: error,
    });
  }
}

/** Actual provider work is optional and separate from SQL/compiler acceptance.
 * No raw subprocess logs, credentials, assertions or daemon diagnostics are emitted. */
export async function runGoogleProviderCI(options, dependencies = {}) {
  const { env, sourceRoot, controlRoot, receiptDirectory } = options;
  const readGit = dependencies.git ?? git;
  const execute = dependencies.docker ?? docker;
  const run = dependencies.run ?? runOwnedSessionProcess;
  if (readStored(receiptDirectory) === null)
    prepareGoogleProviderCI(options, readGit);
  assert.equal(
    selectGoogleProvider(
      env.EMPLOYEE_SCHEMA_INCLUDE_GOOGLE_DESTINATION_PROVIDER,
      env.EMPLOYEE_SCHEMA_INCLUDE_ADDRESS_MIGRATION
    ),
    true
  );
  const binding = bound(env, sourceRoot, controlRoot, readGit);
  const prepared = readStored(receiptDirectory);
  assertBinding(prepared, binding);
  assert.equal(
    prepared.status,
    'prepared',
    'Provider execution cannot be repeated'
  );
  assert.equal(prepared.qualified, false);
  const suffix = prepared.fixtureId;
  // Immutable intent closes the crash/concurrent-entry gap before started is published.
  createStored(receiptDirectory, intentName, {
    version: 1,
    ...binding,
    fixtureId: suffix,
  });
  let resources,
    acquired = false;
  const receipt = {
    ...prepared,
    status: 'started',
    phase: 'context',
    cleanupSucceeded: false,
    primarySucceeded: false,
    processGroupStopped: false,
    images: [],
  };
  store(receiptDirectory, receipt);
  try {
    receipt.host = await dockerHost(
      env,
      execute,
      dependencies.platform ?? process.platform
    );
    store(receiptDirectory, receipt);
    resources = await resourcesFor(sourceRoot, dependencies);
    await resources.assertGoogleProviderResourcesAbsent(execute, suffix);
    receipt.phase = 'images';
    store(receiptDirectory, receipt);
    for (const image of googleProviderImages) {
      await execute(['pull', image]);
      const entries = JSON.parse(
        (await execute(['image', 'inspect', image])).stdout
      );
      assert.equal(entries.length, 1);
      assert.match(entries[0].Id ?? '', /^sha256:[a-f0-9]{64}$/);
      assert.equal(entries[0].Os, 'linux');
      receipt.images.push({
        image,
        id: entries[0].Id,
        os: entries[0].Os,
        architecture: entries[0].Architecture,
      });
    }
    acquired = true;
    receipt.phase = 'provider';
    store(receiptDirectory, receipt);
    const childEnvironment = Object.fromEntries(
      [
        'PATH',
        'HOME',
        'TMPDIR',
        'TMP',
        'TEMP',
        'DOCKER_HOST',
        'DOCKER_CONTEXT',
        'DOCKER_CONFIG',
        'XDG_RUNTIME_DIR',
        'BUN_INSTALL',
      ]
        .filter((key) => typeof env[key] === 'string')
        .map((key) => [key, env[key]])
    );
    const result = await run(
      'bun',
      [
        'apps/database/scripts/employee-address-migration-gotrue-qualification.ts',
        '--source=google-destination',
      ],
      {
        cwd: sourceRoot,
        timeoutMs: 360000,
        env: {
          ...childEnvironment,
          EMPLOYEE_GOOGLE_PROVIDER_FIXTURE_ID: suffix,
        },
      }
    );
    receipt.processGroupStopped = result.processGroupStopped === true;
    receipt.process = {
      status: result.status ?? null,
      processGroupStopped: receipt.processGroupStopped,
    };
    receipt.phase = 'readback';
    store(receiptDirectory, receipt);
    assert.equal(result.status, 0);
    // The shared helper returns null status on timeout/overflow/signal and only
    // returns zero after the owned process group has drained.
    assert.ok(result.signal === undefined || result.signal === null);
    assert.notEqual(result.timedOut, true);
    assert.equal(result.processGroupStopped, true);
    receipt.provider = providerObservation(result.stdout, suffix);
    bound(env, sourceRoot, controlRoot, readGit);
    receipt.primarySucceeded = true;
  } catch {
    receipt.failure = 'provider_preflight_execution_or_preservation';
  } finally {
    if (resources && acquired) {
      try {
        receipt.cleanup = await resources.cleanupGoogleProvider(
          execute,
          suffix
        );
        receipt.cleanupSucceeded = receipt.cleanup.absent === true;
      } catch {
        receipt.cleanupSucceeded = false;
      }
    } else receipt.cleanupSucceeded = !acquired;
    receipt.qualified =
      receipt.primarySucceeded &&
      receipt.cleanupSucceeded &&
      receipt.processGroupStopped;
    receipt.status = receipt.qualified ? 'completed' : 'failed';
    if (receipt.qualified) receipt.phase = 'completed';
    if (!receipt.qualified)
      receipt.failure ??= 'owned_cleanup_or_process_group';
    store(receiptDirectory, receipt);
  }
  return receipt;
}

export async function finalizeGoogleProviderCI(options, dependencies = {}) {
  const { env, sourceRoot, controlRoot, receiptDirectory } = options;
  let receipt, intent;
  try {
    const binding = bound(
      env,
      sourceRoot,
      controlRoot,
      dependencies.git ?? git
    );
    receipt = readStored(receiptDirectory);
    assertBinding(receipt, binding);
    intent = readStored(receiptDirectory, intentName);
    if (intent !== null) {
      assertBinding(intent, binding);
      assert.equal(intent.fixtureId, receipt.fixtureId);
    }
  } catch {
    return false;
  } // Never replace malformed or another run's evidence.
  if (
    intent &&
    receipt.status === 'completed' &&
    receipt.qualified === true &&
    receipt.cleanupSucceeded === true &&
    receipt.primarySucceeded === true &&
    receipt.processGroupStopped === true
  )
    return true;
  receipt.qualified = false;
  receipt.failure ??= intent
    ? 'interrupted_provider_outcome_unknown'
    : 'upstream_failure_or_incomplete_provider_receipt';
  receipt.status = 'failed';
  store(receiptDirectory, receipt);
  if (intent && !receipt.recovery) {
    receipt.recovery = {
      cleanupSucceeded: false,
      fixtureId: receipt.fixtureId,
    };
    store(receiptDirectory, receipt);
    try {
      const execute = dependencies.docker ?? docker;
      const host = await dockerHost(
        env,
        execute,
        dependencies.platform ?? process.platform
      );
      // No resources can have been acquired before this durable host observation.
      assert.ok(receipt.host, 'Original Docker host was never observed');
      assert.deepEqual(host, receipt.host);
      const resources = await resourcesFor(sourceRoot, dependencies);
      receipt.recovery.cleanup = await resources.cleanupGoogleProvider(
        execute,
        receipt.fixtureId
      );
      receipt.recovery.cleanupSucceeded =
        receipt.recovery.cleanup.absent === true;
    } catch {
      receipt.recovery.failure = 'owned_recovery_cleanup_unknown';
    }
    store(receiptDirectory, receipt);
  }
  // Recovery cannot establish provider success or stop evidence lost at interruption.
  return false;
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const options = {
    env: process.env,
    sourceRoot: process.cwd(),
    controlRoot: fileURLToPath(new URL('../../../', import.meta.url)),
    receiptDirectory: path.join(
      process.env.RUNNER_TEMP ?? '/tmp',
      'employee-schema-receipts'
    ),
  };
  try {
    if (process.argv[2] === '--prepare') prepareGoogleProviderCI(options);
    else if (process.argv[2] === '--finalize')
      process.exitCode = (await finalizeGoogleProviderCI(options)) ? 0 : 1;
    else
      process.exitCode = (await runGoogleProviderCI(options)).qualified ? 0 : 1;
  } catch {
    process.exitCode = 1;
    console.error(
      'Google provider qualification failed; inspect the private run-bound receipt'
    );
  }
}
