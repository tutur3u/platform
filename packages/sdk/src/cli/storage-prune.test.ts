import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { StorageReport } from './storage-analyze';
import { defaultStorageThresholds } from './storage-headroom';
import type { Hold } from './storage-holds';
import { pruneStorage } from './storage-prune';
import { createRepoFixture, git } from './storage-test-fixtures';
import { classifyWorktrees } from './storage-worktrees';

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0))
    await rm(root, { recursive: true, force: true });
});
const later = Date.now() + 3 * 86_400_000;

function report(
  repo: string,
  holds: Hold[],
  overrides: Partial<StorageReport> = {},
  now = later
): StorageReport {
  return {
    version: 1,
    generatedAt: new Date(now).toISOString(),
    platform: process.platform,
    method: 'allocated-dedup',
    thresholds: defaultStorageThresholds,
    volumes: [],
    items: [],
    worktrees: repo
      ? classifyWorktrees({ repo, holds, cwds: [], currentDir: '/', now }).map(
          (entry) => ({ ...entry, uniqueBytes: 1024 })
        )
      : [],
    nodeModules: [],
    docker: null,
    tmpOlderThanDays: 3,
    warnings: [],
    ...overrides,
  };
}

function prune(
  repo: string,
  holds: Hold[],
  options: Partial<Parameters<typeof pruneStorage>[0]> = {}
) {
  return pruneStorage({
    report: report(repo, holds),
    apply: true,
    categories: ['worktrees'],
    olderThanDays: 7,
    maxRemoveBytes: 1024 ** 3,
    paths: [],
    names: [],
    holds: () => holds,
    cwds: () => [],
    openFiles: () => 'none',
    prs: () => null,
    now: later,
    ...options,
  });
}

