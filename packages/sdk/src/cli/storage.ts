import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import {
  analyzeStorage,
  defaultVolumePaths,
  type StorageReport,
  storageVolumes,
  type VolumeReport,
} from './storage-analyze';
import {
  formatBytes,
  parseByteSize,
  storageThresholds,
} from './storage-headroom';
import { holdsDirs, readHolds } from './storage-holds';
import { storageHome } from './storage-hysteresis';
import {
  listProcessCwdsStrict,
  listVisibleCwds,
  openFilesUnder,
  scanProcesses,
} from './storage-liveness';
import { privateTreeProof } from './storage-privacy';
import {
  AUTO_CATEGORIES,
  defaultMaxRemoveBytes,
  NAMED_CATEGORIES,
  pruneStorage,
} from './storage-prune';
import {
  renderSuggestions,
  type StorageAction,
  suggestActions,
} from './storage-suggest';
import type { StorageCategory } from './storage-targets';
import { ghPullRequests } from './storage-worktrees';

export function storageHelp() {
  return `ttr storage — find what fills a machine's disks and reclaim it safely

Usage: ttr storage <status|analyze|suggest|prune|reclaim|fleet> [options]

  status [--json] [--path P]   free/used space, pressure and inodes per volume
  analyze [--json]             rank consumers by real unique bytes
  suggest [--json]             cleanup actions with reclaimable bytes, risk and command
  prune [--apply]              dry run by default; --apply removes only within bounds
  reclaim [--apply]            automatic-reclaim plan for this host; --apply runs
                               it now under this user's cleanup lease (stops at the
                               recover thresholds; receipts in the storage home)
  fleet [--json]               disk headroom each devbox runner reports (needs ttr login)

Options:
  --repo <path>                repository to inspect (repeat); default: the
                               current repo plus ttr resources project roots
  --holds-dir <dir>            extra hold files dir (every file, any project),
                               added to ~/.t3/cleanup/holds.d and TTR_STORAGE_HOLDS_DIRS
  --older-than <days>          idle age for tmp, DerivedData, caches (default 7;
                               tmp candidates in analyze use 3)
  --offline                    skip GitHub PR lookups (merged = ancestry only)
  --no-docker                  skip Docker queries
  --max-entries <n>            per-tree walk cap (default 2000000)
Prune options:
  --category <id>              repeat; default: ${AUTO_CATEGORIES.join(', ')}
                               named-only: ${NAMED_CATEGORIES.join(', ')}
  --max-remove <size>          total bound, e.g. 20G (default 20G)
  --path <path>                narrow to a checkout/dir (required for node-modules-stale)
  --name <volume>              Supabase volume to remove (required for supabase-volumes)

Never removed: dirty, unmerged, locked, current, busy or held worktrees; the
primary checkout; source; preserve/* branches; any held path (hold files cover
a path, everything below and above it); VM disks, Trash, archives and AVDs.
Every removal first re-checks holds, every process's cwd and open files (lsof);
when another user's or root's processes cannot be inspected nothing is proven
unused, so the step is skipped. An invalid hold line stops the run. Trees are
removed by verified directory identity, never across a symlink or mount.
Docker steps run only against a verified local unix-socket daemon.
Merged-clean worktrees are removed with plain \`git worktree remove\` and their
branch with \`git branch -d\` (never -D). Sizes use APFS private bytes on macOS
and allocated blocks with hard links counted once on Linux; never \`du -L\`.

Thresholds: TTR_STORAGE_MIN_FREE (default 15G), TTR_STORAGE_MIN_FREE_PERCENT
(5), TTR_STORAGE_MIN_FREE_INODE_PERCENT (5). Below a threshold the volume is
critical; below twice a threshold it is low. Heavy ttr resources admission
closes below the minimum and reopens at TTR_STORAGE_RECOVER_FREE,
TTR_STORAGE_RECOVER_FREE_PERCENT and TTR_STORAGE_RECOVER_FREE_INODE_PERCENT
(default twice each). Automatic reclaim is off by default: opt in with
TTR_STORAGE_AUTO_RECLAIM=1 or a "1" in <storage home>/auto-reclaim; a false
value (0/false/off/no) in either is a kill switch, manual --apply included;
TTR_STORAGE_AUTO_RECLAIM_RULES narrows its rules;
TTR_STORAGE_RECLAIM_COOLDOWN_MINUTES (30) and
TTR_STORAGE_RECLAIM_OLDER_THAN_DAYS (7). Set TTR_ORCHESTRATOR_ID so leases and
receipts name the calling orchestrator.
`;
}

