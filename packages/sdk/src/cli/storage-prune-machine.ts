import { lstatSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { canonicalPath, isInside } from './storage-holds';
import type { Exec, PruneContext } from './storage-prune';
import { newestMtime, type StorageCategory, tmpRoots } from './storage-targets';

export function derivedDataSteps(ctx: PruneContext, category: StorageCategory) {
  const { steps, push, fenced, items, cutoff, olderThanDays, exec, remove } =
    ctx;
  for (const item of items(category)) {
    if (
      processRunning(exec, /\bxcodebuild\b|Xcode\.app\/Contents\/MacOS\/Xcode/u)
    ) {
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
    for (const name of safeReaddir(item.path)) {
      const child = join(item.path, name);
      if (
        !lstatSync(child, { throwIfNoEntry: false })?.isDirectory() ||
        newestMtime(child, 2) > cutoff
      )
        continue;
      push({
        category,
        path: child,
        bytes: Math.round(
          item.uniqueBytes / Math.max(1, safeReaddir(item.path).length)
        ),
        description: `remove DerivedData/${name} (idle > ${olderThanDays}d)`,
        run: fenced(child, () => {
          if (
            !isInside(canonicalPath(child), canonicalPath(item.path)) ||
            newestMtime(child, 2) > cutoff
          )
            return 're-check failed: written recently';
          remove(child);
          return null;
        }),
      });
    }
  }
}

export function tmpSteps(ctx: PruneContext, category: StorageCategory) {
  const { push, fenced, items, cutoff, remove } = ctx;
  const roots = tmpRoots().map(canonicalPath);
  for (const item of items(category)) {
    if (item.uniqueBytes < 25 * 1024 ** 2) continue;
    push({
      category,
      path: item.path,
      bytes: item.uniqueBytes,
      description: `remove idle tmp dir (${item.label})`,
      run: fenced(item.path, () => {
        if (
          !roots.some(
            (root) =>
              isInside(canonicalPath(item.path), root) &&
              canonicalPath(item.path) !== root
          )
        )
          return 'outside tmp roots';
        if (newestMtime(item.path, 2) > cutoff)
          return 're-check failed: written recently';
        remove(item.path);
        return null;
      }),
    });
  }
}

export function supabaseVolumeSteps(
  ctx: PruneContext,
  category: StorageCategory
) {
  const { report, options, steps, push, command } = ctx;
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
      run: command(['docker', 'volume', 'rm', name]),
    });
  }
}

export function dockerSteps(ctx: PruneContext, category: StorageCategory) {
  const { report, options, push, command, olderThanDays } = ctx;
  const build = report.docker?.usage.find((row) => /build/iu.test(row.type));
  if (build?.reclaimableBytes)
    push({
      category,
      path: 'docker:build-cache',
      bytes: build.reclaimableBytes,
      description: `docker builder prune (unused > ${olderThanDays}d)`,
      run: command([
        'docker',
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
      run: command([
        'docker',
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
  const { steps, push, command, items, olderThanDays, exec } = ctx;
  const simple: Partial<
    Record<StorageCategory, { argv: string[]; busy?: RegExp }>
  > = {
    'xcode-simulators': {
      argv: ['xcrun', 'simctl', 'delete', 'unavailable'],
    },
    'homebrew-cache': {
      argv: ['brew', 'cleanup', `--prune=${olderThanDays}`],
    },
    'npm-cache': {
      argv: ['npm', 'cache', 'clean', '--force'],
      busy: /\bnpm (install|ci)\b/u,
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
  const rule = simple[category];
  const relevant = items(category).filter(
    (item) => category !== 'xcode-simulators' || item.risk === 'safe'
  );
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
  push({
    category,
    path: relevant[0]!.path,
    bytes,
    description: rule.argv.join(' '),
    run: command(rule.argv),
  });
}

function safeReaddir(path: string) {
  try {
    return readdirSync(path);
  } catch {
    return [];
  }
}

function processRunning(exec: Exec, pattern: RegExp) {
  const result = exec(['ps', '-axo', 'command=']);
  return (
    result.status === 0 &&
    result.stdout.split('\n').some((line) => pattern.test(line))
  );
}
