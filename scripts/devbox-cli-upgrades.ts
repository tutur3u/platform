import { spawn } from 'node:child_process';
import { mkdir, readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { acquireUpgradeLock } from '../packages/sdk/src/cli/devbox-upgrade-lock.ts';

interface Runner {
  id: string;
  name: string;
  status: string;
  last_heartbeat_at: string | null;
  capabilities?: { cli?: { version?: string }; os?: { hostname?: string } };
}
interface Snapshot {
  runners: Runner[];
  runs: { runner_id: string | null; status: string }[];
  leases?: { runner_id: string | null; status: string }[];
}
const stable = /^\d+\.\d+\.\d+$/u;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
function compare(a: string, b: string) {
  const left = a.split('.').map(Number);
  const right = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if (left[i] !== right[i]) return left[i]! - right[i]!;
  }
  return 0;
}

export function planUpgrades(
  snapshot: Snapshot,
  ids: string[],
  latest: string,
  now: number
) {
  if (!stable.test(latest))
    throw new Error('Registry latest is not a stable release');
  return snapshot.runners.filter((runner) => {
    const version = runner.capabilities?.cli?.version;
    const host = runner.capabilities?.os?.hostname?.trim();
    if (!host) return false;
    const peers = snapshot.runners
      .filter(
        (row) =>
          row.id === runner.id ||
          (host && row.capabilities?.os?.hostname?.trim() === host)
      )
      .map((row) => row.id);
    const age = now - Date.parse(runner.last_heartbeat_at ?? '');
    return (
      snapshot.runners.length < 50 &&
      snapshot.runs.length < 50 &&
      (snapshot.leases?.length ?? 0) < 50 &&
      !snapshot.leases?.some(
        (lease) =>
          lease.runner_id !== null &&
          peers.includes(lease.runner_id) &&
          lease.status === 'active'
      ) &&
      ids.includes(runner.id) &&
      runner.status === 'online' &&
      age >= 0 &&
      age < 60_000 &&
      version &&
      stable.test(version) &&
      compare(version, latest) < 0 &&
      !snapshot.runs.some(
        (run) =>
          run.runner_id !== null &&
          peers.includes(run.runner_id) &&
          ['queued', 'claimed', 'running'].includes(run.status)
      )
    );
  });
}

async function cli(args: string[]) {
  return new Promise<Record<string, unknown>>((resolve, reject) => {
    const child = spawn(
      // biome-ignore lint/suspicious/noUndeclaredEnvVars: standalone operator script, never a cached Turbo task.
      process.env.TUTURUUU_UPGRADE_CLI ?? 'ttr',
      [...args, '--json', '--no-update-check'],
      {
        shell: false,
        stdio: ['ignore', 'pipe', 'ignore'],
      }
    );
    let output = '';
    const timer = setTimeout(() => child.kill('SIGKILL'), 11 * 60_000);
    child.stdout.on('data', (data) => {
      output = (output + String(data)).slice(-1_048_576);
    });
    child.on('error', () => {
      clearTimeout(timer);
      reject(new Error('CLI could not start'));
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) return reject(new Error(`CLI command failed (${code})`));
      try {
        resolve(JSON.parse(output));
      } catch {
        reject(new Error('CLI returned invalid JSON'));
      }
    });
  });
}

async function main() {
  const args = process.argv.slice(2);
  const ids = args.flatMap((arg, i) =>
    arg === '--runner' ? [args[i + 1] ?? ''] : []
  );
  if (!ids.length || ids.some((id) => !uuid.test(id)))
    throw new Error('Pass explicit --runner UUIDs');
  const directory = join(homedir(), '.tuturuuu', 'devbox-upgrades');
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const lock = join(directory, 'fleet.lock');
  const release = await acquireUpgradeLock(lock);
  if (!release) {
    console.log(
      'Another upgrade check holds the lock, or its ownership requires inspection'
    );
    return;
  }
  try {
    // Let the installed CLI refresh its existing session before reading it.
    const actor = await cli(['whoami']);
    if (
      actor.baseUrl !== 'https://tuturuuu.com' ||
      typeof actor.configPath !== 'string'
    )
      throw new Error('Expected a production CLI session');
    const snapshot = async () => {
      const config = JSON.parse(
        await readFile(actor.configPath as string, 'utf8')
      );
      if (
        config.baseUrl !== 'https://tuturuuu.com' ||
        !config.session?.accessToken
      )
        throw new Error('Missing production session');
      const response = await fetch(
        'https://infrastructure.tuturuuu.com/api/v1/infrastructure/devboxes',
        {
          headers: { Authorization: `Bearer ${config.session.accessToken}` },
          signal: AbortSignal.timeout(15_000),
          redirect: 'error',
        }
      );
      if (!response.ok)
        throw new Error(`Infrastructure snapshot failed (${response.status})`);
      return (await response.json()) as Snapshot;
    };
    const registry = await fetch('https://registry.npmjs.org/tuturuuu/latest', {
      signal: AbortSignal.timeout(5000),
      redirect: 'error',
    });
    if (!registry.ok) throw new Error('Registry unavailable');
    const { version } = (await registry.json()) as { version: string };
    const initial = await snapshot();
    const candidates = planUpgrades(initial, ids, version, Date.now());
    console.log(
      JSON.stringify({
        latest: version,
        apply: args.includes('--apply'),
        snapshotTruncated:
          initial.runners.length >= 50 ||
          initial.runs.length >= 50 ||
          (initial.leases?.length ?? 0) >= 50,
        candidates: candidates.map(({ id, name }) => ({ id, name })),
      })
    );
    if (!args.includes('--apply')) return;
    for (const runner of candidates) {
      // Re-check each runner so queued work and earlier upgrades take precedence.
      if (
        !planUpgrades(await snapshot(), [runner.id], version, Date.now()).length
      )
        continue;
      const result = await cli(['box', 'upgrade', '--runner', runner.id]);
      const run = result.run as {
        id: string;
        status: string;
        exitCode?: number;
      };
      console.log(
        JSON.stringify({
          runner: runner.id,
          runId: run?.id,
          status: run?.status,
          exitCode: run?.exitCode,
        })
      );
      if (run?.status !== 'succeeded' || run.exitCode !== 0)
        throw new Error('Upgrade run did not succeed');
      let verified = false;
      for (let attempt = 0; attempt < 24; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 5000));
        const fresh = (await snapshot()).runners.find(
          ({ id }) => id === runner.id
        );
        const actual = fresh?.capabilities?.cli?.version;
        const age = Date.now() - Date.parse(fresh?.last_heartbeat_at ?? '');
        if (
          actual &&
          stable.test(actual) &&
          compare(actual, version) >= 0 &&
          age >= 0 &&
          age < 60_000
        ) {
          verified = true;
          break;
        }
      }
      if (!verified)
        throw new Error(
          'CLI update completed but a fresh upgraded heartbeat was not verified'
        );
      console.log(
        JSON.stringify({ runner: runner.id, heartbeatVerified: true })
      );
    }
  } finally {
    await release();
  }
}

if (import.meta.main)
  main().catch((error) => {
    console.error(
      error instanceof Error ? error.message : 'Devbox upgrade check failed'
    );
    process.exitCode = 1;
  });
