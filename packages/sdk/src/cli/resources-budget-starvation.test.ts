import { describe, expect, it } from 'vitest';
import {
  type BudgetEntry,
  budgetSchema,
  budgetStatus,
  budgetUsage,
  selectBudgetTicket,
  ticketDemand,
} from './resources-budget';
import { limitCommand } from './resources-command';
import { defaultResourceConfig } from './resources-config';

const policy = (borrow = true) =>
  budgetSchema.parse({
    lanes: 4,
    tokens: 8,
    memoryGiB: 8,
    borrow,
    projects: [
      { id: 'a', roots: ['/project-a'], lanes: 2, tokens: 4, memoryGiB: 4 },
      { id: 'b', roots: ['/project-b'], lanes: 2, tokens: 4, memoryGiB: 4 },
    ],
  });
const ticket = (project: string, tokens: number, age: number): BudgetEntry => ({
  path: `/queue/${age}-${project}`,
  queuedAt: new Date(1_700_000_000_000 + age * 1000).toISOString(),
  demand: { project, tokens, memoryGiB: tokens },
});
const input = (cwd = '/project-a/sdk') => ({
  cwd,
  command: 'vitest',
  args: ['run', '--maxWorkers=6'],
  defaults: { vitestWorkers: 2, buildJobs: 2 },
});

describe('oversized project heads', () => {
  it('caps a non-borrowing head and its actual worker flags to its own share', () => {
    const budget = policy(false);
    const demand = ticketDemand(budget, input());
    expect(demand).toEqual({ project: 'a', tokens: 4, memoryGiB: 4 });
    expect(
      limitCommand('vitest', input().args, {
        ...defaultResourceConfig(),
        vitestWorkers: demand.tokens,
        buildJobs: demand.tokens,
      })
    ).toEqual(['run', '--maxWorkers=4']);
    const head = { ...ticket('a', 6, 1), demand };
    expect(
      selectBudgetTicket(budget, [head, ticket('a', 1, 2)], []).selected
    ).toBe(head);
  });

  it('bounds explicit non-borrowing token and memory declarations by the share', () => {
    expect(
      ticketDemand(policy(false), {
        ...input(),
        env: { TTR_RESOURCES_TOKENS: '8', TTR_RESOURCES_MEMORY_GIB: '8' },
      })
    ).toEqual({ project: 'a', tokens: 4, memoryGiB: 4 });
  });

  it('rejects an unassigned non-borrowing request before it can block the FIFO', () => {
    expect(() => ticketDemand(policy(false), input('/outside'))).toThrow(
      /no usable project share.*borrowing is off/i
    );
  });

  it('rejects a zero-share non-borrowing project instead of clamping to zero workers', () => {
    const budget = policy(false);
    budget.projects = budget.projects.map((entry) =>
      entry.id === 'a' ? { ...entry, tokens: 0 } : entry
    );
    expect(() => ticketDemand(budget, input())).toThrow(
      /no usable project share.*borrowing is off/i
    );
  });

  it('admits the oversized oldest borrower during sustained younger in-share work', () => {
    const budget = policy();
    const oldest = ticket('a', 6, 1);
    let admitted = false;
    for (let round = 0; round < 20; round++) {
      const next = ticket('b', 2, round + 2);
      if (selectBudgetTicket(budget, [oldest, next], []).selected === oldest) {
        admitted = true;
        break;
      }
    }
    expect(admitted).toBe(true);
  });

  it('drains capacity for an aged oversized head rather than refilling it', () => {
    const budget = policy();
    const oldest = ticket('a', 6, 1);
    const younger = ticket('b', 1, 2);
    const running = [{ demand: { project: 'b', tokens: 3, memoryGiB: 3 } }];
    const result = selectBudgetTicket(budget, [oldest, younger], running);
    expect(result.selected).toBeUndefined();
    expect(result.blocked[oldest.path]).toMatch(/draining/);
    expect(selectBudgetTicket(budget, [oldest, younger], []).selected).toBe(
      oldest
    );
  });

  it('lets an aged unassigned borrower progress ahead of younger project heads', () => {
    const stray = ticket('other', 2, 1);
    expect(
      selectBudgetTicket(policy(), [stray, ticket('a', 2, 2)], []).selected
    ).toBe(stray);
  });

  it('keeps older in-share reclaim ahead of a younger oversized request', () => {
    const reclaim = ticket('b', 2, 1);
    expect(
      selectBudgetTicket(policy(), [ticket('a', 6, 2), reclaim], []).selected
    ).toBe(reclaim);
  });

  it('includes memory-only oversized requests in age priority', () => {
    const oldest = {
      ...ticket('a', 1, 1),
      demand: { project: 'a', tokens: 1, memoryGiB: 6 },
    };
    expect(
      selectBudgetTicket(policy(), [oldest, ticket('b', 1, 2)], []).selected
    ).toBe(oldest);
  });

  it('checks every older share head before using the least-utilised share', () => {
    const budget = budgetSchema.parse({
      ...policy(),
      lanes: 6,
      projects: [
        { id: 'a', roots: ['/project-a'], lanes: 2, tokens: 4, memoryGiB: 4 },
        { id: 'b', roots: ['/project-b'], lanes: 2, tokens: 2, memoryGiB: 2 },
        { id: 'c', roots: ['/project-c'], lanes: 2, tokens: 2, memoryGiB: 2 },
      ],
    });
    const older = ticket('b', 1, 1);
    const running = [{ demand: { project: 'b', tokens: 1, memoryGiB: 1 } }];
    expect(
      selectBudgetTicket(
        budget,
        [ticket('a', 6, 2), older, ticket('c', 1, 3)],
        running
      ).selected
    ).toBe(older);
  });

  it('does not reserve the host for a stale ticket larger than its new ceiling', () => {
    const stale = ticket('a', 9, 1);
    const valid = ticket('b', 2, 2);
    const result = selectBudgetTicket(policy(), [stale, valid], []);
    expect(result.selected).toBe(valid);
    expect(result.blocked[stale.path]).toMatch(/cancel and requeue/);
  });

  it('retains share reclaim priority over an ordinary borrower backlog', () => {
    const borrower = ticket('a', 2, 1);
    const reclaim = ticket('b', 2, 2);
    const running = [{ demand: { project: 'a', tokens: 4, memoryGiB: 4 } }];
    expect(
      selectBudgetTicket(policy(), [borrower, reclaim], running).selected
    ).toBe(reclaim);
  });
});

describe('pre-budget owner accounting', () => {
  it('charges the largest recorded worker limit and its proportional memory', () => {
    const budget = policy();
    const owners = [{ limits: { vitestWorkers: 2, buildJobs: 6 } }];
    expect(budgetUsage(owners, budget).total).toEqual({
      lanes: 1,
      tokens: 6,
      memoryGiB: 6,
    });
    expect(budgetStatus(budget, owners, []).used).toEqual({
      lanes: 1,
      tokens: 6,
      memoryGiB: 6,
    });
    expect(
      selectBudgetTicket(budget, [ticket('b', 3, 1)], owners).selected
    ).toBeUndefined();
  });
});
