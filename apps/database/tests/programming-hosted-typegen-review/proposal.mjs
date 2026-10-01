import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
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
  readLifecycleMetadata,
  stageDisposableProject,
} from '../../scripts/run-supabase-isolated.js';

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
function command(binary, args, timeout = limits.commandMs) {
  return execFileSync(binary, args, {
    encoding: 'utf8',
    timeout,
    maxBuffer: 4 * 1024 ** 2,
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}
function freeBytes() {
  const disk = statfsSync(repo);
  return disk.bavail * disk.bsize;
}
function names(kind) {
  return command(
    'docker',
    kind === 'container'
      ? ['ps', '-a', '--format', '{{.Names}}']
      : ['volume', 'ls', '--format', '{{.Name}}']
  )
    .split('\n')
    .filter(Boolean);
}
function readState() {
  return JSON.parse(readFileSync(statePath, 'utf8'));
}
function saveState(state) {
  writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`);
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
function migrationFingerprint() {
  const files = command('git', [
    'ls-files',
    'apps/database/supabase/migrations',
  ])
    .split('\n')
    .filter(Boolean)
    .sort();
  return hash(
    files.map((file) => `${file}\0${hash(readFileSync(file))}`).join('\n')
  );
}
async function prepare() {
  assertHosted();
  if (existsSync(statePath))
    throw new Error('Refusing existing lifecycle state');
  if (names('container').length || names('volume').length)
    throw new Error('Requires empty dedicated Docker runner');
  const free = freeBytes();
  assertDisk(free, free);
  const binary = process.env.SUPABASE_CLI_BINARY_OVERRIDE;
  const cliVersion = command(binary, ['--version']);
  const expectedVersion = JSON.parse(
    readFileSync('apps/database/package.json', 'utf8')
  ).devDependencies.supabase;
  if (cliVersion !== expectedVersion)
    throw new Error('Supabase CLI pin mismatch');
  const services = JSON.parse(command(binary, ['services', '-o', 'json']));
  const headSha = command('git', ['rev-parse', 'HEAD']);
  const identity = deriveIsolatedIdentity({
    headSha,
    repositoryPath: path.join(
      repo,
      `run-${process.env.GITHUB_RUN_ID}-${process.env.GITHUB_RUN_ATTEMPT}`
    ),
  });
  const block = await chooseAvailablePortBlock(identity);
  const metadata = await stageDisposableProject({
    basePort: block.basePort,
    headSha,
    projectId: identity.projectId,
    repositoryRoot: repo,
    typegenOutput: path.join(repo, 'packages/types/src/supabase.ts'),
  });
  mkdirSync(output, { recursive: true });
  saveState({
    metadata,
    cliVersion,
    services,
    limits,
    initialFreeBytes: free,
    minimumFreeBytesObserved: free,
    migrationFingerprint: migrationFingerprint(),
    images: {},
    runSucceeded: false,
    cleanupVerified: false,
  });
}
async function run() {
  assertHosted();
  const state = readState();
  const metadata = await readLifecycleMetadata(state.metadata.disposableRoot);
  if (
    metadata.projectId !== state.metadata.projectId ||
    metadata.repositoryRoot !== repo
  )
    throw new Error('Lifecycle identity changed');
  const child = spawn(
    process.execPath,
    [helper, '--resume', metadata.disposableRoot],
    {
      detached: true,
      stdio: 'ignore',
      env: process.env,
    }
  );
  let failure = null;
  const abort = (reason) => {
    failure ??= reason;
    try {
      process.kill(-child.pid, 'SIGKILL');
    } catch {
      /* Already exited. */
    }
  };
  const onSignal = () => abort(new Error('Hosted execution interrupted'));
  process.once('SIGTERM', onSignal);
  process.once('SIGINT', onSignal);
  const deadline = setTimeout(
    () => abort(new Error('Hosted execution time budget exceeded')),
    limits.executionMs
  );
  const monitor = setInterval(() => {
    try {
      const free = freeBytes();
      state.minimumFreeBytesObserved = Math.min(
        state.minimumFreeBytesObserved,
        free
      );
      assertDisk(state.initialFreeBytes, free);
      const owned = ownedNames(names('container'), metadata.projectId);
      if (owned.length > 32)
        throw new Error('Disposable service count budget exceeded');
      if (owned.length) {
        let inspected = [];
        try {
          inspected = JSON.parse(command('docker', ['inspect', ...owned]));
        } catch (error) {
          // The supported helper removes containers during successful cleanup.
          if (ownedNames(names('container'), metadata.projectId).length)
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
    } catch (error) {
      abort(error);
    }
  }, 2000);
  const code = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', resolve);
  }).finally(() => {
    clearTimeout(deadline);
    clearInterval(monitor);
    process.off('SIGTERM', onSignal);
    process.off('SIGINT', onSignal);
  });
  state.runSucceeded = code === 0 && !failure;
  saveState(state);
  if (!state.runSucceeded)
    throw failure ?? new Error('Isolated lifecycle failed');
}
async function cleanup() {
  assertHosted();
  if (!existsSync(statePath)) return;
  const state = readState();
  if (existsSync(state.metadata.disposableRoot)) {
    const metadata = await readLifecycleMetadata(state.metadata.disposableRoot);
    if (
      metadata.projectId !== state.metadata.projectId ||
      metadata.repositoryRoot !== repo
    )
      throw new Error('Cleanup identity changed');
    command(
      process.execPath,
      [helper, '--cleanup', metadata.disposableRoot],
      limits.cleanupMs
    );
  }
  if (
    ownedNames(names('container'), state.metadata.projectId).length ||
    ownedNames(names('volume'), state.metadata.projectId).length ||
    existsSync(state.metadata.disposableRoot)
  ) {
    throw new Error('Owned disposable resources remain');
  }
  const portsClosed = await Promise.all(
    Array.from({ length: 8 }, (_, index) =>
      isPortAvailable(state.metadata.basePort + index)
    )
  );
  if (!portsClosed.every(Boolean))
    throw new Error('Disposable port block remains occupied');
  state.cleanupVerified = true;
  saveState(state);
}
function artifact() {
  assertHosted();
  const state = readState();
  if (
    !state.runSucceeded ||
    !state.cleanupVerified ||
    !Object.keys(state.images).length
  )
    throw new Error('No successful cleaned lifecycle proof');
  const types = readFileSync('packages/types/src/supabase.ts');
  for (const schema of ['public', 'private', 'storage']) {
    if (!types.toString().includes(`  ${schema}: {`))
      throw new Error(`Generated types missing ${schema}`);
  }
  const artifactRoot = path.join(output, 'artifact');
  mkdirSync(artifactRoot, { recursive: true });
  copyFileSync(
    'packages/types/src/supabase.ts',
    path.join(artifactRoot, 'supabase.ts')
  );
  writeFileSync(
    path.join(artifactRoot, 'provenance.json'),
    `${JSON.stringify(
      {
        headSha: state.metadata.headSha,
        projectId: state.metadata.projectId,
        cliVersion: state.cliVersion,
        services: state.services,
        images: state.images,
        migrationFingerprint: state.migrationFingerprint,
        typesSha256: hash(types),
        schemas: ['public', 'private', 'storage'],
        limits: state.limits,
        initialFreeBytes: state.initialFreeBytes,
        minimumFreeBytesObserved: state.minimumFreeBytesObserved,
        cleanupVerified: true,
        runId: process.env.GITHUB_RUN_ID,
        runAttempt: process.env.GITHUB_RUN_ATTEMPT,
      },
      null,
      2
    )}\n`
  );
}
export async function main(mode) {
  if (mode === 'prepare') return prepare();
  if (mode === 'run') return run();
  if (mode === 'cleanup') return cleanup();
  if (mode === 'artifact') return artifact();
  throw new Error('Expected prepare, run, cleanup, or artifact');
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    await main(process.argv[2]);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
