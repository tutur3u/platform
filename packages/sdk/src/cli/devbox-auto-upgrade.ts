import { spawn } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import packageJson from '../../package.json';
import { compareVersions } from './update';

export const DEVBOX_UPGRADE_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
const STABLE_VERSION = /^\d+\.\d+\.\d+$/u;

export class DevboxCliRepairRequiredError extends Error {}

async function run(command: string, args: string[]) {
  return new Promise<{ code: number; stdout: string }>((resolve, reject) => {
    let stdout = '';
    const child = spawn(command, args, {
      shell: false,
      stdio: ['ignore', 'pipe', 'ignore'],
      // Upgrade subprocesses do not need runner credentials.
      env: Object.fromEntries(
        ['PATH', 'HOME', 'BUN_INSTALL', 'TMPDIR', 'SYSTEMROOT'].flatMap(
          (key) => (process.env[key] ? [[key, process.env[key]]] : [])
        )
      ),
    });
    const timer = setTimeout(() => child.kill('SIGKILL'), 10 * 60_000);
    child.stdout.on('data', (chunk) => {
      stdout = (stdout + String(chunk)).slice(-16_384);
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? 1, stdout });
    });
  });
}

interface UpgradeState {
  checkedAt: number;
  installedVersion?: string;
}

/** Called only after this agent drains jobs; the lock serializes shared-host installs. */
export async function upgradeDevboxCliIfNeeded({
  currentVersion = packageJson.version,
  directory = join(homedir(), '.tuturuuu', 'devbox-upgrades'),
  fetchImpl = globalThis.fetch,
  now = Date.now(),
  runCommand = run,
  cliCommand = [process.execPath, process.argv[1] ?? ''],
}: {
  currentVersion?: string;
  directory?: string;
  fetchImpl?: typeof fetch;
  now?: number;
  runCommand?: typeof run;
  cliCommand?: string[];
} = {}): Promise<boolean> {
  // Source-checkout agents do not own a global install or a supervisor restart.
  if (
    !STABLE_VERSION.test(currentVersion) ||
    cliCommand.some((arg) => arg.endsWith('.ts'))
  )
    return false;
  const lock = join(directory, 'devbox-cli-upgrade.lock');
  const stateFile = join(directory, 'devbox-cli-upgrade.json');
  await mkdir(directory, { recursive: true, mode: 0o700 });
  try {
    await mkdir(lock, { mode: 0o700 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') return false;
    throw error;
  }
  try {
    let state: UpgradeState | undefined;
    try {
      state = JSON.parse(await readFile(stateFile, 'utf8'));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    const verify = async (version: string) => {
      const [command, ...args] = cliCommand;
      if (!command || args.some((arg) => !arg)) return false;
      const result = await runCommand(command, [
        ...args,
        '--version',
        '--no-update-check',
      ]);
      return result.code === 0 && result.stdout.trim() === version;
    };
    // Another runner on this host may already have upgraded the shared install.
    if (
      state?.installedVersion &&
      STABLE_VERSION.test(state.installedVersion) &&
      compareVersions(state.installedVersion, currentVersion) > 0
    ) {
      return verify(state.installedVersion);
    }
    if (
      state &&
      Number.isFinite(state.checkedAt) &&
      now >= state.checkedAt &&
      now - state.checkedAt < DEVBOX_UPGRADE_CHECK_INTERVAL_MS
    )
      return false;

    // Persist the attempt before network/install so service restarts cannot retry-loop.
    await writeFile(stateFile, JSON.stringify({ checkedAt: now }), {
      mode: 0o600,
    });
    const response = await fetchImpl(
      'https://registry.npmjs.org/tuturuuu/latest',
      {
        signal: AbortSignal.timeout(5000),
        redirect: 'error',
      }
    );
    if (!response.ok) throw new Error('CLI registry unavailable');
    const { version } = (await response.json()) as { version?: unknown };
    if (typeof version !== 'string' || !STABLE_VERSION.test(version)) {
      throw new Error('CLI registry returned an invalid stable version');
    }
    if (compareVersions(version, currentVersion) <= 0) return false;
    const result = await runCommand('bun', ['i', '-g', `tuturuuu@${version}`]);
    if (result.code !== 0 || !(await verify(version))) {
      // Restore the previous published release before continuing this agent.
      const rollback = await runCommand('bun', [
        'i',
        '-g',
        `tuturuuu@${currentVersion}`,
      ]);
      if (rollback.code !== 0 || !(await verify(currentVersion))) {
        throw new DevboxCliRepairRequiredError(
          'CLI upgrade and rollback verification failed; repair the host install'
        );
      }
      throw new Error('CLI upgrade failed; previous version restored');
    }
    await writeFile(
      stateFile,
      JSON.stringify({ checkedAt: now, installedVersion: version }),
      {
        mode: 0o600,
      }
    );
    return true;
  } finally {
    await rm(lock, { recursive: true });
  }
}
