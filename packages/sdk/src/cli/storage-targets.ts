import { spawnSync } from 'node:child_process';
import { existsSync, lstatSync, readdirSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  containsGitRepository,
  isScratchDirName,
  resolveNpmCacheRoot,
} from './storage-scratch';

/**
 * - `safe`: rebuildable cache with no state; `prune --apply` may remove it
 *   within the age/size bounds without naming the category.
 * - `moderate`: rebuildable but costly (re-download, rebuild) or shared by
 *   other lanes; applied only when the category is named explicitly.
 * - `high`: holds data or owner state; reported and suggested, never removed
 *   by `prune` (except an explicitly named Supabase volume).
 */
export type StorageRisk = 'safe' | 'moderate' | 'high';

export type StorageCategory =
  | 'worktrees'
  | 'node-modules-stale'
  | 'build-artifacts'
  | 'rust-target'
  | 'bun-cache'
  | 'npm-cache'
  | 'pub-cache'
  | 'xcode-derived-data'
  | 'xcode-simulators'
  | 'xcode-device-support'
  | 'xcode-archives'
  | 'gradle'
  | 'android-sdk'
  | 'docker'
  | 'vm-disks'
  | 'supabase-volumes'
  | 'playwright'
  | 'homebrew-cache'
  | 'tmp-old'
  | 'trash';

export interface CacheTarget {
  category: StorageCategory;
  label: string;
  paths: string[];
  risk: StorageRisk;
  /** Shell command a human or `suggest` would run to reclaim it. */
  command: string;
  note?: string;
}

