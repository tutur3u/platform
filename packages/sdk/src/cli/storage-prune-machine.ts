import { lstatSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { dockerOverrides, verifyLocalDocker } from './storage-docker-local';
import { canonicalPath, isInside } from './storage-holds';
import { systemTool } from './storage-liveness';
import type { Exec, PruneContext, StepResult } from './storage-prune';
import { tmpScratchRejection } from './storage-scratch';
import {
  newestMtime,
  type StorageCategory,
  tmpRoots,
  unavailableSimulators,
} from './storage-targets';

export function derivedDataSteps(ctx: PruneContext, category: StorageCategory) {
  const {
    steps,
    push,
    removeTree,
    items,
    cutoff,
    olderThanDays,
    exec,
    measure,
  } = ctx;
  const xcodeBusy = /\bxcodebuild\b|Xcode\.app\/Contents\/MacOS\/Xcode/u;
  for (const item of items(category)) {
    if (!isOwnedDerivedDataRoot(item.path)) {
      steps.push({
        category,
        path: item.path,
        bytes: 0,
        description: 'remove DerivedData',
        status: 'skipped',
        reason:
          'DerivedData root or home ancestor is not a real user-owned directory',
      });
      continue;
    }
    if (processRunning(exec, xcodeBusy)) {
      steps.push({
        category,
        path: item.path,
        bytes: 0,
        description: 'remove DerivedData',
        status: 'skipped',
        reason: 'Xcode or xcodebuild is running',
      });
      continue;
    }
    // Each idle project folder is measured on its own so --max-remove
    // bounds the bytes actually removed.
    const candidates = safeReaddir(item.path)
      .map((name) => join(item.path, name))
      .filter(
        (child) =>
          lstatSync(child, { throwIfNoEntry: false })?.isDirectory() &&
          newestMtime(child) <= cutoff
      );
    const sizes = measure(candidates.map((root) => ({ root }))).results;
    candidates.forEach((child, index) => {
      push({
        category,
        path: child,
        bytes: sizes[index]?.uniqueBytes ?? 0,
        description: `remove DerivedData/${child.slice(item.path.length + 1)} (idle > ${olderThanDays}d)`,
        root: item.path,
        run: removeTree(item.path, child, () => {
          if (!isOwnedDerivedDataRoot(item.path))
            return 're-check failed: DerivedData directory chain changed';
          if (processRunning(exec, xcodeBusy))
            return 'Xcode or xcodebuild started';
          if (newestMtime(child) > cutoff)
            return 're-check failed: written recently';
          return null;
        }),
      });
    });
  }
}

/** Only the literal, user-owned Xcode directory may bypass repository refusal. */
function isOwnedDerivedDataRoot(root: string) {
  const home = homedir();
  const expected = join(home, 'Library', 'Developer', 'Xcode', 'DerivedData');
  const uid = process.geteuid?.() ?? process.getuid?.();
  if (uid === undefined || root !== expected) return false;
  try {
    if (canonicalPath(root) !== expected) return false;
    for (let current = root; ; current = dirname(current)) {
      const info = lstatSync(current);
      if (info.isSymbolicLink() || !info.isDirectory() || info.uid !== uid)
        return false;
      if (current === home) return true;
    }
  } catch {
    return false;
  }
}

export function tmpSteps(ctx: PruneContext, category: StorageCategory) {
  const { steps, push, items, cutoff, removeTree } = ctx;
  const roots = tmpRoots().map(canonicalPath);
  for (const item of items(category)) {
    if (item.uniqueBytes < 25 * 1024 ** 2) continue;
    const root = roots.find(
      (entry) =>
        isInside(canonicalPath(item.path), entry) &&
        canonicalPath(item.path) !== entry
    );
    // Only identified tool scratch directly under a tmp root is removable;
    // anything holding a git repository or worktree is never removed.
    const rejection = !root
      ? 'outside tmp roots'
      : dirname(canonicalPath(item.path)) !== root
        ? 'not a top-level tmp dir'
        : tmpScratchRejection(item.path, basename(item.path));
    if (!root || rejection) {
      steps.push({
        category,
        path: item.path,
        bytes: item.uniqueBytes,
        description: `remove idle tmp dir (${item.label})`,
        status: 'skipped',
        reason: rejection ?? 'outside tmp roots',
      });
      continue;
    }
    push({
      category,
      path: item.path,
      bytes: item.uniqueBytes,
      description: `remove idle tmp dir (${item.label})`,
      root,
      // The deleting walk itself refuses any repository found inside, so a
      // checkout moved in after this re-check is never removed.
      run: removeTree(
        root,
        item.path,
        () => {
          if (newestMtime(item.path) > cutoff)
            return 're-check failed: written recently';
          const again = tmpScratchRejection(item.path, basename(item.path));
          return again ? `re-check failed: ${again}` : null;
        },
        undefined,
        { refuseRepositories: true }
      ),
    });
  }
}

export function supabaseVolumeSteps(
  ctx: PruneContext,
  category: StorageCategory
) {
  const { report, options, steps, push } = ctx;
  for (const name of options.names) {
    const volume = report.docker?.supabaseVolumes.find(
      (entry) => entry.name === name
    );
    if (!volume) {
      steps.push({
        category,
        path: `docker-volume:${name}`,
        bytes: 0,
        description: 'docker volume rm',
        status: 'skipped',
        reason: 'not a Supabase CLI volume in this report',
      });
      continue;
    }
    if (volume.links) {
      steps.push({
        category,
        path: `docker-volume:${name}`,
        bytes: volume.sizeBytes,
        description: 'docker volume rm',
        status: 'skipped',
        reason: 'volume is attached to a container; run supabase stop first',
      });
      continue;
    }
    push({
      category,
      path: `docker-volume:${name}`,
      bytes: volume.sizeBytes,
      description: `docker volume rm ${name} (explicitly named)`,
      run: localDocker(ctx, ['volume', 'rm', name]),
    });
  }
}

export function dockerSteps(ctx: PruneContext, category: StorageCategory) {
  const { report, options, push, olderThanDays } = ctx;
  const build = report.docker?.usage.find((row) => /build/iu.test(row.type));
  if (build?.reclaimableBytes)
    push({
      category,
      path: 'docker:build-cache',
      bytes: build.reclaimableBytes,
      description: `docker builder prune (unused > ${olderThanDays}d)`,
      run: localDocker(ctx, [
        'builder',
        'prune',
        '--force',
        '--filter',
        `until=${olderThanDays * 24}h`,
      ]),
    });
  const images = report.docker?.usage.find((row) => /image/iu.test(row.type));
  if (options.categories?.includes('docker') && images?.reclaimableBytes)
    push({
      category,
      path: 'docker:images',
      bytes: images.reclaimableBytes,
      description: `docker image prune --all (unused > ${olderThanDays}d)`,
      run: localDocker(ctx, [
        'image',
        'prune',
        '--all',
        '--force',
        '--filter',
        `until=${olderThanDays * 24}h`,
      ]),
    });
}

export function cacheCommandSteps(
  ctx: PruneContext,
  category: StorageCategory
) {
  const { steps, push, fenced, command, items, olderThanDays, exec } = ctx;
  const simple: Partial<
    Record<StorageCategory, { argv: string[]; busy?: RegExp }>
  > = {
    'homebrew-cache': {
      argv: ['brew', 'cleanup', `--prune=${olderThanDays}`],
    },
    'bun-cache': {
      argv: ['bun', 'pm', 'cache', 'rm'],
      busy: /\bbun (install|i|add)\b/u,
    },
    'pub-cache': {
      argv: ['flutter', 'pub', 'cache', 'clean', '--force'],
      busy: /\b(flutter|dart) pub\b/u,
    },
  };
  if (category === 'npm-cache') return npmCacheSteps(ctx, category);
  const rule = simple[category];
  const relevant = items(category);
  const bytes = relevant.reduce((sum, item) => sum + item.uniqueBytes, 0);
  if (!rule || !bytes) return;
  if (rule.busy && processRunning(exec, rule.busy)) {
    steps.push({
      category,
      path: relevant[0]!.path,
      bytes,
      description: rule.argv.join(' '),
      status: 'skipped',
      reason: 'a process is using this cache',
    });
    return;
  }
  // The command can touch every measured path, so all of them are fenced,
  // and the cache-user check repeats right before it runs.
  const paths = relevant.map((item) => item.path);
  push({
    category,
    path: paths[0]!,
    fencePaths: paths,
    bytes,
    description: rule.argv.join(' '),
    run: fenced(paths, () =>
      rule.busy && processRunning(exec, rule.busy)
        ? 'a process started using this cache'
        : command(rule.argv)()
    ),
  });
}

const NPM_BUSY = /\bnpm (install|ci)\b/u;

/**
 * `npm cache clean` is pinned with `--cache` to the exact root whose
 * `_cacache` the report measured, so `npm_config_cache` or an npmrc can never
 * redirect it to a shared or unmeasured cache. The root must be a real
 * directory owned by this user, re-checked with the fences right before.
 */
function npmCacheSteps(ctx: PruneContext, category: StorageCategory) {
  const { steps, push, fenced, command, items, exec } = ctx;
  for (const item of items(category)) {
    const cacheRoot = dirname(item.path);
    const skip = (reason: string) =>
      steps.push({
        category,
        path: item.path,
        bytes: item.uniqueBytes,
        description: 'npm cache clean',
        status: 'skipped',
        reason,
      });
    const problem = () =>
      basename(item.path) !== '_cacache'
        ? 'not an npm _cacache directory'
        : ownedRealDirectory(cacheRoot)
          ? null
          : 'npm cache root is not a directory owned by this user';
    const rejection = problem();
    if (rejection) skip(rejection);
    else if (processRunning(exec, NPM_BUSY))
      skip('a process is using this cache');
    else
      push({
        category,
        path: item.path,
        fencePaths: [item.path],
        bytes: item.uniqueBytes,
        description: `npm cache clean --force --cache ${cacheRoot}`,
        run: fenced(item.path, () => {
          const again = problem();
          if (again) return `re-check failed: ${again}`;
          if (processRunning(exec, NPM_BUSY))
            return 'a process started using this cache';
          return command([
            'npm',
            'cache',
            'clean',
            '--force',
            '--cache',
            cacheRoot,
          ])();
        }),
      });
  }
}

function ownedRealDirectory(path: string) {
  const info = lstatSync(path, { throwIfNoEntry: false });
  const uid = process.getuid?.();
  return Boolean(
    info?.isDirectory() &&
      !info.isSymbolicLink() &&
      (uid === undefined || info.uid === uid)
  );
}

/**
 * Runs a Docker command only against a verified local daemon, pinned to its
 * socket; the endpoint is verified again right before the command runs.
 */
function localDocker(ctx: PruneContext, args: string[]) {
  return (): StepResult => {
    const docker = verifyLocalDocker(ctx.exec, ctx.env, ctx.options.isSocket);
    if (!docker.ok) return docker.reason;
    return ctx.command(docker.argv(args), undefined, dockerOverrides)();
  };
}

const UDID = /^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/iu;

/**
 * One step per unavailable simulator, deleted by its own UDID (never
 * `simctl delete unavailable`, which would also delete held or filtered-out
 * devices). Each device is re-listed as unavailable and re-fenced right
 * before its delete.
 */
export function simulatorSteps(ctx: PruneContext, category: StorageCategory) {
  const { steps, push, fenced, command, items } = ctx;
  for (const item of items(category)) {
    if (item.risk !== 'safe') continue;
    const udid = basename(item.path);
    if (!UDID.test(udid) || basename(dirname(item.path)) !== 'Devices') {
      steps.push({
        category,
        path: item.path,
        bytes: item.uniqueBytes,
        description: 'xcrun simctl delete',
        status: 'skipped',
        reason: 'not a simulator device directory',
      });
      continue;
    }
    push({
      category,
      path: item.path,
      bytes: item.uniqueBytes,
      description: `xcrun simctl delete ${udid} (runtime uninstalled)`,
      run: fenced(item.path, () => {
        const current = unavailableSimulators((args) =>
          ctx.exec(['xcrun', ...args])
        ).map(canonicalPath);
        if (!current.includes(canonicalPath(item.path)))
          return 're-check failed: no longer an unavailable simulator';
        return command(['xcrun', 'simctl', 'delete', udid])();
      }),
    });
  }
}

function safeReaddir(path: string) {
  try {
    return readdirSync(path);
  } catch {
    return [];
  }
}

/** Fails closed: an unreadable process list counts as busy. */
function processRunning(exec: Exec, pattern: RegExp) {
  const result = exec([systemTool('ps'), '-axo', 'command=']);
  return (
    result.status !== 0 ||
    result.stdout.split('\n').some((line) => pattern.test(line))
  );
}