export { storageHome };

interface ParsedOptions {
  action: string;
  json: boolean;
  apply: boolean;
  offline: boolean;
  docker: boolean;
  repos: string[];
  holdsDirs: string[];
  paths: string[];
  names: string[];
  categories: StorageCategory[] | null;
  olderThanDays: number;
  maxRemoveBytes: number;
  maxEntries: number;
  auto: boolean;
  trigger: string | null;
}

const KNOWN_CATEGORIES = new Set<string>([
  ...AUTO_CATEGORIES,
  ...NAMED_CATEGORIES,
  'xcode-device-support',
  'xcode-archives',
  'gradle',
  'android-sdk',
  'vm-disks',
  'playwright',
  'trash',
]);

export function parseStorageArgs(argv: string[]): ParsedOptions {
  const options: ParsedOptions = {
    action: argv[0] && !argv[0].startsWith('-') ? argv[0] : 'status',
    json: false,
    apply: false,
    offline: false,
    docker: true,
    repos: [],
    holdsDirs: [],
    paths: [],
    names: [],
    categories: null,
    olderThanDays: 7,
    maxRemoveBytes: defaultMaxRemoveBytes,
    maxEntries: 2_000_000,
    auto: false,
    trigger: null,
  };
  const start = argv[0] === options.action ? 1 : 0;
  for (let index = start; index < argv.length; index++) {
    const arg = argv[index]!;
    const value = () => {
      const next = argv[++index];
      if (!next || next.startsWith('--'))
        throw new Error(`Missing value for ${arg}.`);
      return next;
    };
    if (arg === '--json') options.json = true;
    else if (arg === '--apply') options.apply = true;
    else if (arg === '--offline') options.offline = true;
    else if (arg === '--no-docker') options.docker = false;
    else if (arg === '--no-update-check') continue;
    else if (arg === '--auto') options.auto = true;
    else if (arg === '--trigger') options.trigger = value();
    else if (arg === '--repo') options.repos.push(resolve(value()));
    else if (arg === '--holds-dir') options.holdsDirs.push(resolve(value()));
    else if (arg === '--path') options.paths.push(resolve(value()));
    else if (arg === '--name') options.names.push(value());
    else if (arg === '--category') {
      const category = value();
      if (!KNOWN_CATEGORIES.has(category))
        throw new Error(`Unknown category ${category}.`);
      options.categories = [
        ...(options.categories ?? []),
        category as StorageCategory,
      ];
    } else if (arg === '--older-than') {
      options.olderThanDays = Number(value());
      if (!Number.isFinite(options.olderThanDays) || options.olderThanDays < 1)
        throw new Error('--older-than must be at least 1 day.');
    } else if (arg === '--max-remove')
      options.maxRemoveBytes = parseByteSize(value());
    else if (arg === '--max-entries') {
      options.maxEntries = Number(value());
      if (!Number.isInteger(options.maxEntries) || options.maxEntries < 1000)
        throw new Error('--max-entries must be an integer of at least 1000.');
    } else throw new Error(`Unknown storage option: ${arg}`);
  }
  if (options.apply && !['prune', 'reclaim'].includes(options.action))
    throw new Error('--apply is only valid with prune or reclaim.');
  return options;
}

