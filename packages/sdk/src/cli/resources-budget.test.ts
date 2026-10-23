import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  type BudgetEntry,
  budgetSchema,
  budgetStatus,
  type Demand,
  inferTokens,
  projectFor,
  type ResourceBudget,
  selectBudgetTicket,
  ticketDemand,
} from './resources-budget';

// The decided skr-studio policy: 12 lanes / 24 tokens / 320 GiB, split 6/12/160
// between Tuturuuu and Upskii, with explicit borrowing.
const studio = (overrides: Partial<ResourceBudget> = {}): ResourceBudget =>
  budgetSchema.parse({
    lanes: 12,
    tokens: 24,
    memoryGiB: 320,
    borrow: true,
    projects: [
      {
        id: 'tuturuuu',
        roots: ['/work/tuturuuu'],
        lanes: 6,
        tokens: 12,
        memoryGiB: 160,
      },
      {
        id: 'upskii',
        roots: ['/work/upskii'],
        lanes: 6,
        tokens: 12,
        memoryGiB: 160,
      },
    ],
    ...overrides,
  });
const demand = (
  project: string,
  tokens: number,
  memoryGiB = tokens * (320 / 24)
): Demand => ({
  project,
  tokens,
  memoryGiB,
});
let clock = 0;
const ticket = (project: string, tokens: number): BudgetEntry => {
  clock += 1;
  return {
    path: `/queue/${clock}-${project}`,
    queuedAt: new Date(1_700_000_000_000 + clock * 1000).toISOString(),
    demand: demand(project, tokens),
  };
};
const owners = (...list: [string, number][]) =>
  list.map(([project, tokens]) => ({ demand: demand(project, tokens) }));
const select = (
  budget: ResourceBudget,
  waiting: BudgetEntry[],
  running: { demand?: Demand }[]
) => selectBudgetTicket(budget, waiting, running);

describe('budget configuration', () => {
  it('accepts the decided Studio policy', () => {
    expect(studio().projects.map((entry) => entry.id)).toEqual([
      'tuturuuu',
      'upskii',
    ]);
  });

  it.each([
    ['shares above the ceiling', { tokens: 20 }],
    [
      'duplicate project ids',
      {
        projects: [
          { id: 'a', roots: ['/a'], lanes: 1, tokens: 1, memoryGiB: 1 },
          { id: 'a', roots: ['/b'], lanes: 1, tokens: 1, memoryGiB: 1 },
        ],
      },
    ],
    [
      'the reserved "other" id',
      {
        projects: [
          { id: 'other', roots: ['/a'], lanes: 1, tokens: 1, memoryGiB: 1 },
        ],
      },
    ],
  ])('rejects %s', (_, overrides) => {
    expect(() => studio(overrides as Partial<ResourceBudget>)).toThrow();
  });
});

describe('per-ticket token declaration', () => {
  const defaults = { vitestWorkers: 2, buildJobs: 2 };
  it.each([
    ['vitest', ['run', '--maxWorkers=4'], 4],
    ['vitest', ['run', '--max-workers', '6'], 6],
    ['vitest', ['run'], 2],
    ['bunx', ['vitest', 'run', '--maxWorkers=3'], 3],
    ['turbo', ['run', 'build'], 4],
    ['next', ['build'], 4],
    ['cargo', ['build'], 4],
    ['bun', ['run', 'build'], 4],
    ['playwright', ['test'], 2],
    ['supabase', ['db', 'reset'], 2],
    ['bun', ['sb:reset'], 2],
    ['turbo', ['run', 'test'], 2],
    ['node', ['scripts/small.js'], 1],
  ] as const)('%s %j costs %i tokens', (command, args, tokens) => {
    expect(inferTokens(command, [...args], defaults)).toBe(tokens);
  });

  it('honours explicit declarations and clamps to the whole budget', () => {
    const budget = studio();
    const base = {
      cwd: '/work/tuturuuu/apps/web',
      command: 'node',
      args: ['x.js'],
      defaults,
    };
    expect(ticketDemand(budget, base)).toEqual({
      project: 'tuturuuu',
      tokens: 1,
      memoryGiB: 320 / 24,
    });
    expect(
      ticketDemand(budget, {
        ...base,
        env: { TTR_RESOURCES_TOKENS: '5', TTR_RESOURCES_MEMORY_GIB: '40' },
      })
    ).toEqual({
      project: 'tuturuuu',
      tokens: 5,
      memoryGiB: 40,
    });
    expect(
      ticketDemand(budget, { ...base, env: { TTR_RESOURCES_TOKENS: '999' } })
        .tokens
    ).toBe(24);
    expect(ticketDemand(budget, { ...base, cwd: '/elsewhere' }).project).toBe(
      'other'
    );
  });
});