// Real git worktrees; slow under a loaded host.
describe('storage prune safety fences', { timeout: 30_000 }, () => {
  it('keeps a merged-clean worktree whose ignored files are not rebuildable', async () => {
    // Reviewer reproduction: `git worktree remove` deletes ignored files
    // without --force, so coordination notes and env files were lost.
    const fixture = await createRepoFixture();
    roots.push(fixture.root);
    await writeFile(
      join(fixture.repo, '.git', 'info', 'exclude'),
      'tmp/\n.env.local\n.next\n'
    );
    const notes = await fixture.worktree('notes');
    await mkdir(join(notes.path, 'tmp', 'agent-coordination'), {
      recursive: true,
    });
    await writeFile(
      join(notes.path, 'tmp', 'agent-coordination', 'backlog.md'),
      'private backlog\n'
    );
    await writeFile(join(notes.path, '.env.local'), 'SECRET_NAME=value\n');
    // Rebuildable ignored output alone does not fence a worktree.
    const built = await fixture.worktree('built');
    await mkdir(join(built.path, 'node_modules', 'pkg'), { recursive: true });
    await writeFile(join(built.path, 'node_modules', 'pkg', 'index.js'), '');
    await mkdir(join(built.path, 'apps', 'web', '.next'), { recursive: true });
    await writeFile(join(built.path, 'apps', 'web', '.next', 'build'), '');

    const dry = prune(fixture.repo, [], { apply: false });
    const kept = dry.steps.find((step) => step.path === notes.path);
    expect(kept?.status).toBe('skipped');
    expect(kept?.reason).toContain(
      'ignored non-rebuildable path(s) git worktree remove would delete'
    );
    expect(kept?.reason).toContain('.env.local');
    expect(kept?.reason).toContain('tmp/');

    const result = prune(fixture.repo, []);
    expect(result.steps.find((step) => step.path === notes.path)?.status).toBe(
      'skipped'
    );
    expect(
      existsSync(join(notes.path, 'tmp', 'agent-coordination', 'backlog.md'))
    ).toBe(true);
    expect(existsSync(join(notes.path, '.env.local'))).toBe(true);
    expect(result.steps.find((step) => step.path === built.path)?.status).toBe(
      'done'
    );
    expect(existsSync(built.path)).toBe(false);
  });

  it('removes only the merged clean worktree and deletes its branch with -d', async () => {
    const fixture = await createRepoFixture();
    roots.push(fixture.root);
    const merged = await fixture.worktree('merged');
    const dirty = await fixture.worktree('dirty');
    await writeFile(join(dirty.path, 'notes.txt'), 'uncommitted\n');
    const unmerged = await fixture.worktree('unmerged', { commit: true });
    const held = await fixture.worktree('held');
    const holds = [{ path: held.path, owner: 'mastermind', glob: false }];

    const result = prune(fixture.repo, holds);

    expect(existsSync(merged.path)).toBe(false);
    expect(git(fixture.repo, 'branch', '--list', 'merged')).toBe('');
    for (const kept of [dirty.path, unmerged.path, held.path, fixture.repo])
      expect(existsSync(kept)).toBe(true);
    expect(git(fixture.repo, 'branch', '--list', 'unmerged')).toContain(
      'unmerged'
    );
    const reasons = Object.fromEntries(
      result.steps.map((step) => [
        step.path,
        `${step.status}:${step.reason ?? ''}`,
      ])
    );
    expect(reasons[merged.path]).toBe('done:');
    expect(reasons[dirty.path]).toMatch(/^skipped:.*dirty/u);
    expect(reasons[unmerged.path]).toMatch(/^skipped:.*unmerged/u);
    expect(reasons[held.path]).toBe('skipped:held by mastermind');
  });

  it('is a dry run unless apply is set', async () => {
    const fixture = await createRepoFixture();
    roots.push(fixture.root);
    const merged = await fixture.worktree('merged');
    const result = prune(fixture.repo, [], { apply: false });
    expect(result.steps.find((step) => step.path === merged.path)?.status).toBe(
      'planned'
    );
    expect(existsSync(merged.path)).toBe(true);
  });

  it('re-verifies right before removal: a tree that became dirty or held is kept', async () => {
    const fixture = await createRepoFixture();
    roots.push(fixture.root);
    const becameDirty = await fixture.worktree('became-dirty');
    const becameHeld = await fixture.worktree('became-held');
    const planReport = report(fixture.repo, []);
    await writeFile(
      join(becameDirty.path, 'late.txt'),
      'written after planning\n'
    );
    const lateHolds = [
      { path: becameHeld.path, owner: 'late-owner', glob: false },
    ];
    // The plan reads no holds; the hold lands before apply re-checks.
    let reads = 0;
    const result = prune(fixture.repo, [], {
      report: planReport,
      holds: () => (reads++ === 0 ? [] : lateHolds),
    });
    expect(existsSync(becameDirty.path)).toBe(true);
    expect(existsSync(becameHeld.path)).toBe(true);
    expect(
      result.steps.find((step) => step.path === becameDirty.path)
    ).toMatchObject({ status: 'failed' });
    expect(
      result.steps.find((step) => step.path === becameHeld.path)
    ).toMatchObject({ status: 'failed', reason: 'held by late-owner' });
  });

  it('keeps recently active trees, busy trees and preserve/* branches', async () => {
    const fixture = await createRepoFixture();
    roots.push(fixture.root);
    const fresh = await fixture.worktree('fresh');
    const busy = await fixture.worktree('busy');
    const preserve = await fixture.worktree('preserve/snapshot');
    const now = Date.now();
    const result = pruneStorage({
      report: report(fixture.repo, [], {}, now),
      apply: true,
      categories: ['worktrees'],
      olderThanDays: 7,
      maxRemoveBytes: 1024 ** 3,
      paths: [],
      names: [],
      holds: () => [],
      cwds: () => [],
      openFiles: () => 'none',
      prs: () => null,
      now,
    });
    expect(existsSync(fresh.path)).toBe(true);
    expect(
      result.steps.find((step) => step.path === fresh.path)?.reason
    ).toMatch(/recently active/u);
    const busyResult = prune(fixture.repo, [], {
      cwds: () => [{ pid: 1, cwd: busy.path }],
    });
    expect(existsSync(busy.path)).toBe(true);
    expect(
      busyResult.steps.find((step) => step.path === busy.path)?.reason
    ).toBe('a process is working inside');
    expect(existsSync(preserve.path)).toBe(true);
    expect(
      git(fixture.repo, 'branch', '--list', 'preserve/snapshot')
    ).toContain('preserve/snapshot');
  });

  it('respects --max-remove and --path', async () => {
    const fixture = await createRepoFixture();
    roots.push(fixture.root);
    const first = await fixture.worktree('first');
    const second = await fixture.worktree('second');
    const bounded = prune(fixture.repo, [], {
      apply: false,
      maxRemoveBytes: 1500,
    });
    expect(
      bounded.steps.filter((step) => step.status === 'planned')
    ).toHaveLength(1);
    expect(
      bounded.steps.some((step) => step.reason?.startsWith('over --max-remove'))
    ).toBe(true);
    const narrowed = prune(fixture.repo, [], {
      apply: false,
      paths: [second.path],
    });
    expect(narrowed.steps.map((step) => step.path)).toEqual([second.path]);
    expect(existsSync(first.path)).toBe(true);
  });
});