export function renderVolumes(volumes: VolumeReport[]) {
  return volumes
    .map(
      (volume) =>
        `${volume.pressure.toUpperCase().padEnd(8)} ${volume.path}: ${formatBytes(volume.freeBytes)} free of ${formatBytes(volume.totalBytes)} (${volume.freePercent.toFixed(1)}%)${volume.inodeFreePercent == null ? '' : `, inodes ${volume.inodeFreePercent.toFixed(1)}% free`}${volume.reasons.length ? ` — ${volume.reasons.join('; ')}` : ''}`
    )
    .join('\n');
}

export function renderAnalysis(report: StorageReport, limit = 40) {
  const totals = new Map<string, number>();
  for (const item of report.items)
    totals.set(
      item.category,
      (totals.get(item.category) ?? 0) + item.uniqueBytes
    );
  const counts = (cls: string) =>
    report.worktrees.filter((entry) => entry.classification === cls).length;
  return [
    renderVolumes(report.volumes),
    '',
    `Method: ${report.method === 'apfs-private' ? 'APFS private bytes (clones count 0)' : 'allocated blocks, hard links once'}`,
    `Worktrees: ${report.worktrees.length} (dirty ${counts('dirty')}, unmerged ${counts('unmerged')}, merged-clean ${counts('merged-clean')}, orphaned ${counts('orphaned')}, held ${report.worktrees.filter((entry) => entry.heldBy.length).length})`,
    '',
    'By category (unique bytes):',
    ...[...totals]
      .sort((a, b) => b[1] - a[1])
      .map(
        ([category, bytes]) =>
          `  ${formatBytes(bytes).padStart(8)}  ${category}`
      ),
    '',
    `Top ${Math.min(limit, report.items.length)} consumers:`,
    ...report.items
      .slice(0, limit)
      .map(
        (item) =>
          `  ${formatBytes(item.uniqueBytes).padStart(8)}  [${item.category}/${item.risk}] ${item.label}  ${item.path}${item.truncated ? ' (truncated)' : ''}`
      ),
    ...(report.warnings.length
      ? ['', ...report.warnings.map((warning) => `warning: ${warning}`)]
      : []),
  ].join('\n');
}

