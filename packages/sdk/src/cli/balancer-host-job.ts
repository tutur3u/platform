// Source preparation for one admitted run: exact-commit checkout from a
// per-host mirror, then the frozen install and the command. Node built-ins only.
import { spawn, spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, sep } from 'node:path';
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
  const javascript = existsSync(join(checkout, 'package.json'));
  const node = javascript ? resolveNode(checkout) : undefined;
  if (node && !node.path)
    setupFailed(
      `no installed Node.js satisfies ${node.wanted} (toolchain install is not automated yet)`
    );
  writeJson(join(dir, 'toolchain.json'), {
    node: node
      ? { path: node.path, version: node.version, pinned: node.pinned }
      : null,
    bun: process.versions.bun ?? null,
    at: now(),
  });
  const env = node?.path
    ? {
        ...process.env,
        PATH: withToolDir(process.env.PATH, dirname(node.path)),
      }
    : process.env;
  if (spec.install && javascript) {
    const install = spawnSync(
      process.execPath,
      ['install', '--frozen-lockfile'],
      { cwd: checkout, stdio: 'inherit', env }
    );
    if (install.status !== 0)
      setupFailed(`dependency install exited ${install.status ?? 'by signal'}`);
  }
  const cwd = runCwd(checkout, spec.cwd);
  if (!cwd)
    setupFailed(
      `directory ${spec.cwd || '.'} does not exist inside the checkout at that commit`
    );
  writeJson(join(dir, 'phase.json'), { phase: 'running', at: now() });
  const command = spawn(spec.command[0]!, spec.command.slice(1), {
    cwd,
    stdio: 'inherit',
    env,
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

// The command directory, resolved through every symlink component; a path
// that resolves outside the exact checkout is rejected.
export function runCwd(checkout: string, requested: string) {
  try {
    const root = realpathSync(checkout);
    const cwd = realpathSync(join(root, requested));
    const inside = cwd === root || cwd.startsWith(`${root}${sep}`);
    return inside && statSync(cwd).isDirectory() ? cwd : undefined;
  } catch {
    return undefined;
  }
}

type Version = [number, number, number];
const parseVersion = (text: string): Version | undefined => {
  const match = /^v?(\d+)\.(\d+)\.(\d+)/u.exec(text.trim());
  return match
    ? [Number(match[1]), Number(match[2]), Number(match[3])]
    : undefined;
};
const compare = (a: Version, b: Version) =>
  a[0] - b[0] || a[1] - b[1] || a[2] - b[2];

// The checkout's `.nvmrc` pin first, then the newest installed Node.js that
// meets `engines.node` (only `>=x.y.z` is understood; anything else needs the
// pin). Real binaries only: the queue's own shims are never candidates.
export function resolveNode(checkout: string, home = homedir()) {
  const pinned = (() => {
    try {
      return readFileSync(join(checkout, '.nvmrc'), 'utf8')
        .trim()
        .replace(/^v/u, '');
    } catch {
      return undefined;
    }
  })();
  const engines = String(
    (
      readJson(join(checkout, 'package.json'))?.engines as
        | { node?: unknown }
        | undefined
    )?.node ?? ''
  );
  const minimum = /^>=\s*(\S+)$/u.exec(engines)?.[1];
  const floor = minimum ? parseVersion(minimum) : undefined;
  const wanted = minimum
    ? `>=${minimum}`
    : pinned
      ? `v${pinned}`
      : 'any version';
  const nvm = join(home, '.nvm', 'versions', 'node');
  const managed = (() => {
    try {
      return readdirSync(nvm)
        .filter((name) => parseVersion(name))
        .sort((a, b) => compare(parseVersion(b)!, parseVersion(a)!))
        .map((name) => join(nvm, name, 'bin', 'node'));
    } catch {
      return [];
    }
  })();
  const candidates = [
    ...(pinned ? [join(nvm, `v${pinned}`, 'bin', 'node')] : []),
    ...managed,
    '/opt/homebrew/bin/node',
    '/usr/local/bin/node',
    '/usr/bin/node',
  ];
  for (const path of candidates) {
    if (!existsSync(path)) continue;
    const out = spawnSync(path, ['--version'], {
      encoding: 'utf8',
      env: {},
      timeout: 10_000,
    });
    const version = parseVersion(out.stdout ?? '');
    if (out.status !== 0 || !version) continue;
    const exact =
      pinned !== undefined &&
      compare(version, parseVersion(pinned) ?? [0, 0, 0]) === 0;
    if (!exact && floor && compare(version, floor) < 0) continue;
    if (!exact && !floor && pinned) continue;
    return { path, version: `v${version.join('.')}`, pinned: exact, wanted };
  }
  return { path: undefined, version: undefined, pinned: false, wanted };
}

// The queue puts its shims first on PATH; the real tool directory goes right
// after them so a shimmed `node` resolves to it.
export function withToolDir(path: string | undefined, dir: string) {
  const entries = (path ?? '').split(':').filter(Boolean);
  let index = 0;
  while (
    index < entries.length &&
    entries[index]!.includes('/.tuturuuu/resources')
  )
    index++;
  return [
    ...entries.slice(0, index),
    dir,
    ...entries.slice(index).filter((entry) => entry !== dir),
  ].join(':');
}