/** Machine-level caches outside any checkout, filtered to existing paths. */
export function machineTargets({
  home = homedir(),
  platform = process.platform,
  env = process.env,
  npmCacheRoot = resolveNpmCacheRoot({
    home,
    env,
    exec: () => ({ status: 1, stdout: '' }),
  }),
}: {
  home?: string;
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
  /** Effective npm cache root; `prune` pins `npm cache clean` to it. */
  npmCacheRoot?: string;
} = {}): CacheTarget[] {
  const mac = platform === 'darwin';
  const xdgCache = env.XDG_CACHE_HOME || join(home, '.cache');
  const library = join(home, 'Library');
  const targets: CacheTarget[] = [
    {
      category: 'bun-cache',
      label: 'Bun install cache',
      paths: [
        env.BUN_INSTALL_CACHE_DIR || join(home, '.bun', 'install', 'cache'),
      ],
      risk: 'moderate',
      command: 'bun pm cache rm',
      note: 'clone source for every node_modules; the next install re-downloads',
    },
    {
      category: 'npm-cache',
      label: 'npm cache',
      paths: [join(npmCacheRoot, '_cacache')],
      risk: 'safe',
      command: `npm cache clean --force --cache ${npmCacheRoot}`,
    },
    {
      category: 'pub-cache',
      label: 'Flutter/Dart pub cache',
      paths: [env.PUB_CACHE || join(home, '.pub-cache')],
      risk: 'moderate',
      command: 'flutter pub cache clean --force',
      note: 'shared by every Flutter checkout; the next pub get re-downloads',
    },
    {
      category: 'gradle',
      label: 'Gradle caches and wrappers',
      paths: [
        join(home, '.gradle', 'caches'),
        join(home, '.gradle', 'wrapper', 'dists'),
      ],
      risk: 'moderate',
      command: 'gradle --stop; rm -rf ~/.gradle/caches',
    },
    {
      category: 'playwright',
      label: 'Playwright and Puppeteer browsers',
      paths: mac
        ? [
            join(library, 'Caches', 'ms-playwright'),
            join(xdgCache, 'puppeteer'),
          ]
        : [join(xdgCache, 'ms-playwright'), join(xdgCache, 'puppeteer')],
      risk: 'moderate',
      command: 'bunx playwright uninstall --all',
      note: 'browsers reinstall with `bunx playwright install`',
    },
    {
      category: 'trash',
      label: 'Trash',
      paths: mac
        ? [join(home, '.Trash')]
        : [join(home, '.local', 'share', 'Trash')],
      risk: 'high',
      command: mac
        ? 'Empty the Trash in Finder after reviewing it'
        : 'gio trash --empty',
      note: 'user data; never removed automatically',
    },
  ];
  if (mac) {
    const developer = join(library, 'Developer');
    targets.push(
      {
        category: 'xcode-derived-data',
        label: 'Xcode DerivedData',
        paths: [join(developer, 'Xcode', 'DerivedData')],
        risk: 'safe',
        command: 'ttr storage prune --category xcode-derived-data --apply',
        note: 'per-project build products; Xcode rebuilds them',
      },
      {
        category: 'xcode-simulators',
        label: 'iOS simulators and caches',
        paths: [
          join(developer, 'CoreSimulator', 'Devices'),
          join(developer, 'CoreSimulator', 'Caches'),
        ],
        risk: 'safe',
        command: 'xcrun simctl delete unavailable',
        note: 'only simulators for uninstalled runtimes are deleted automatically',
      },
      {
        category: 'xcode-device-support',
        label: 'Xcode device support symbols',
        paths: [
          join(developer, 'Xcode', 'iOS DeviceSupport'),
          join(developer, 'Xcode', 'watchOS DeviceSupport'),
        ],
        risk: 'moderate',
        command:
          'rm -rf ~/Library/Developer/Xcode/"iOS DeviceSupport"/<old-version>',
        note: 'Xcode re-copies symbols when that OS version is attached again',
      },
      {
        category: 'xcode-archives',
        label: 'Xcode archives',
        paths: [join(developer, 'Xcode', 'Archives')],
        risk: 'high',
        command:
          'Review in Xcode Organizer; archives hold signed release builds',
      },
      {
        category: 'android-sdk',
        label: 'Android emulator images and AVDs',
        paths: [
          join(library, 'Android', 'sdk', 'system-images'),
          join(home, '.android', 'avd'),
        ],
        risk: 'high',
        command:
          'sdkmanager --uninstall "system-images;<id>" / avdmanager delete avd -n <name>',
        note: 'AVDs hold emulator state',
      },
      {
        category: 'homebrew-cache',
        label: 'Homebrew downloads',
        paths: [join(library, 'Caches', 'Homebrew')],
        risk: 'safe',
        command: 'brew cleanup --prune=7',
      },
      {
        category: 'vm-disks',
        label: 'Docker/Colima/Lima/OrbStack VM disks',
        paths: [
          join(home, '.colima'),
          join(home, '.lima'),
          join(library, 'Containers', 'com.docker.docker', 'Data', 'vms'),
          join(library, 'Group Containers', 'HUAQ24HBR6.dev.orbstack', 'data'),
        ],
        risk: 'high',
        command:
          'Reclaim inside the VM (docker system df); VM disks belong to their host owner',
        note: 'sparse VM images; deleting one destroys every container, volume and devbox in it',
      }
    );
  } else {
    targets.push(
      {
        category: 'android-sdk',
        label: 'Android emulator images and AVDs',
        paths: [
          join(home, 'Android', 'Sdk', 'system-images'),
          join(home, '.android', 'avd'),
        ],
        risk: 'high',
        command:
          'sdkmanager --uninstall "system-images;<id>" / avdmanager delete avd -n <name>',
      },
      {
        category: 'vm-disks',
        label: 'Lima VM disks',
        paths: [join(home, '.lima')],
        risk: 'high',
        command: 'Reclaim inside the VM; VM disks belong to their host owner',
      }
    );
  }
  return targets
    .map((target) => ({
      ...target,
      paths: target.paths.filter((path) => existsSync(path)),
    }))
    .filter((target) => target.paths.length > 0);
}

// System and socket dirs that live in tmp but are never agent scratch.
const TMP_SKIP =
  /^(com\.apple|powerlog|tmux-|\.|launchd|boost_interprocess|ssh-|lima|colima|docker)/u;

export interface TmpCandidate {
  path: string;
  newestMtimeMs: number;
}

/**
 * User-owned top-level tmp dirs that are identified tool scratch, hold no git
 * repository and whose newest entry anywhere is older than the cutoff.
 */
export function oldTmpDirs({
  roots = tmpRoots(),
  olderThanMs,
  now = Date.now(),
  uid = process.getuid?.() ?? -1,
}: {
  roots?: string[];
  olderThanMs: number;
  now?: number;
  uid?: number;
}): TmpCandidate[] {
  const found: TmpCandidate[] = [];
  for (const root of roots) {
    let names: string[];
    try {
      names = readdirSync(root);
    } catch {
      continue;
    }
    for (const name of names) {
      if (TMP_SKIP.test(name) || !isScratchDirName(name)) continue;
      const path = join(root, name);
      const info = lstatSync(path, { throwIfNoEntry: false });
      if (
        !info?.isDirectory() ||
        info.isSymbolicLink() ||
        (uid >= 0 && info.uid !== uid)
      )
        continue;
      const newest = newestMtime(path);
      if (now - newest >= olderThanMs && !containsGitRepository(path))
        found.push({ path, newestMtimeMs: newest });
    }
  }
  return found;
}