/** Last suggestions, read by `ttr resources` when it refuses on low disk. */
export async function writeSuggestionCache(
  actions: StorageAction[],
  home = storageHome()
) {
  const file = join(home, 'last-suggest.json');
  await mkdir(dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  await writeFile(
    temp,
    `${JSON.stringify({ generatedAt: new Date().toISOString(), actions: actions.slice(0, 10) }, null, 2)}\n`,
    { mode: 0o600 }
  );
  await rename(temp, file);
}

export async function readSuggestionCache(
  home = storageHome(),
  maxAgeMs = 24 * 3_600_000
) {
  try {
    const data = JSON.parse(
      await readFile(join(home, 'last-suggest.json'), 'utf8')
    ) as { generatedAt?: unknown; actions?: unknown };
    if (typeof data.generatedAt !== 'string' || !Array.isArray(data.actions))
      return null;
    if (Date.now() - Date.parse(data.generatedAt) > maxAgeMs) return null;
    return data.actions as StorageAction[];
  } catch {
    return null;
  }
}

/** Analysis tolerates a failed lsof (prune re-reads it and fails closed). */
function analysisCwds() {
  try {
    return listVisibleCwds();
  } catch (error) {
    process.stderr.write(
      `[ttr storage] ${error instanceof Error ? error.message : String(error)}; busy worktrees are not detected in this report, prune re-checks.\n`
    );
    return [];
  }
}

export async function runStorageCommand(argv: string[]) {
  if (argv.includes('--help') || argv.includes('-h') || argv[0] === 'help') {
    process.stdout.write(storageHelp());
    return;
  }
  const options = parseStorageArgs(argv);
  const { thresholds, warnings } = storageThresholds();
  for (const warning of warnings)
    process.stderr.write(`[ttr storage] ${warning}\n`);
  const out = (value: unknown, text: () => string) =>
    process.stdout.write(
      options.json ? `${JSON.stringify(value, null, 2)}\n` : `${text()}\n`
    );

  if (options.action === 'status') {
    const volumes = await storageVolumes(
      defaultVolumePaths(options.paths),
      thresholds
    );
    out({ thresholds, volumes }, () => renderVolumes(volumes));
    if (volumes.some((volume) => volume.pressure === 'critical'))
      process.exitCode = 2;
    return;
  }
  if (options.action === 'fleet') {
    const box = await import('./resources-box-offload.js');
    const { fleetStorage, renderFleetStorage } = await import(
      './storage-fleet.js'
    );
    const client = await box.createSessionClient();
    const rows = fleetStorage(
      await client.devboxes.fleet.snapshot(),
      thresholds
    );
    out({ thresholds, runners: rows }, () => renderFleetStorage(rows));
    if (rows.some((row) => ['critical', 'unknown'].includes(row.pressure)))
      process.exitCode = 2;
    return;
  }
  if (options.action === 'reclaim') {
    const { runReclaimCommand } = await import('./storage-reclaim-command.js');
    await runReclaimCommand(options);
    return;
  }
  if (!['analyze', 'suggest', 'prune'].includes(options.action))
    throw new Error(
      `Unknown storage action: ${options.action}. Use ttr storage --help.`
    );

  const dirs = holdsDirs(process.env, options.holdsDirs);
  const holds = () => readHolds(dirs);
  if (!options.json)
    process.stderr.write(
      '[ttr storage] measuring (APFS/allocated walk; large trees take a minute)...\n'
    );
  const report = await analyzeStorage({
    roots: options.repos,
    holds: holds(),
    thresholds,
    offline: options.offline,
    maxEntries: options.maxEntries,
    cwds: analysisCwds(),
    prs: ghPullRequests,
    docker: options.docker,
  });

  if (options.action === 'analyze') {
    out(report, () => renderAnalysis(report));
    return;
  }
  if (options.action === 'suggest') {
    const suggestions = suggestActions(report);
    await writeSuggestionCache(suggestions.actions).catch(() => undefined);
    out(suggestions, () => renderSuggestions(suggestions));
    return;
  }
  const ttrArgv =
    process.argv[1] && /\.(c?js|ts)$/u.test(process.argv[1])
      ? [process.execPath, process.argv[1]]
      : ['ttr'];
  const result = pruneStorage({
    report,
    apply: options.apply,
    categories: options.categories,
    olderThanDays: options.olderThanDays,
    maxRemoveBytes: options.maxRemoveBytes,
    paths: options.paths,
    names: options.names,
    holds,
    cwds: () => listProcessCwdsStrict(),
    scan: () => scanProcesses(),
    privacy: (path, root) => privateTreeProof(path, root),
    openFiles: (path, openOptions) => openFilesUnder(path, openOptions),
    prs: options.offline ? () => null : ghPullRequests,
    ttrArgv,
  });
  out(result, () =>
    [
      `${options.apply ? 'Applied' : 'Dry run'}: ${formatBytes(result.plannedBytes)} planned (bound ${formatBytes(result.maxRemoveBytes)}, idle > ${result.olderThanDays}d)`,
      ...result.steps.map(
        (step) =>
          `  ${step.status.padEnd(7)} ${formatBytes(step.bytes).padStart(8)}  [${step.category}] ${step.description}  ${step.path}${step.reason ? `\n            ${step.reason}` : ''}`
      ),
      ...(options.apply
        ? []
        : [
            '',
            'Nothing was removed. Re-run with --apply to re-verify every fence and apply this plan.',
          ]),
    ].join('\n')
  );
  if (result.steps.some((step) => step.status === 'failed'))
    process.exitCode = 1;
}