describe('project identity', () => {
  const dirs: string[] = [];
  afterEach(async () => {
    await Promise.all(
      dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))
    );
  });
  it('maps a linked worktree outside the root to its main checkout project', async () => {
    const base = await realpath(await mkdtemp(join(tmpdir(), 'ttr-budget-')));
    dirs.push(base);
    const repo = join(base, 'repos', 'upskii');
    const gitdir = join(repo, '.git', 'worktrees', 'lane-n');
    await mkdir(gitdir, { recursive: true });
    await writeFile(join(gitdir, 'commondir'), '../..\n');
    const worktree = join(base, '.t3', 'worktrees', 'upskii', 't3-cb467b17');
    await mkdir(join(worktree, 'packages', 'app'), { recursive: true });
    await writeFile(join(worktree, '.git'), `gitdir: ${gitdir}\n`);
    const budget = studio({
      projects: [
        {
          id: 'tuturuuu',
          roots: [join(base, 'repos', 'tuturuuu')],
          lanes: 6,
          tokens: 12,
          memoryGiB: 160,
        },
        { id: 'upskii', roots: [repo], lanes: 6, tokens: 12, memoryGiB: 160 },
      ],
    });
    expect(projectFor(budget, join(worktree, 'packages', 'app'))).toBe(
      'upskii'
    );
    expect(projectFor(budget, join(repo, 'src'))).toBe('upskii');
    expect(projectFor(budget, base)).toBe('other');
  });
});

describe('fair share admission', () => {
  it('admits a project under its share ahead of an older backlog from the other', () => {
    const budget = studio();
    // Upskii already runs at its share and has an older waiter.
    const running = owners(['upskii', 4], ['upskii', 4], ['upskii', 4]);
    const upskii = ticket('upskii', 2);
    const tuturuuu = ticket('tuturuuu', 2);
    expect(select(budget, [upskii, tuturuuu], running).selected).toBe(tuturuuu);
  });

  it('keeps FIFO order inside a project', () => {
    const budget = studio();
    const first = ticket('tuturuuu', 8);
    const second = ticket('tuturuuu', 1);
    const result = select(budget, [second, first], []);
    expect(result.selected).toBe(first);
    expect(result.blocked[second.path]).toMatch(/older tuturuuu ticket/u);
  });

  it('never exceeds the lane, token or memory ceiling', () => {
    const budget = studio();
    expect(
      select(
        budget,
        [ticket('tuturuuu', 1)],
        owners(
          ...Array.from({ length: 12 }, () => ['upskii', 1] as [string, number])
        )
      ).selected
    ).toBeUndefined();
    expect(
      select(
        budget,
        [ticket('tuturuuu', 2)],
        owners(['upskii', 12], ['tuturuuu', 11])
      ).selected
    ).toBeUndefined();
    const heavyMemory: BudgetEntry = {
      ...ticket('tuturuuu', 1),
      demand: demand('tuturuuu', 1, 200),
    };
    expect(
      select(budget, [heavyMemory], [{ demand: demand('upskii', 1, 160) }])
        .selected
    ).toBeUndefined();
  });
});

