import { mkdir, mkdtemp, realpath, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { Liveness } from './storage-liveness';
import { planReclaim } from './storage-reclaim-plan';
import { createRepoFixture } from './storage-test-fixtures';
import { realGit } from './storage-worktrees';

const old = new Date(Date.now() - 60 * 86_400_000);
// Idle checks also count ctime, which utimes cannot backdate: plan "later".
const later = Date.now() + 30 * 86_400_000;
const measure = () => ({
  method: 'allocated-dedup' as const,
  results: [{ uniqueBytes: 1024 }],
});
const liveness = (commands: string[]): Liveness => ({
  cwds: () => [],
  openFiles: () => 'none',
  commands: () => commands,
});

async function derivedData() {
  const home = await realpath(await mkdtemp(join(tmpdir(), 'ttr-plan-')));
  const root = join(home, 'Library', 'Developer', 'Xcode', 'DerivedData');
  const project = join(root, 'App-abc');
  await mkdir(project, { recursive: true });
  await writeFile(join(project, 'blob'), 'x');
  for (const path of [join(project, 'blob'), project])
    await utimes(path, old, old);
  return { home, project };
}

describe('automatic reclaim plan', () => {
  it('skips DerivedData while Xcode or xcodebuild runs, at plan time and at re-check', async () => {
    const { home, project } = await derivedData();
    const base = {
      holds: () => [],
      measure,
      git: realGit,
      prs: () => null,
      repos: [],
      olderThanDays: 7,
      now: later,
      home,
      platform: 'darwin' as const,
    };
    expect(
      planReclaim({
        ...base,
        liveness: liveness(['/usr/bin/xcodebuild -scheme App build']),
      })
    ).toEqual([]);
    const commands: string[] = [];
    const [candidate] = planReclaim({ ...base, liveness: liveness(commands) });
    expect(candidate?.path).toBe(project);
    commands.push(
      '/Applications/Xcode.app/Contents/MacOS/Xcode -NSDocumentRevisionsDebugMode'
    );
    expect(candidate?.recheck()).toBe('Xcode or xcodebuild is running');
  });

  it('keeps only candidates on the low volume device', async () => {
    const { home } = await derivedData();
    const plan = (device: number | null) =>
      planReclaim({
        holds: () => [],
        liveness: liveness([]),
        measure,
        git: realGit,
        prs: () => null,
        repos: [],
        olderThanDays: 7,
        now: later,
        home,
        platform: 'darwin',
        device,
        deviceOf: () => 7,
      });
    expect(plan(7)).toHaveLength(1);
    expect(plan(8)).toEqual([]);
    expect(plan(null)).toEqual([]);
  });

  it.each(['directory', 'file', 'bare'])(
    'excludes ignored output containing a %s repository',
    async (kind) => {
      const fixture = await createRepoFixture();
      await writeFile(join(fixture.repo, '.git', 'info', 'exclude'), 'dist\n');
      const merged = await fixture.worktree('merged');
      const artifact = join(merged.path, 'apps', 'web', 'dist');
      const nested = join(artifact, 'project');
      await mkdir(nested, { recursive: true });
      if (kind === 'directory') await mkdir(join(nested, '.git'));
      else if (kind === 'file')
        await writeFile(join(nested, '.git'), 'gitdir: /keep');
      else {
        await writeFile(join(nested, 'HEAD'), 'ref: refs/heads/main');
        await mkdir(join(nested, 'objects'));
        await mkdir(join(nested, 'refs'));
      }
      expect(
        planReclaim({
          holds: () => [],
          liveness: liveness([]),
          measure,
          git: realGit,
          prs: () => null,
          repos: [fixture.repo],
          olderThanDays: 1,
          now: later,
          home: fixture.root,
          platform: 'linux',
        })
      ).toEqual([]);
    }
  );

  it('fetches PR facts once per repo per run, re-checks included', async () => {
    const fixture = await createRepoFixture();
    await writeFile(join(fixture.repo, '.git', 'info', 'exclude'), 'dist\n');
    const merged = await fixture.worktree('merged');
    const artifact = join(merged.path, 'apps', 'web', 'dist');
    await mkdir(artifact, { recursive: true });
    await writeFile(join(artifact, 'bundle.js'), 'x');
    for (const path of [join(artifact, 'bundle.js'), artifact])
      await utimes(path, old, old);
    const prs = vi.fn(() => null);
    const candidates = planReclaim({
      holds: () => [],
      liveness: liveness([]),
      measure,
      git: realGit,
      prs,
      repos: [fixture.repo],
      olderThanDays: 1,
      now: Date.now() + 3 * 86_400_000,
      home: fixture.root,
      platform: 'linux',
    });
    expect(candidates.map((candidate) => candidate.path)).toEqual([artifact]);
    for (const candidate of candidates) {
      candidate.recheck();
      candidate.recheck();
    }
    expect(prs).toHaveBeenCalledTimes(1);
  });
});