export function tmpRoots(platform = process.platform) {
  const roots = new Set([tmpdir()]);
  roots.add(platform === 'darwin' ? '/private/tmp' : '/tmp');
  return [...roots];
}

/**
 * Newest mtime anywhere in the tree (directories included, symlinks not
 * followed). A deep, recently written file keeps the whole tree fresh, so an
 * idle check can never be fooled by a shallow walk. Unreadable trees and
 * trees larger than `maxEntries` count as fresh (fail closed).
 */
export function newestMtime(
  path: string,
  { maxEntries = 500_000 }: { maxEntries?: number } = {}
): number {
  let newest = 0;
  let seen = 0;
  const pending = [path];
  try {
    while (pending.length) {
      const target = pending.pop()!;
      if (++seen > maxEntries) return Number.POSITIVE_INFINITY;
      const info = lstatSync(target);
      newest = Math.max(newest, info.mtimeMs, info.ctimeMs);
      if (info.isDirectory() && !info.isSymbolicLink())
        for (const name of readdirSync(target))
          pending.push(join(target, name));
    }
    return newest;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

export interface DockerUsage {
  type: string;
  totalCount: number;
  active: number;
  sizeBytes: number;
  reclaimableBytes: number;
}

const DOCKER_UNITS: Record<string, number> = {
  B: 1,
  KB: 1000,
  MB: 1000 ** 2,
  GB: 1000 ** 3,
  TB: 1000 ** 4,
  kB: 1000,
};

export function parseDockerSize(value: string) {
  const match = value.trim().match(/^([0-9.]+)\s*([kKMGT]?B)/u);
  if (!match) return 0;
  return Math.round(Number(match[1]) * (DOCKER_UNITS[match[2]!] ?? 1));
}

/** `docker system df` rows, or null when no daemon answers within 10s. */
export function dockerUsage(
  run: (args: string[]) => { status: number | null; stdout: string } = (args) =>
    spawnSync('docker', args, { encoding: 'utf8', timeout: 10_000 })
): DockerUsage[] | null {
  const result = run(['system', 'df', '--format', '{{json .}}']);
  if (result.status !== 0) return null;
  return result.stdout
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const row = JSON.parse(line) as Record<string, string>;
      return {
        type: row.Type ?? 'unknown',
        totalCount: Number(row.TotalCount ?? 0),
        active: Number(row.Active ?? 0),
        sizeBytes: parseDockerSize(row.Size ?? '0B'),
        reclaimableBytes: parseDockerSize(row.Reclaimable ?? '0B'),
      };
    });
}

export interface DockerVolume {
  name: string;
  project: string;
  sizeBytes: number;
  links: number;
}

/** Supabase CLI local volumes (label `com.supabase.cli.project`) with sizes. */
export function supabaseVolumes(
  run: (args: string[]) => { status: number | null; stdout: string } = (args) =>
    spawnSync('docker', args, { encoding: 'utf8', timeout: 60_000 })
): DockerVolume[] {
  const result = run(['system', 'df', '-v', '--format', '{{json .Volumes}}']);
  if (result.status !== 0) return [];
  let rows: Record<string, string>[];
  try {
    rows = JSON.parse(result.stdout) as Record<string, string>[];
  } catch {
    return [];
  }
  return (Array.isArray(rows) ? rows : []).flatMap((row) => {
    const project = /(?:^|,)com\.supabase\.cli\.project=([^,]*)/u.exec(
      row.Labels ?? ''
    )?.[1];
    if (project === undefined || typeof row.Name !== 'string') return [];
    return [
      {
        name: row.Name,
        project,
        sizeBytes: parseDockerSize(row.Size ?? '0B'),
        links: Number(row.Links ?? 0) || 0,
      },
    ];
  });
}

/** Device directories of simulators whose runtime is no longer installed. */
export function unavailableSimulators(
  run: (args: string[]) => { status: number | null; stdout: string } = (args) =>
    spawnSync('xcrun', args, { encoding: 'utf8', timeout: 20_000 })
): string[] {
  if (process.platform !== 'darwin') return [];
  const result = run(['simctl', 'list', 'devices', 'unavailable', '--json']);
  if (result.status !== 0) return [];
  try {
    const parsed = JSON.parse(result.stdout) as {
      devices?: Record<string, { dataPath?: unknown }[]>;
    };
    return Object.values(parsed.devices ?? {})
      .flat()
      .flatMap((device) =>
        typeof device.dataPath === 'string' && device.dataPath.endsWith('/data')
          ? [device.dataPath.slice(0, -'/data'.length)]
          : []
      );
  } catch {
    return [];
  }
}
