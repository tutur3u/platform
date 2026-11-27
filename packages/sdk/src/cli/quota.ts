import { execFile } from 'node:child_process';
import { hostname } from 'node:os';
import { resolve } from 'node:path';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const hosts = ['skr-studio', 'skr-macbook1', 'skr-macbook-i9'];

const remoteCollector =
  'cd ~/Documents/GitHub/tuturuuu && "$HOME/.bun/bin/bun" packages/agent-quota/src/cli.ts';

function sshArgs(host: string, command: string) {
  return ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=4', host, command];
}

async function collectorJson(
  command: string,
  args: string[]
): Promise<unknown> {
  const { stdout } = await exec(command, args, {
    timeout: 20_000,
    maxBuffer: 4 * 1024 * 1024,
  });
  return JSON.parse(stdout);
}

async function snapshot(command: string, args: string[]) {
  const result = await collectorJson(command, args);
  if (
    !result ||
    typeof result !== 'object' ||
    !('observedAt' in result) ||
    typeof result.observedAt !== 'string' ||
    !Number.isFinite(Date.parse(result.observedAt))
  )
    throw new Error('Invalid host quota snapshot.');
  if ('seats' in result && Array.isArray(result.seats))
    return {
      ...result,
      seats: result.seats,
      schema: 'per-instance',
      alerts: 'alerts' in result ? result.alerts : undefined,
    };
  if ('accounts' in result && Array.isArray(result.accounts))
    return {
      ...result,
      seats: result.accounts,
      schema: 'legacy-account-pools',
      alerts: undefined,
    };
  throw new Error('Host quota snapshot has no seat data.');
}

async function githubRateLimit() {
  try {
    const { stdout } = await exec(
      'gh',
      [
        'api',
        'rate_limit',
        '--jq',
        '.resources.core | {remaining,limit,reset}',
      ],
      { timeout: 5000, maxBuffer: 4096 }
    );
    const usage = JSON.parse(stdout);
    if (
      Number.isInteger(usage.remaining) &&
      Number.isInteger(usage.limit) &&
      Number.isInteger(usage.reset)
    ) {
      return {
        remaining: usage.remaining,
        limit: usage.limit,
        resetsAt: new Date(usage.reset * 1000).toISOString(),
      };
    }
  } catch {
    // An unavailable GitHub reading is independent of provider quota.
  }
  return null;
}

async function pickSeat(collector: string, args: string[]) {
  const flags = new Set([
    '--role',
    '--model-class',
    '--author-instance',
    '--model',
    '--provider',
  ]);
  const forwarded: string[] = [];
  let preferredMachine: string | undefined;
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index];
    const value = args[index + 1];
    if (!flag || !value || !/^[A-Za-z0-9_./-]{1,128}$/.test(value))
      throw new Error('Invalid quota seat selection argument.');
    if (flag === '--preferred-machine' && hosts.includes(value)) {
      preferredMachine = value;
    } else if (flags.has(flag)) {
      forwarded.push(flag, value);
    } else {
      throw new Error('Unsupported quota seat selection option.');
    }
  }
  const machine = preferredMachine ?? hostname();
  const result = preferredMachine
    ? await collectorJson(
        'ssh',
        sshArgs(
          preferredMachine,
          [remoteCollector, 'pick-seat', ...forwarded].join(' ')
        )
      )
    : await collectorJson('bun', [collector, 'pick-seat', ...forwarded]);
  if (!result || typeof result !== 'object' || !('seat' in result))
    throw new Error('Invalid seat selection response.');
  console.log(JSON.stringify({ ...result, machine }));
}

export async function runQuotaCommand(args: string[]): Promise<void> {
  const collector =
    process.env.TTR_QUOTA_COLLECTOR ??
    resolve('packages/agent-quota/src/cli.ts');
  if (args[0] === 'pick-seat') {
    await pickSeat(collector, args.slice(1));
    return;
  }
  if (
    args[0] !== 'status' ||
    args.slice(1).some((arg) => !['--local', '--json'].includes(arg))
  )
    throw new Error(
      'Usage: ttr quota status [--local] [--json] or ttr quota pick-seat [--preferred-machine HOST] [--role ROLE] [--model-class PREFIX] [--author-instance ID]'
    );
  const local = snapshot('bun', [collector, 'status', '--json']);
  if (args.includes('--local')) {
    console.log(JSON.stringify(await local));
    return;
  }
  const remote = hosts.map(async (host) => {
    try {
      const usage = await snapshot(
        'ssh',
        sshArgs(host, `${remoteCollector} status --json`)
      );
      return { host, status: 'available', usage };
    } catch (error) {
      const status =
        error &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === 255
          ? 'unreachable'
          : 'collection-failed';
      return { host, status };
    }
  });
  const github = githubRateLimit();
  const results = await Promise.all([
    local.then(
      (usage) => ({ host: hostname(), status: 'available', usage }),
      () => ({
        host: hostname(),
        status: 'collection-failed',
        usage: undefined,
      })
    ),
    ...remote,
  ]);
  const githubCore = await github;
  if (results.every((result) => result.status !== 'available'))
    process.exitCode = 1;
  if (args.includes('--json')) {
    console.log(
      JSON.stringify(
        { observedAt: new Date().toISOString(), hosts: results, githubCore },
        null,
        2
      )
    );
    return;
  }
  console.log('| Host | Status | Entries | Alerts |');
  console.log('| --- | --- | ---: | --- |');
  for (const result of results) {
    const alerts = result.usage?.alerts ?? [];
    const summary = Array.isArray(alerts)
      ? alerts
          .filter((alert) => typeof alert === 'string')
          .join(', ')
          .replaceAll('|', '\\|')
      : '';
    console.log(
      `| ${result.host} | ${result.usage?.schema === 'legacy-account-pools' ? 'available (legacy pools)' : result.status} | ${result.usage?.seats.length ?? 0} | ${summary} |`
    );
  }
  console.log(
    githubCore
      ? `GitHub core API remaining ${githubCore.remaining}/${githubCore.limit}`
      : 'GitHub core API quota unknown'
  );
}