describe('storage prune categories', () => {
  const base = (overrides: Partial<Parameters<typeof pruneStorage>[0]>) =>
    pruneStorage({
      report: { ...report('', []), worktrees: [] },
      apply: false,
      categories: null,
      olderThanDays: 7,
      maxRemoveBytes: 1024 ** 3,
      paths: [],
      names: [],
      holds: () => [],
      cwds: () => [],
      openFiles: () => 'none',
      prs: () => null,
      exec: () => ({ status: 0, stdout: '', stderr: '' }),
      ...overrides,
    });

  it('refuses report-only categories and unnamed destructive targets', () => {
    expect(() => base({ categories: ['trash'] })).toThrow(/reported only/u);
    expect(() => base({ categories: ['vm-disks'] })).toThrow(/reported only/u);
    expect(() => base({ categories: ['supabase-volumes'] })).toThrow(/--name/u);
    expect(() => base({ categories: ['node-modules-stale'] })).toThrow(
      /--path/u
    );
  });

  it('removes only explicitly named, unattached Supabase volumes', () => {
    const calls: string[][] = [];
    const docker = {
      usage: [],
      supabaseVolumes: [
        { name: 'supabase_db_old', project: 'old', sizeBytes: 10, links: 0 },
        { name: 'supabase_db_live', project: 'live', sizeBytes: 10, links: 1 },
      ],
    };
    const result = base({
      report: { ...report('', []), worktrees: [], docker },
      apply: true,
      categories: ['supabase-volumes'],
      names: ['supabase_db_old', 'supabase_db_live'],
      env: {},
      isSocket: (path) => path === '/var/run/docker.sock',
      exec: (argv) => {
        calls.push(argv);
        return argv[1] === 'context'
          ? { status: 0, stdout: '"unix:///var/run/docker.sock"', stderr: '' }
          : { status: 0, stdout: '', stderr: '' };
      },
    });
    // Pinned to the verified local socket, after the endpoint check.
    expect(calls.filter((argv) => argv[1] !== 'context')).toEqual([
      [
        'docker',
        '-H',
        'unix:///var/run/docker.sock',
        'volume',
        'rm',
        'supabase_db_old',
      ],
    ]);
    const remote = base({
      report: { ...report('', []), worktrees: [], docker },
      apply: true,
      categories: ['supabase-volumes'],
      names: ['supabase_db_old'],
      env: {},
      isSocket: () => true,
      exec: (argv) => {
        calls.push(argv);
        return argv[1] === 'context'
          ? { status: 0, stdout: '"ssh://ops@prod-db"', stderr: '' }
          : { status: 0, stdout: '', stderr: '' };
      },
    });
    expect(remote.steps[0]).toMatchObject({
      status: 'failed',
      reason: expect.stringMatching(/not a local unix socket/u),
    });
    expect(calls.filter((argv) => argv.includes('rm'))).toHaveLength(1);
    expect(
      result.steps.find(
        (step) => step.path === 'docker-volume:supabase_db_live'
      )?.status
    ).toBe('skipped');
  });

  it('removes idle tmp dirs only when named, never held ones', async () => {
    // Top-level identified scratch dirs, as `analyze` reports tmp-old items.
    const idle = await mkdtemp(join(tmpdir(), 'ttr-idle-'));
    const kept = await mkdtemp(join(tmpdir(), 'ttr-kept-'));
    roots.push(idle, kept);
    for (const dir of [idle, kept]) {
      await writeFile(join(dir, 'blob'), 'x');
      const old = new Date(Date.now() - 30 * 86_400_000);
      await utimes(join(dir, 'blob'), old, old);
      await utimes(dir, old, old);
    }
    const items = [idle, kept].map((path) => ({
      category: 'tmp-old' as const,
      label: 'idle 30d',
      path,
      uniqueBytes: 30 * 1024 ** 2,
      allocatedBytes: 0,
      files: 1,
      truncated: false,
      risk: 'moderate' as const,
    }));
    const removed: string[] = [];
    const run = (
      categories: Parameters<typeof pruneStorage>[0]['categories']
    ) =>
      base({
        report: { ...report('', []), worktrees: [], items },
        apply: true,
        categories,
        holds: () => [{ path: kept, owner: 'evidence', glob: false }],
        removeTree: (identity) => {
          removed.push(identity.target);
        },
      });
    run(null);
    expect(removed).toEqual([]);
    const result = run(['tmp-old']);
    // The fixture root is not a tmp root on every OS; either way, held stays.
    expect(removed).not.toContain(kept);
    expect(result.steps.find((step) => step.path === kept)?.reason).toBe(
      'held by evidence'
    );
  });
});
