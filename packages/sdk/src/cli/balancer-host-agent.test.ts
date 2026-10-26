import { execFileSync, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Drives the real host agent in bun subprocesses against a disposable
// balancer home, a local origin and a fake `ttr` that admits immediately.
const agent = join(__dirname, 'balancer-host-agent.ts');
const bun = process.env.BUN_PATH ?? 'bun';
let root: string;
let env: NodeJS.ProcessEnv;
let sha: string;

function call(args: string[], stdin = ''): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const child = spawn(bun, [agent, ...args], {
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let out = '';
    child.stdout.on('data', (chunk) => {
      out += chunk;
    });
    child.on('error', reject);
    child.on('close', () => {
      try {
        resolve(JSON.parse(out.trim().split('\n').pop()!));
      } catch {
        reject(new Error(`agent printed: ${out}`));
      }
    });
    child.stdin.end(stdin);
  });
}
const spec = (
  runId: string,
  command: string[],
  patch: Record<string, unknown> = {}
) => ({
  v: 1,
  runId,
  leaseId: randomUUID(),
  fence: 1,
  deviceId: 'test-host',
  repo: 'tutur3u/platform',
  baseSha: sha,
  cwd: 'work',
  command,
  timeoutSeconds: 120,
  install: false,
  ...patch,
});
async function until<T>(
  read: () => Promise<T>,
  done: (value: T) => boolean,
  ms = 30_000
) {
  const deadline = Date.now() + ms;
  for (;;) {
    const value = await read();
    if (done(value)) return value;
    if (Date.now() > deadline)
      throw new Error(`timed out: ${JSON.stringify(value)}`);
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}
const finished = (runId: string) =>
  until(
    () => call(['status', runId]),
    (value) => Boolean(value.result)
  );

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'balancer-agent-'));
  const origin = join(root, 'origin');
  await mkdir(join(origin, 'work'), { recursive: true });
  await writeFile(
    join(origin, 'work', 'note.txt'),
    'hello from the exact commit\n'
  );
  const git = (...args: string[]) =>
    execFileSync('git', args, {
      cwd: origin,
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: 't',
        GIT_AUTHOR_EMAIL: 't@t',
        GIT_COMMITTER_NAME: 't',
        GIT_COMMITTER_EMAIL: 't@t',
      },
    })
      .toString()
      .trim();
  git('init', '--quiet', '--initial-branch=main');
  git('add', '.');
  git('commit', '--quiet', '-m', 'fixture');
  sha = git('rev-parse', 'HEAD');
  const ttr = join(root, 'ttr');
  await writeFile(
    ttr,
    `#!/bin/sh
if [ "$1 $2" = "resources status" ]; then
  echo '{"version":"0.29.0","enabled":true,"config":{"state":"enabled"},"laneCount":2,"owners":[],"waiting":[]}'
  exit 0
fi
while [ "$#" -gt 0 ] && [ "$1" != "--" ]; do shift; done
shift
TTR_RESOURCES_ADMITTED=fixture exec "$@"
`
  );
  await chmod(ttr, 0o755);
  env = {
    ...process.env,
    TTR_BALANCER_HOME: join(root, 'home'),
    TTR_BALANCER_TTR: ttr,
    TTR_BALANCER_ORIGIN_URL: `file://${origin}`,
    TTR_BALANCER_NO_SYSTEMD: '1',
  };
});
afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('balancer host agent', { timeout: 60_000 }, () => {
  it('probes identity, disk and the canonical queue', async () => {
    const probe = await call(['probe']);
    expect(probe).toMatchObject({
      ok: true,
      platform: process.platform,
      ttrVersion: '0.29.0',
      queue: { enabled: true, lanes: 2, occupied: 0, waiting: 0 },
    });
    expect(typeof probe.diskFreeGiB).toBe('number');
  });

  it('runs an exact commit in a fresh checkout and rejects a second admission', async () => {
    const first = spec('agent-success-run-0001-r1', [
      'sh',
      '-c',
      'cat note.txt; git rev-parse HEAD',
    ]);
    expect(await call(['start'], JSON.stringify(first))).toMatchObject({
      accepted: true,
      duplicate: false,
    });
    expect(await call(['start'], JSON.stringify(first))).toMatchObject({
      accepted: true,
      duplicate: true,
    });
    expect(
      await call(['start'], JSON.stringify({ ...first, leaseId: randomUUID() }))
    ).toMatchObject({ accepted: false, reason: 'duplicate_admission' });
    const status = await finished(first.runId);
    expect(status.result).toMatchObject({
      resultId: first.leaseId,
      fence: 1,
      status: 'succeeded',
      exitCode: 0,
      phase: 'command',
    });
    const log = await call(['log', first.runId]);
    expect(log.tail).toContain('hello from the exact commit');
    expect(log.tail).toContain(sha);
    expect(existsSync(join(root, 'home', 'runs', first.runId, 'src'))).toBe(
      false
    );
    const admitted = JSON.parse(
      await readFile(
        join(root, 'home', 'runs', first.runId, 'admitted.json'),
        'utf8'
      )
    );
    expect(admitted.admitted).toBe(true);
  });

  it('reports setup failure for a commit that is not on origin', async () => {
    const run = spec('agent-setup-failure-01-r1', ['true'], {
      baseSha: '0000000000000000000000000000000000000001',
    });
    expect(await call(['start'], JSON.stringify(run))).toMatchObject({
      accepted: true,
    });
    const status = await finished(run.runId);
    expect(status.result).toMatchObject({
      status: 'setup_failed',
      phase: 'setup',
    });
  });

  it('stops a running command on cancel', async () => {
    const run = spec('agent-cancel-running-01-r1', ['sleep', '60']);
    await call(['start'], JSON.stringify(run));
    await until(
      () => call(['status', run.runId]),
      (value) => (value.phase as { phase?: string })?.phase === 'running'
    );
    expect(await call(['cancel', run.runId, randomUUID()])).toMatchObject({
      signalled: false,
      reason: 'stale_lease',
    });
    expect(await call(['cancel', run.runId, run.leaseId])).toMatchObject({
      signalled: true,
    });
    const status = await finished(run.runId);
    expect(status.result).toMatchObject({ status: 'cancelled' });
  });

  it('reports a dead supervisor without a result as not alive', async () => {
    const run = spec('agent-lost-supervisor-1-r1', ['sleep', '60']);
    await call(['start'], JSON.stringify(run));
    const running = await until(
      () => call(['status', run.runId]),
      (value) => (value.phase as { phase?: string })?.phase === 'running'
    );
    const pid = Number((running.supervisor as { pid: number }).pid);
    process.kill(pid, 'SIGKILL');
    const lost = await until(
      () => call(['status', run.runId]),
      (value) => value.alive === false
    );
    expect(lost.result).toBeUndefined();
    // Stop the orphaned job; it forwards SIGTERM to its command.
    execFileSync('pkill', ['-TERM', '-f', `job ${run.runId}`]);
  });

  it('refuses malformed envelopes before creating anything', async () => {
    const bad = spec('agent-bad-envelope-01-r1', ['true'], {
      cwd: '../escape',
    });
    expect(await call(['start'], JSON.stringify(bad))).toMatchObject({
      ok: false,
      error: 'invalid cwd',
    });
    expect(existsSync(join(root, 'home', 'runs', bad.runId))).toBe(false);
  });
});
