import { execFile } from 'node:child_process';
import { hostname } from 'node:os';
import { resolve } from 'node:path';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const hosts = ['skr-studio', 'skr-macbook1', 'skr-macbook-i9'];

async function snapshot(command: string, args: string[]) {
  const { stdout } = await exec(command, args, {
    timeout: 20_000,
    maxBuffer: 4 * 1024 * 1024,
  });
  const result: unknown = JSON.parse(stdout);
  if (
    !result ||
    typeof result !== 'object' ||
    !('seats' in result) ||
    !Array.isArray(result.seats) ||
    !('observedAt' in result) ||
    typeof result.observedAt !== 'string' ||
    !Number.isFinite(Date.parse(result.observedAt))
  )
    throw new Error('Invalid host quota snapshot.');
  return result;
}

async function githubRateLimit() {
  try {
    const { stdout } = await exec('gh', [
      'api', 'rate_limit', '--jq', '.resources.core | {remaining,limit,reset}',
    ], { timeout: 5000, maxBuffer: 4096 });
    const usage = JSON.parse(stdout);
    if (Number.isInteger(usage.remaining) && Number.isInteger(usage.limit) &&
        Number.isInteger(usage.reset)) {
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

export async function runQuotaCommand(args: string[]): Promise<void> {
  if (
    args[0] !== 'status' ||
    args.slice(1).some((arg) => !['--local', '--json'].includes(arg))
  )
    throw new Error('Usage: ttr quota status [--local] [--json]');
  const collector =
    process.env.TTR_QUOTA_COLLECTOR ??
    resolve('packages/agent-quota/src/cli.ts');
  const local = snapshot('bun', [collector, 'status', '--json']);
  if (args.includes('--local')) {
    console.log(JSON.stringify(await local));
    return;
  }
  const remote = hosts.map(async (host) => {
    try {
      const usage = await snapshot('ssh', [
        '-o',
        'BatchMode=yes',
        '-o',
        'ConnectTimeout=4',
        host,
        'cd ~/Documents/GitHub/tuturuuu && "$HOME/.bun/bin/bun" packages/agent-quota/src/cli.ts status --json',
      ]);
      return { host, status: 'available', usage };
    } catch (error) {
      const status =
        error && typeof error === 'object' && 'code' in error && error.code === 255
          ? 'unreachable'
          : 'collection-failed';
      return { host, status };
    }
  });
  const github = githubRateLimit();
  const results = await Promise.all([
    local.then(
      (usage) => ({ host: hostname(), status: 'available', usage }),
      () => ({ host: hostname(), status: 'collection-failed' })
    ),
    ...remote,
  ]);
  const githubCore = await github;
  if (results.every((result) => result.status !== 'available')) process.exitCode = 1;
  if (args.includes('--json')) {
    console.log(JSON.stringify({ observedAt: new Date().toISOString(), hosts: results, githubCore }, null, 2));
    return;
  }
  console.log('| Host | Status | Seats | Alerts |');
  console.log('| --- | --- | ---: | --- |');
  for (const result of results) {
    const alerts = result.usage && 'alerts' in result.usage
      ? result.usage.alerts
      : [];
    const summary = Array.isArray(alerts)
      ? alerts.filter((alert) => typeof alert === 'string').join(', ').replaceAll('|', '\\|')
      : '';
    console.log(`| ${result.host} | ${result.status} | ${result.usage?.seats.length ?? 0} | ${summary} |`);
  }
  console.log(githubCore ? `GitHub core API remaining ${githubCore.remaining}/${githubCore.limit}` : 'GitHub core API quota unknown');
}
