import { createHash, randomUUID } from 'node:crypto';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  statfsSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  chooseAvailablePortBlock,
  deriveIsolatedIdentity,
  isPortAvailable,
  METADATA_FILE,
  readLifecycleMetadata,
  removeDisposableRoot,
  stageDisposableProject,
} from '../../scripts/run-supabase-isolated.js';
import {
  APPROVED_TYPEGEN_OUTPUT,
  validateTypegenOutputPath,
} from '../../scripts/run-supabase-isolated-typegen.js';
import {
  assertSyntheticCliEnvironment,
  createSyntheticCliContext,
} from './cli-environment.mjs';
import { runHostedCommand } from './hosted-command.mjs';
import {
  CliProbeFailure,
  resolveHostedNativeCli,
  runCliProbe,
  verificationFailureStatus,
} from './native-cli.mjs';
import { verifyNetworkPolicy } from './network-policy.mjs';
import { runOwnedProcess } from './process-group.mjs';

export function typegenOutputForRepository(repositoryRoot) {
  return validateTypegenOutputPath(repositoryRoot, APPROVED_TYPEGEN_OUTPUT);
}

export const limits = Object.freeze({
  executionMs: 25 * 60_000,
  cleanupMs: 3 * 60_000,
  commandMs: 5_000,
  initialFreeBytes: 14 * 1024 ** 3,
  minimumFreeBytes: 8 * 1024 ** 3,
  maximumDiskGrowthBytes: 10 * 1024 ** 3,
  memoryBytes: 6 * 1024 ** 3,
  cpus: 2,
});
export function assertDisk(initial, current) {
  if (
    initial < limits.initialFreeBytes ||
    current < limits.minimumFreeBytes ||
    initial - current > limits.maximumDiskGrowthBytes
  ) {
    throw new Error('Hosted disposable disk budget exceeded');
  }
}
export function ownedNames(names, projectId) {
  if (!/^tt-[a-z0-9-]+$/.test(projectId))
    throw new Error('Invalid project identity');
  return names.filter(
    (name) => name.startsWith('supabase_') && name.endsWith(`_${projectId}`)
  );
}
const repo = process.cwd();
const helper = path.join(
  repo,
  'apps/database/scripts/run-supabase-isolated.js'
);
const output = path.join(
  process.env.RUNNER_TEMP ?? os.tmpdir(),
  'supabase-typegen-review'
);
const statePath = path.join(output, 'state.json');
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
export function command(
  binary,
  args,
  timeout = limits.commandMs,
  maxBuffer = 4 * 1024 ** 2,
  {
    nativeBinary = configuredNativeBinary,
    context = syntheticCliContext,
    execute,
    repositoryRoot = repo,
  } = {}
) {
  // Git selects its source explicitly while the subprocess stays in admitted cwd.
  return runHostedCommand(
    binary,
    binary === 'git' ? ['-C', repositoryRoot, ...args] : args,
    {
      context: context(nativeBinary),
      execute,
      timeout,
      maxBuffer,
    }
  ).catch((error) => {
    if (error instanceof CliProbeFailure) {
      const phase =
        {
          docker: 'docker-command',
          git: 'git-command',
          sudo:
            {
              cat: 'policy-daemon',
              bpftool: 'policy-kernel',
              systemctl: 'policy-slice',
              iptables: 'policy-firewall',
              ip6tables: 'policy-firewall',
            }[args[1]] ?? 'policy-command',
        }[binary] ?? 'command';
      throw new CliProbeFailure(phase, error.outcome);
    }
    throw error;
  });
}
function checkNetworkPolicy() {
  return verifyNetworkPolicy((args) =>
    command('sudo', ['-n', ...args], limits.commandMs, 1024 ** 2)
  );
}

function freeBytes() {
  const disk = statfsSync(repo);
  return disk.bavail * disk.bsize;
}
async function names(kind) {
  const args = {
    container: ['ps', '-a', '--format', '{{.Names}}'],
    volume: ['volume', 'ls', '--format', '{{.Name}}'],
    network: ['network', 'ls', '--format', '{{.Name}}'],
  }[kind];
  if (!args) throw new Error('Unknown inventory kind');
  return (await command('docker', args)).split('\n').filter(Boolean);
}

