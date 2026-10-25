// Source preparation for one admitted run: exact-commit checkout from a
// per-host mirror, then the frozen install and the command. Node built-ins only.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, renameSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  ensureDir,
  home,
  now,
  processStart,
  readJson,
  runDir,
  type StartSpec,
  supervisorAlive,
  VERSION,
  validSpec,
  writeJson,
} from './balancer-host-common';

export const mirrorPath = (repo: string) =>
  join(home(), 'mirrors', `${repo.replace('/', '__')}.git`);
export function git(args: string[], cwd?: string) {
  const out = spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    timeout: 30 * 60_000,
    maxBuffer: 16 * 1024 * 1024,
  });
  // Stderr can carry remote URLs; callers report generic failures.
  if (out.status !== 0) throw new Error(`git ${args[0]} failed`);
  return out.stdout;
}
// A mkdir lock serialises mirror writers on this host; a dead holder is taken over.
export async function withMirrorLock<T>(
  repo: string,
  action: () => T
): Promise<T> {
  const lock = `${mirrorPath(repo)}.lock`;
  ensureDir(join(home(), 'mirrors'));
  for (let attempt = 0; ; attempt++) {
    try {
      mkdirSync(lock, { mode: 0o700 });
      writeJson(join(lock, 'owner.json'), {
        pid: process.pid,
        started: processStart(process.pid),
      });
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      const owner = readJson(join(lock, 'owner.json'));
      const alive = owner
        ? supervisorAlive({ pid: owner.pid, started: owner.started })
        : null;
      if (alive === false) rmSync(lock, { recursive: true, force: true });
      else if (attempt > 1200) throw new Error('mirror lock is held');
      else await new Promise((done) => setTimeout(done, 1000));
    }
  }
  try {
    return action();
  } finally {
    rmSync(lock, { recursive: true, force: true });
  }
}

export async function removeCheckout(spec: StartSpec, dir: string) {
  const checkout = join(dir, 'src');
  if (!existsSync(checkout)) return;
  await withMirrorLock(spec.repo, () => {
    try {
      git([
        '--git-dir',
        mirrorPath(spec.repo),
        'worktree',
        'remove',
        '--force',
        checkout,
      ]);
    } catch {
      rmSync(checkout, { recursive: true, force: true });
      try {
        git(['--git-dir', mirrorPath(spec.repo), 'worktree', 'prune']);
      } catch {
        /* Pruned on the next checkout. */
      }
    }
  });
}

export async function job(runId: string) {
  const dir = runDir(runId);
  const spec = readJson(join(dir, 'lease.json')) as unknown as StartSpec;
  validSpec({ ...spec, v: VERSION });
  writeJson(join(dir, 'admitted.json'), {
    at: now(),
    admitted: Boolean(process.env.TTR_RESOURCES_ADMITTED),
  });
  writeJson(join(dir, 'phase.json'), { phase: 'preparing', at: now() });
  const setupFailed = (reason: string): never => {
    writeJson(join(dir, 'job-exit.json'), {
      phase: 'setup',
      reason,
      at: now(),
    });
    process.stderr.write(`[ttr balancer] setup failed: ${reason}\n`);
    process.exit(70);
  };
  const checkout = join(dir, 'src');
  const mirror = mirrorPath(spec.repo);
  try {
    await withMirrorLock(spec.repo, () => {
      const url =
        process.env.TTR_BALANCER_ORIGIN_URL ||
        `https://github.com/${spec.repo}.git`;
      if (!existsSync(mirror)) {
        const staging = `${mirror}.${process.pid}.tmp`;
        rmSync(staging, { recursive: true, force: true });
        git(['clone', '--bare', '--filter=blob:none', '--quiet', url, staging]);
        renameSync(staging, mirror);
      }
      git([
        '--git-dir',
        mirror,
        'fetch',
        '--no-tags',
        '--quiet',
        '--prune',
        url,
        '+refs/heads/*:refs/remotes/origin/*',
      ]);
      git(['--git-dir', mirror, 'cat-file', '-e', `${spec.baseSha}^{commit}`]);
      // Any SHA in a fork network is fetchable; require it on an origin branch.
      if (
        !git([
          '--git-dir',
          mirror,
          'for-each-ref',
          '--count=1',
          '--format=%(refname)',
          `--contains=${spec.baseSha}`,
          'refs/remotes/origin/',
        ]).trim()
      )
        throw new Error('commit is not on an origin branch');
      git([
        '--git-dir',
        mirror,
        'worktree',
        'add',
        '--detach',
        '--quiet',
        checkout,
        spec.baseSha,
      ]);
    });
  } catch (error) {
    setupFailed(`source preparation failed (${(error as Error).message})`);
  }
  if (git(['rev-parse', 'HEAD'], checkout).trim() !== spec.baseSha)
    setupFailed('checkout is not at the requested commit');
  if (spec.install && existsSync(join(checkout, 'package.json'))) {
    const install = spawnSync(
      process.execPath,
      ['install', '--frozen-lockfile'],
      { cwd: checkout, stdio: 'inherit', env: process.env }
    );
    if (install.status !== 0)
      setupFailed(`dependency install exited ${install.status ?? 'by signal'}`);
  }
  const cwd = join(checkout, spec.cwd);
  if (!statSync(cwd, { throwIfNoEntry: false })?.isDirectory())
    setupFailed(`directory ${spec.cwd || '.'} does not exist at that commit`);
  writeJson(join(dir, 'phase.json'), { phase: 'running', at: now() });
  const command = spawn(spec.command[0]!, spec.command.slice(1), {
    cwd,
    stdio: 'inherit',
    env: process.env,
  });
  const forward = (signal: NodeJS.Signals) => command.kill(signal);
  process.on('SIGTERM', forward);
  process.on('SIGINT', forward);
  const code = await new Promise<number>((done) => {
    command.on('error', () => done(127));
    command.on('close', (exit, signal) => done(exit ?? (signal ? 143 : 1)));
  });
  writeJson(join(dir, 'job-exit.json'), {
    phase: 'command',
    exitCode: code,
    at: now(),
  });
  process.exit(code);
}
