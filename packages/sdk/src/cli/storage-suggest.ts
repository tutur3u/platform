import { join } from 'node:path';
import type { StorageItem, StorageReport } from './storage-analyze';
import { formatBytes, GiB } from './storage-headroom';
import type { StorageCategory, StorageRisk } from './storage-targets';
import { WORKTREE_MIN_IDLE_DAYS } from './storage-worktrees';

export interface StorageAction {
  category: StorageCategory;
  title: string;
  path: string;
  reclaimableBytes: number;
  risk: StorageRisk;
  /** Exact command; `ttr storage prune` commands re-verify every fence. */
  command: string;
  /** `auto`: plain `prune --apply`; `named`: needs `--category`; `manual`: never applied by ttr. */
  apply: 'auto' | 'named' | 'manual';
  note?: string;
}

export interface StorageReview {
  path: string;
  reason: string;
  uniqueBytes: number;
}

const quote = (value: string) =>
  /^[\w@%+=:,./-]+$/u.test(value)
    ? value
    : `'${value.replace(/'/gu, `'\\''`)}'`;

const riskOrder: Record<StorageRisk, number> = {
  safe: 0,
  moderate: 1,
  high: 2,
};

/** Minimum size worth suggesting per category, to keep the list actionable. */
const MIN_BYTES = 64 * 1024 ** 2;

function sumBy(items: StorageItem[], category: StorageCategory) {
  return items
    .filter((item) => item.category === category)
    .reduce((sum, item) => sum + item.uniqueBytes, 0);
}

export function suggestActions(report: StorageReport): {
  actions: StorageAction[];
  review: StorageReview[];
} {
  const actions: StorageAction[] = [];
  const review: StorageReview[] = [];
  // Held paths are never proposed; large ones are listed for their owner.
  const items = report.items.filter((item) => !item.heldBy?.length);
  for (const item of report.items)
    if (item.heldBy?.length && item.uniqueBytes >= MIN_BYTES)
      review.push({
        path: item.path,
        reason: `${item.category} held by ${item.heldBy.join(', ')}`,
        uniqueBytes: item.uniqueBytes,
      });

  for (const worktree of report.worktrees) {
    if (worktree.classification === 'primary') continue;
    if (worktree.classification === 'orphaned') {
      actions.push({
        category: 'worktrees',
        title: `Prune orphaned worktree record ${worktree.branch ?? ''}`.trim(),
        path: worktree.path,
        reclaimableBytes: 0,
        risk: 'safe',
        command: `git -C ${quote(worktree.repo)} worktree prune`,
        apply: 'named',
      });
      continue;
    }
    if (worktree.fences.length) {
      if (
        worktree.uniqueBytes >= MIN_BYTES ||
        worktree.classification === 'dirty'
      )
        review.push({
          path: worktree.path,
          reason: `${worktree.classification} (${worktree.owner}): ${worktree.fences.join('; ')}`,
          uniqueBytes: worktree.uniqueBytes,
        });
      continue;
    }
    if ((worktree.idleDays ?? 0) < WORKTREE_MIN_IDLE_DAYS) {
      review.push({
        path: worktree.path,
        reason: `merged-clean but active within ${WORKTREE_MIN_IDLE_DAYS}d (${worktree.owner}); re-run suggest later`,
        uniqueBytes: worktree.uniqueBytes,
      });
      continue;
    }
    const branch =
      worktree.branch && !worktree.branch.startsWith('preserve/')
        ? worktree.branch
        : null;
    actions.push({
      category: 'worktrees',
      title: `Remove merged clean worktree ${worktree.branch ?? worktree.head?.slice(0, 12)} (${worktree.evidence})`,
      path: worktree.path,
      reclaimableBytes: worktree.uniqueBytes,
      risk: 'safe',
      command: `git -C ${quote(worktree.repo)} worktree remove ${quote(worktree.path)}${branch ? ` && git -C ${quote(worktree.repo)} branch -d ${quote(branch)}` : ''}`,
      apply: 'named',
      note: 'equivalent: ttr storage prune --category worktrees --apply',
    });
  }

  for (const item of items.filter(
    (entry) => entry.category === 'node-modules-stale'
  )) {
    const checkout = item.worktree ?? join(item.path, '..');
    const primary =
      report.worktrees.find((entry) => entry.path === checkout)
        ?.classification === 'primary';
    actions.push({
      category: 'node-modules-stale',
      title: `Reinstall stale node_modules (${item.label})`,
      path: item.path,
      reclaimableBytes: item.uniqueBytes,
      risk: 'moderate',
      command: `ttr storage prune --category node-modules-stale --path ${quote(checkout)} --apply`,
      apply: 'named',
      note: `${primary ? 'shared primary checkout: get owner approval first; ' : ''}removes node_modules, then runs ttr resources run -- bun install --frozen-lockfile`,
    });
  }

  const artifacts = sumBy(
    items.filter((item) => item.risk === 'safe'),
    'build-artifacts'
  );
  if (artifacts >= MIN_BYTES)
    actions.push({
      category: 'build-artifacts',
      title:
        'Remove turbo/.next/dist/build outputs in clean, merged, idle worktrees',
      path: '(worktrees)',
      reclaimableBytes: artifacts,
      risk: 'safe',
      command:
        'bun worktree:prune-artifacts && bun worktree:prune-artifacts --apply',
      apply: 'auto',
      note: 'dry run first; skips dirty, held, unmerged, locked and recently written trees',
    });
  // Only fence-clear worktrees (risk safe), using the primary checkout's
  // script; rust targets in fenced trees stay with their owner.
  for (const item of items.filter(
    (entry) =>
      entry.category === 'rust-target' &&
      entry.risk === 'safe' &&
      entry.uniqueBytes >= MIN_BYTES
  )) {
    const repo =
      report.worktrees.find((entry) => entry.path === item.worktree)?.repo ??
      item.worktree ??
      '.';
    actions.push({
      category: 'rust-target',
      title: 'Prune stale Rust build cache',
      path: item.path,
      reclaimableBytes: item.uniqueBytes,
      risk: 'safe',
      command: `node ${quote(join(repo, 'scripts', 'rust-cache.js'))} prune --apply --target ${quote(item.path)}`,
      apply: 'auto',
      note: 'bounded by the rust-cache age/size policy; reclaimable is an upper bound',
    });
  }

  const machine: {
    category: StorageCategory;
    title: string;
    command: string;
    apply: StorageAction['apply'];
    risk: StorageRisk;
    note?: string;
    min?: number;
  }[] = [
    {
      category: 'xcode-derived-data',
      title: 'Remove Xcode DerivedData older than the age bound',
      command: 'ttr storage prune --category xcode-derived-data --apply',
      apply: 'auto',
      risk: 'safe',
      note: 'only project folders idle past --older-than (default 7d); reclaimable is an upper bound',
    },
    {
      category: 'homebrew-cache',
      title: 'Prune Homebrew downloads (also removes old formula versions)',
      command: 'brew cleanup --prune=7',
      apply: 'named',
      risk: 'safe',
    },
    {
      category: 'npm-cache',
      title: 'Clear the npm cache',
      command: 'npm cache clean --force',
      apply: 'named',
      risk: 'safe',
    },
    {
      category: 'bun-cache',
      title: 'Clear the Bun install cache',
      command: 'bun pm cache rm',
      apply: 'named',
      risk: 'moderate',
      note: 'next install re-downloads; existing node_modules clones keep working',
      min: GiB,
    },
    {
      category: 'pub-cache',
      title: 'Clear the pub cache',
      command: 'flutter pub cache clean --force',
      apply: 'named',
      risk: 'moderate',
      min: GiB,
    },
    {
      category: 'gradle',
      title: 'Clear Gradle caches',
      command: 'gradle --stop; rm -rf ~/.gradle/caches',
      apply: 'manual',
      risk: 'moderate',
      min: GiB,
    },
    {
      category: 'playwright',
      title: 'Remove unused Playwright browsers',
      command: 'bunx playwright uninstall',
      apply: 'manual',
      risk: 'moderate',
    },
    {
      category: 'xcode-device-support',
      title: 'Remove device support for iOS versions you no longer attach',
      command:
        'open ~/Library/Developer/Xcode/"iOS DeviceSupport" and delete old versions',
      apply: 'manual',
      risk: 'moderate',
    },
    {
      category: 'trash',
      title: 'Empty the Trash after reviewing it',
      command:
        process.platform === 'darwin'
          ? 'Finder > Empty Trash'
          : 'gio trash --empty',
      apply: 'manual',
      risk: 'high',
    },
  ];
  const simulators = items.filter(
    (item) => item.category === 'xcode-simulators' && item.risk === 'safe'
  );
  const simulatorBytes = simulators.reduce(
    (sum, item) => sum + item.uniqueBytes,
    0
  );
  if (simulatorBytes >= MIN_BYTES)
    actions.push({
      category: 'xcode-simulators',
      title: `Delete ${simulators.length} simulator(s) for uninstalled runtimes`,
      path: simulators[0]!.path,
      reclaimableBytes: simulatorBytes,
      risk: 'safe',
      command: 'ttr storage prune --category xcode-simulators --apply',
      apply: 'auto',
    });
  for (const rule of machine) {
    const bytes = sumBy(items, rule.category);
    if (bytes < (rule.min ?? MIN_BYTES)) continue;
    actions.push({
      ...rule,
      path: items.find((item) => item.category === rule.category)?.path ?? '',
      reclaimableBytes: bytes,
    });
  }

  const build = report.docker?.usage.find((row) => /build/iu.test(row.type));
  if (build && build.reclaimableBytes >= MIN_BYTES)
    actions.push({
      category: 'docker',
      title: 'Prune Docker build cache older than 7 days',
      path: 'docker:build-cache',
      reclaimableBytes: build.reclaimableBytes,
      risk: 'safe',
      command:
        'ttr storage prune --category docker --apply  # local daemon only',
      apply: 'named',
    });
  const images = report.docker?.usage.find((row) => /image/iu.test(row.type));
  if (images && images.reclaimableBytes >= MIN_BYTES)
    actions.push({
      category: 'docker',
      title: 'Remove unused Docker images older than 7 days',
      path: 'docker:images',
      reclaimableBytes: images.reclaimableBytes,
      risk: 'moderate',
      command:
        'ttr storage prune --category docker --apply  # local daemon only',
      apply: 'named',
    });
  for (const volume of report.docker?.supabaseVolumes ?? [])
    if (!volume.links && volume.sizeBytes >= MIN_BYTES)
      review.push({
        path: `docker-volume:${volume.name}`,
        reason: `unused Supabase ${volume.project} volume; remove only if its local data is disposable: ttr storage prune --category supabase-volumes --name ${volume.name} --apply`,
        uniqueBytes: volume.sizeBytes,
      });

  for (const item of items.filter(
    (entry) =>
      entry.category === 'tmp-old' && entry.uniqueBytes >= 25 * 1024 ** 2
  ))
    actions.push({
      category: 'tmp-old',
      title: `Remove idle tmp dir (${item.label})`,
      path: item.path,
      reclaimableBytes: item.uniqueBytes,
      risk: 'moderate',
      command: `ttr storage prune --category tmp-old --path ${quote(item.path)} --apply`,
      apply: 'named',
      note: 'agent evidence often lives in tmp; hold it if it is still needed',
    });
  for (const item of items.filter(
    (entry) => entry.category === 'vm-disks' && entry.uniqueBytes >= GiB
  ))
    review.push({
      path: item.path,
      reason:
        'VM disk image; reclaim inside the VM (its owner runs ttr storage there)',
      uniqueBytes: item.uniqueBytes,
    });

  actions.sort(
    (a, b) =>
      riskOrder[a.risk] - riskOrder[b.risk] ||
      b.reclaimableBytes - a.reclaimableBytes
  );
  review.sort((a, b) => b.uniqueBytes - a.uniqueBytes);
  return { actions, review };
}

export function renderSuggestions({
  actions,
  review,
}: ReturnType<typeof suggestActions>) {
  const lines: string[] = [];
  const total = (risk: StorageRisk) =>
    actions
      .filter((action) => action.risk === risk)
      .reduce((sum, action) => sum + action.reclaimableBytes, 0);
  lines.push(
    `Reclaimable: safe ${formatBytes(total('safe'))}, moderate ${formatBytes(total('moderate'))}, high ${formatBytes(total('high'))}`
  );
  for (const action of actions) {
    lines.push(
      `\n[${action.risk}/${action.apply}] ${formatBytes(action.reclaimableBytes).padStart(8)}  ${action.title}`
    );
    if (action.path && !action.path.startsWith('('))
      lines.push(`    path: ${action.path}`);
    lines.push(`    run:  ${action.command}`);
    if (action.note) lines.push(`    note: ${action.note}`);
  }
  if (review.length) {
    lines.push('\nNeeds owner review (never removed automatically):');
    for (const entry of review)
      lines.push(
        `  ${formatBytes(entry.uniqueBytes).padStart(8)}  ${entry.path}\n            ${entry.reason}`
      );
  }
  return `${lines.join('\n')}\n`;
}