describe('borrowing and reclaim', () => {
  it('lets a project borrow the idle share of the other', () => {
    const budget = studio();
    const running = owners(['upskii', 6], ['upskii', 6]);
    const borrower = ticket('upskii', 6);
    expect(select(budget, [borrower], running).selected).toBe(borrower);
    expect(
      select(studio({ borrow: false }), [borrower], running).selected
    ).toBeUndefined();
  });

  it('reclaims: the share owner goes before a borrower, and running borrowers stay', () => {
    const budget = studio();
    // Upskii borrows 6 of Tuturuuu's tokens; nobody is preempted.
    const running = owners(['upskii', 12], ['upskii', 6]);
    const moreBorrowing = ticket('upskii', 2);
    const owner = ticket('tuturuuu', 4);
    const result = select(budget, [moreBorrowing, owner], running);
    expect(result.selected).toBe(owner);
    expect(result.blocked[moreBorrowing.path]).toMatch(/reclaiming its share/u);
    expect(running).toHaveLength(2);
    // Once the owner's work fits only after the borrower finishes, it waits.
    const big = ticket('tuturuuu', 10);
    expect(select(budget, [big], running).selected).toBeUndefined();
    expect(select(budget, [big], owners(['upskii', 12])).selected).toBe(big);
  });

  it('unassigned work only borrows idle capacity', () => {
    const budget = studio();
    const stray = ticket('other', 2);
    expect(select(budget, [stray], []).selected).toBe(stray);
    expect(
      select(budget, [stray, ticket('tuturuuu', 2)], []).selected?.demand
        ?.project
    ).toBe('tuturuuu');
    expect(
      select(studio({ borrow: false }), [stray], []).selected
    ).toBeUndefined();
  });

  it('reports use, share and borrowing per project', () => {
    const status = budgetStatus(
      studio(),
      owners(['upskii', 12], ['upskii', 4]),
      [{ demand: demand('tuturuuu', 2) }]
    );
    expect(status.used).toMatchObject({ lanes: 2, tokens: 16 });
    const upskii = status.projects.find((entry) => entry.id === 'upskii')!;
    expect(upskii.borrowing.tokens).toBe(4);
    expect(
      status.projects.find((entry) => entry.id === 'tuturuuu')
    ).toMatchObject({ waiting: 1, borrowing: { tokens: 0 } });
  });
});

describe('no starvation under sustained mixed load', () => {
  it('admits every ticket, keeps ceilings, and gives each busy project its share', () => {
    const budget = studio();
    // Upskii floods small and large jobs; Tuturuuu submits a few heavy ones.
    const queue: BudgetEntry[] = [
      ...Array.from({ length: 30 }, (_, i) =>
        ticket('upskii', i % 3 === 0 ? 6 : 2)
      ),
      ...Array.from({ length: 6 }, () => ticket('tuturuuu', 8)),
    ];
    const running: { entry: BudgetEntry; ends: number }[] = [];
    const started = new Map<string, number>();
    let peakTokens = 0;
    let tuturuuuTokensWhileBothBusy = Infinity;
    for (
      let time = 0;
      time < 10_000 && (queue.length || running.length);
      time++
    ) {
      for (const job of running.filter((entry) => entry.ends <= time))
        running.splice(running.indexOf(job), 1);
      for (;;) {
        const { selected } = select(
          budget,
          queue,
          running.map((job) => ({ demand: job.entry.demand }))
        );
        if (!selected) break;
        queue.splice(queue.indexOf(selected), 1);
        started.set(selected.path, time);
        running.push({
          entry: selected,
          ends: time + (selected.demand!.tokens >= 6 ? 10 : 3),
        });
      }
      const tokens = running.reduce(
        (total, job) => total + job.entry.demand!.tokens,
        0
      );
      peakTokens = Math.max(peakTokens, tokens);
      expect(running.length).toBeLessThanOrEqual(12);
      expect(tokens).toBeLessThanOrEqual(24);
      const busy = new Set(
        [...queue, ...running.map((job) => job.entry)].map(
          (entry) => entry.demand!.project
        )
      );
      if (
        busy.has('tuturuuu') &&
        busy.has('upskii') &&
        queue.some((entry) => entry.demand!.project === 'tuturuuu')
      ) {
        const tuturuuu = running
          .filter((job) => job.entry.demand!.project === 'tuturuuu')
          .reduce((total, job) => total + job.entry.demand!.tokens, 0);
        tuturuuuTokensWhileBothBusy = Math.min(
          tuturuuuTokensWhileBothBusy,
          tuturuuu
        );
      }
    }
    expect(queue).toEqual([]);
    expect(started.size).toBe(36);
    expect(peakTokens).toBe(24);
    // Tuturuuu always held at least one heavy job (8 tokens) while it had work.
    expect(tuturuuuTokensWhileBothBusy).toBeGreaterThanOrEqual(8);
  });
});