function readState() {
  return JSON.parse(readFileSync(statePath, 'utf8'));
}
function saveState(state) {
  const temporary = `${statePath}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporary, `${JSON.stringify(state, null, 2)}\n`, {
      flag: 'wx',
    });
    renameSync(temporary, statePath);
  } finally {
    rmSync(temporary, { force: true });
  }
}
function assertHosted() {
  if (
    process.env.GITHUB_ACTIONS !== 'true' ||
    process.platform !== 'linux' ||
    !process.env.SUPABASE_CLI_BINARY_OVERRIDE
  ) {
    throw new Error(
      'Requires isolated Linux GitHub runner and explicit pinned CLI'
    );
  }
}
async function migrationFingerprint() {
  const files = (
    await command('git', ['ls-files', 'apps/database/supabase/migrations'])
  )
    .split('\n')
    .filter(Boolean)
    .sort();
  return hash(
    files.map((file) => `${file}\0${hash(readFileSync(file))}`).join('\n')
  );
}
let configuredNativeBinary;
export function configureNativeCli({
  env = process.env,
  resolver = resolveHostedNativeCli,
} = {}) {
  const binary = resolver(env.SUPABASE_CLI_BINARY_OVERRIDE);
  env.SUPABASE_CLI_BINARY_OVERRIDE = binary;
  if (env === process.env) configuredNativeBinary = binary;
  return binary;
}
function lifecycleTemporaryRoot(outputRoot = output) {
  if (existsSync(outputRoot) && lstatSync(outputRoot).isSymbolicLink())
    throw new Error('Hosted helper context unavailable');
  mkdirSync(outputRoot, { recursive: true, mode: 0o700 });
  const root = path.join(realpathSync(outputRoot), 'lifecycle-tmp');
  // Use the same private, admitted temp root in staging and unchanged helper processes.
  const safe = createSyntheticCliContext({
    root,
    nativeBinary: configuredNativeBinary ?? process.execPath,
  });
  return safe.env.TMPDIR;
}
function readOwnedMetadata(root) {
  return readLifecycleMetadata(root, {
    temporaryRoot: lifecycleTemporaryRoot(),
  });
}
export function syntheticCliContext(
  nativeBinary,
  workdir,
  { outputRoot = output } = {}
) {
  if (existsSync(outputRoot) && lstatSync(outputRoot).isSymbolicLink())
    throw new Error('Hosted helper context unavailable');
  mkdirSync(outputRoot, { recursive: true, mode: 0o700 });
  return createSyntheticCliContext({
    root: path.join(outputRoot, `cli-isolation-${randomUUID()}`),
    nativeBinary,
    temporaryRoot: workdir ? lifecycleTemporaryRoot(outputRoot) : undefined,
    workdir,
  });
}
export async function runHostedHelper(
  binary,
  args,
  options,
  {
    nativeBinary = configuredNativeBinary,
    context = syntheticCliContext,
    runner = runOwnedProcess,
  } = {}
) {
  if (!nativeBinary || !['--resume', '--cleanup'].includes(args[1]))
    throw new Error('Hosted helper context unavailable');
  const safe = context(nativeBinary, args[2]);
  assertSyntheticCliEnvironment(safe.env, safe.cwd);
  await runner(binary, args, { ...options, env: safe.env, cwd: safe.cwd });
}
export async function prepare({
  hosted = assertHosted,
  existingState = () => existsSync(statePath),
  configure = configureNativeCli,
  inventory = names,
  disk = freeBytes,
  context = syntheticCliContext,
  probe = runCliProbe,
  commandRunner = command,
  repositoryRoot = repo,
  ports = chooseAvailablePortBlock,
  fingerprint = migrationFingerprint,
  policy = checkNetworkPolicy,
  createOutput = () => mkdirSync(output, { recursive: true }),
  stage = stageAndRecord,
  temporaryRoot = lifecycleTemporaryRoot,
} = {}) {
  hosted();
  if (existingState()) throw new Error('Refusing existing lifecycle state');
  const binary = configure();
  if (
    (await inventory('container')).length ||
    (await inventory('volume')).length
  )
    throw new Error('Requires empty dedicated Docker runner');
  if (
    (await inventory('network')).some(
      (name) => !['bridge', 'host', 'none'].includes(name)
    )
  )
    throw new Error('Requires runner without custom Docker networks');
  const free = disk();
  assertDisk(free, free);
  const cliContext = context(binary);
  const cliVersion = await probe(binary, ['--version'], {
    ...cliContext,
    phase: 'cli-version',
    timeoutMs: limits.commandMs,
  });
  const expectedVersion = JSON.parse(
    readFileSync('apps/database/package.json', 'utf8')
  ).devDependencies.supabase;
  if (cliVersion !== expectedVersion)
    throw new Error('Supabase CLI pin mismatch');
  const services = JSON.parse(
    await probe(binary, ['services', '-o', 'json'], {
      ...cliContext,
      phase: 'cli-services',
      timeoutMs: limits.commandMs,
    })
  );
  const headSha = await commandRunner('git', ['rev-parse', 'HEAD']);
  const trackedFiles = (
    await commandRunner('git', [
      'ls-files',
      '-z',
      '--',
      'apps/database/supabase',
    ])
  )
    .split('\0')
    .filter(Boolean);
  const identity = deriveIsolatedIdentity({
    headSha,
    repositoryPath: path.join(
      repositoryRoot,
      `run-${process.env.GITHUB_RUN_ID}-${process.env.GITHUB_RUN_ATTEMPT}`
    ),
  });
  const block = await ports(identity);
  console.info('Programming preparation checkpoint=policy-validation');
  const policyIdentity = await policy();
  const fields = {
    cliVersion,
    services,
    limits,
    initialFreeBytes: free,
    minimumFreeBytesObserved: free,
    migrationFingerprint: await fingerprint(),
    network: policyIdentity,
    images: {},
    runSucceeded: false,
    cleanupVerified: false,
  };
  createOutput();
  console.info('Programming preparation checkpoint=project-staging');
  return stage(
    {
      basePort: block.basePort,
      headSha,
      projectId: identity.projectId,
      repositoryRoot,
      typegenOutput: typegenOutputForRepository(repositoryRoot),
      trackedFiles,
      temporaryRoot: temporaryRoot(),
    },
    fields
  );
}
export async function stageAndRecord(
  options,
  fields,
  {
    stage = stageDisposableProject,
    record = saveState,
    remove = (root) =>
      removeDisposableRoot(root, { temporaryRoot: options.temporaryRoot }),
  } = {}
) {
  let metadata;
  try {
    metadata = await stage(options);
    // No fingerprint/provenance work or directory creation after staging and
    // before this ownership write. A failed write removes this exact root.
    const state = { ...fields, metadata };
    record(state);
    return state;
  } catch (error) {
    if (metadata) {
      try {
        await remove(metadata.disposableRoot);
      } catch (cleanupError) {
        throw new AggregateError(
          [error, cleanupError],
          `Prepare failed; scoped recovery metadata remains at ${metadata.disposableRoot}`
        );
      }
    }
    throw error;
  }
}
function assertMetadata(state, metadata, repositoryRoot = repo) {
  if (
    metadata.projectId !== state.metadata.projectId ||
    metadata.disposableRoot !== state.metadata.disposableRoot ||
    metadata.repositoryRoot !== repositoryRoot ||
    metadata.headSha !== state.metadata.headSha
  ) {
    throw new Error('Lifecycle identity changed');
  }
}
export async function resumeRecordedProject(
  state,
  {
    read = readOwnedMetadata,
    runner = runHostedHelper,
    onTick,
    onDiagnostic,
    repositoryRoot = repo,
  } = {}
) {
  const metadata = await read(state.metadata.disposableRoot);
  assertMetadata(state, metadata, repositoryRoot);
  validateTypegenOutputPath(repositoryRoot, metadata.typegenOutput);
  if (metadata.typegenOutput !== APPROVED_TYPEGEN_OUTPUT)
    throw new Error('Typegen output contract mismatch');
  await runner(
    process.execPath,
    [helper, '--resume', metadata.disposableRoot],
    {
      timeoutMs: limits.executionMs,
      onTick,
      onDiagnostic,
    }
  );
}

async function run() {
  assertHosted();
  configureNativeCli();
  const state = readState();
  await checkNetworkPolicy(); // Fail closed before the CLI can start/apply SQL.
  try {
    await resumeRecordedProject(state, {
      onDiagnostic: (kind) =>
        console.info(`Programming lifecycle diagnostic=${kind}`),
      onTick: async () => {
        if (
          existsSync(path.join(state.metadata.disposableRoot, METADATA_FILE))
        ) {
          const metadata = await readOwnedMetadata(
            state.metadata.disposableRoot
          ).catch((error) => {
            if (error.code === 'ENOENT') return {};
            throw error;
          });
          if (
            ['starting', 'resetting', 'testing', 'typegen'].includes(
              metadata.status
            ) &&
            metadata.status !== state.lifecyclePhase
          ) {
            state.lifecyclePhase = metadata.status;
            console.info(`Programming lifecycle checkpoint=${metadata.status}`);
          }
        }
        const free = freeBytes();
        state.minimumFreeBytesObserved = Math.min(
          state.minimumFreeBytesObserved,
          free
        );
        assertDisk(state.initialFreeBytes, free);
        const owned = ownedNames(
          await names('container'),
          state.metadata.projectId
        );
        if (owned.length > 32)
          throw new Error('Disposable service count budget exceeded');
        if (owned.length) {
          let inspected = [];
          try {
            inspected = JSON.parse(
              await command('docker', ['inspect', ...owned])
            );
          } catch (error) {
            // The supported helper removes containers during successful cleanup.
            if (
              ownedNames(await names('container'), state.metadata.projectId)
                .length
            )
              throw error;
          }
          for (const inspect of inspected) {
            if (inspect.HostConfig.CgroupParent !== 'tuturuuu-typegen.slice')
              throw new Error(
                'Owned container escaped aggregate resource cgroup'
              );
            state.images[inspect.Name.replace(/^\//, '')] = inspect.Image;
          }
        }
        saveState(state);
      },
    });
    state.runSucceeded = true;
  } catch (error) {
    state.runSucceeded = false;
    saveState(state);
    throw error;
  }
  saveState(state);
}

async function cleanup() {
  assertHosted();
  if (!existsSync(statePath)) {
    console.log('Programming verification phase=cleanup outcome=no-state');
    return;
  }
  configureNativeCli();
  await cleanupRecordedProject(readState());
}
export async function cleanupRecordedProject(
  state,
  {
    exists = existsSync,
    read = readOwnedMetadata,
    runner = runHostedHelper,
    inventory = names,
    portAvailable = isPortAvailable,
    record = saveState,
    repositoryRoot = repo,
  } = {}
) {
  if (exists(state.metadata.disposableRoot)) {
    const metadata = await read(state.metadata.disposableRoot);
    assertMetadata(state, metadata, repositoryRoot);
    await runner(
      process.execPath,
      [helper, '--cleanup', metadata.disposableRoot],
      {
        timeoutMs: limits.cleanupMs,
      }
    );
  }
  if (
    ownedNames(await inventory('container'), state.metadata.projectId).length ||
    ownedNames(await inventory('volume'), state.metadata.projectId).length ||
    ownedNames(await inventory('network'), state.metadata.projectId).length ||
    exists(state.metadata.disposableRoot)
  ) {
    throw new Error('Owned disposable resources remain');
  }
  const portsClosed = await Promise.all(
    Array.from({ length: 8 }, (_, index) =>
      portAvailable(state.metadata.basePort + index)
    )
  );
  if (!portsClosed.every(Boolean))
    throw new Error('Disposable port block remains occupied');
  state.cleanupVerified = true;
  record(state);
}

export function buildLocalProof(state, types) {
  if (
    !state.runSucceeded ||
    !state.cleanupVerified ||
    !Object.keys(state.images).length
  ) {
    throw new Error('No successful cleaned lifecycle proof');
  }
  const text = types.toString('utf8');
  if (!types.length || !/export type Database\s*=/.test(text)) {
    throw new Error('Generated database type declaration missing');
  }
  for (const schema of ['public', 'private', 'storage']) {
    if (!text.includes(`  ${schema}: {`))
      throw new Error('Generated schema declaration missing');
  }
  return {
    headSha: state.metadata.headSha,
    projectId: state.metadata.projectId,
    cliVersion: state.cliVersion,
    services: state.services,
    network: state.network,
    images: state.images,
    migrationFingerprint: state.migrationFingerprint,
    typesSha256: hash(types),
    typesBytes: types.length,
    schemas: ['public', 'private', 'storage'],
    limits: state.limits,
    initialFreeBytes: state.initialFreeBytes,
    minimumFreeBytesObserved: state.minimumFreeBytesObserved,
    cleanupVerified: true,
    runId: process.env.GITHUB_RUN_ID,
    runAttempt: process.env.GITHUB_RUN_ATTEMPT,
  };
}
function validate() {
  assertHosted();
  const proof = buildLocalProof(
    readState(),
    readFileSync('packages/types/src/supabase.ts')
  );
  const proofRoot = path.join(output, 'local-proof');
  mkdirSync(proofRoot, { recursive: true });
  writeFileSync(
    path.join(proofRoot, 'provenance.json'),
    `${JSON.stringify(proof, null, 2)}\n`
  );
  // Fixed status only. Neither generated declarations nor provenance/hashes are
  // copied into logs, step summaries, outputs, caches or public artifacts.
  console.log(
    'Local output validation and scoped cleanup passed; no files uploaded.'
  );
}

export async function main(mode) {
  if (mode === 'prepare') return prepare();
  if (mode === 'run') return run();
  if (mode === 'cleanup') return cleanup();
  if (mode === 'validate') return validate();
  throw new Error('Expected prepare, run, cleanup, or validate');
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    await main(process.argv[2]);
  } catch (error) {
    console.error(verificationFailureStatus(process.argv[2], error));
    process.exitCode = 1;
  }
}
