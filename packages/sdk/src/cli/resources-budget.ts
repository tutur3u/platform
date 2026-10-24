import { readFileSync, realpathSync, statSync } from 'node:fs';
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
} from 'node:path';
import { z } from 'zod';
import { commandTool, nodeTestWorkers } from './resources-command';

// Cross-project budget for one shared host (for example skr-studio, shared by
// Tuturuuu and Upskii). It is a layer on the existing lane admission: tickets
// and owners stay in the same FIFO home and mutex; the budget only decides
// which waiter may claim the next lane and how many worker tokens it gets.
const share = z.object({
  lanes: z.number().int().min(0).max(16),
  tokens: z.number().int().min(0).max(256),
  memoryGiB: z.number().min(0).max(4096),
});
const project = share.extend({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,62}$/u),
  roots: z.array(z.string().refine(isAbsolute)).min(1),
});
export const budgetSchema = z
  .object({
    lanes: z.number().int().min(1).max(16),
    tokens: z.number().int().min(1).max(256),
    memoryGiB: z.number().positive().max(4096),
    // Explicit borrowing of another project's unused share.
    borrow: z.boolean().default(true),
    projects: z.array(project).min(1),
  })
  .refine(
    (budget) =>
      new Set(budget.projects.map((entry) => entry.id)).size ===
        budget.projects.length &&
      !budget.projects.some((entry) => entry.id === 'other'),
    { message: 'project ids must be unique and not "other"' }
  )
  .refine(
    (budget) =>
      (['lanes', 'tokens', 'memoryGiB'] as const).every(
        (key) =>
          budget.projects.reduce((total, entry) => total + entry[key], 0) <=
          budget[key]
      ),
    { message: 'project shares must fit inside the ceiling' }
  );
export type ResourceBudget = z.infer<typeof budgetSchema>;
export type Demand = { project: string; tokens: number; memoryGiB: number };
// Commands outside every project root have no share and may only borrow.
export const unassignedProject = 'other';

const contains = (root: string, path: string) => {
  const child = relative(root, path);
  return child === '' || (!child.startsWith('..') && !isAbsolute(child));
};
const canonical = (path: string) => {
  try {
    return realpathSync(path);
  } catch {
    return resolve(path);
  }
};
// The main checkout of a linked worktree (from .git -> gitdir -> commondir),
// so every Upskii worktree counts against Upskii's share.
function mainCheckout(cwd: string) {
  for (let dir = resolve(cwd); ; dir = dirname(dir)) {
    try {
      const git = join(dir, '.git');
      if (statSync(git).isDirectory()) return dir;
      const pointer = /^gitdir:\s*(.+)$/mu.exec(readFileSync(git, 'utf8'));
      if (pointer) {
        const gitdir = resolve(dir, pointer[1]!.trim());
        const common = resolve(
          gitdir,
          readFileSync(join(gitdir, 'commondir'), 'utf8').trim()
        );
        return basename(common) === '.git' ? dirname(common) : dir;
      }
    } catch {
      /* Not a repository root, or no commondir: keep walking. */
    }
    if (dir === dirname(dir)) return undefined;
  }
}
// Longest matching root wins, checked for the working directory and for the
// repository's main checkout.
export function projectFor(budget: ResourceBudget, cwd: string) {
  const paths = [canonical(cwd)];
  const main = mainCheckout(cwd);
  if (main) paths.push(canonical(main));
  let best: { id: string; length: number } | undefined;
  for (const entry of budget.projects)
    for (const root of entry.roots.map(canonical))
      if (
        paths.some((path) => contains(root, path)) &&
        root.length > (best?.length ?? -1)
      )
        best = { id: entry.id, length: root.length };
  return best?.id ?? unassignedProject;
}

const requestedWorkers = (args: string[], playwright = false) => {
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    const match = (
      playwright
        ? /^(?:--workers|-j)(?:=?(.+))?$/u
        : /^--max-?[wW]orkers(?:=(.+))?$/u
    ).exec(arg);
    if (!match) continue;
    const value = Number(match[1] ?? args[i + 1]);
    if (Number.isInteger(value) && value > 0) return value;
  }
  return undefined;
};
const buildTask = /(^|:)build(:|$)/u;
/**
 * Worker tokens a ticket declares. An explicit declaration wins; otherwise
 * the classified tool decides: a vitest run costs its worker count (the
 * requested --maxWorkers or the configured default), browser and database
 * suites at least 2, builds at least 4, and anything else 1. Turbo runs one
 * task at a time under admission, so it costs its task's tokens.
 */
export function inferTokens(
  command: string,
  args: string[],
  defaults: { vitestWorkers: number; buildJobs: number }
) {
  const { tool, tail } = commandTool(basename(command), args);
  if (basename(command) === 'node') {
    const workers = nodeTestWorkers(args, Math.max(2, defaults.vitestWorkers));
    if (workers !== undefined) return workers;
  }
  if (tool === 'ambiguous') return Math.max(2, defaults.vitestWorkers);
  const isBuild =
    (tool === 'next' && tail.includes('build')) ||
    (tool === 'cargo' &&
      ['build', 'check', 'clippy'].includes(tail[0] ?? '')) ||
    ((tool === 'turbo' || tool === 'bun') &&
      tail.some((arg) => buildTask.test(arg)));
  if (isBuild) return Math.max(4, defaults.buildJobs);
  if (tool === 'playwright')
    return requestedWorkers(tail, true) ?? Math.max(2, defaults.vitestWorkers);
  if (tool === 'supabase' || tail.some((arg) => /^sb:/u.test(arg)))
    return Math.max(2, defaults.vitestWorkers);
  if (tool === 'vitest')
    return requestedWorkers(tail) ?? defaults.vitestWorkers;
  if (tool === 'turbo' || tool === 'tsc' || tool === 'eslint')
    return Math.max(2, defaults.vitestWorkers);
  if (tool === 'cargo') return defaults.buildJobs;
  return 1;
}
// Clamp to the host, and to the project's share when it cannot borrow.
export function ticketDemand(
  budget: ResourceBudget,
  input: {
    cwd: string;
    command: string;
    args: string[];
    defaults: { vitestWorkers: number; buildJobs: number };
    env?: NodeJS.ProcessEnv;
  }
): Demand {
  const env = input.env ?? {};
  const project = projectFor(budget, input.cwd);
  let tokenCeiling = budget.tokens;
  let memoryCeiling = budget.memoryGiB;
  if (!budget.borrow) {
    const own = budget.projects.find((entry) => entry.id === project);
    if (!own || own.lanes < 1 || own.tokens < 1 || own.memoryGiB <= 0)
      throw new Error(
        `${project} has no usable project share and borrowing is off. Use a configured project root with positive lane, token and memory shares, or enable borrowing.`
      );
    tokenCeiling = Math.min(tokenCeiling, own.tokens);
    memoryCeiling = Math.min(memoryCeiling, own.memoryGiB);
  }
  const explicit = Number(env.TTR_RESOURCES_TOKENS);
  const tokens = Math.min(
    tokenCeiling,
    Math.max(
      1,
      Number.isInteger(explicit) && explicit > 0
        ? explicit
        : inferTokens(input.command, input.args, input.defaults)
    )
  );
  const perToken = budget.memoryGiB / budget.tokens;
  const memory = Number(env.TTR_RESOURCES_MEMORY_GIB);
  return {
    project,
    tokens,
    memoryGiB: Math.min(
      memoryCeiling,
      Number.isFinite(memory) && memory > 0 ? memory : tokens * perToken
    ),
  };
}

interface BudgetOwner {
  demand?: Demand;
  limits?: { vitestWorkers: number; buildJobs: number };
}
export interface BudgetEntry extends BudgetOwner {
  path: string;
  queuedAt: string;
}
type Use = { lanes: number; tokens: number; memoryGiB: number };
const zero = (): Use => ({ lanes: 0, tokens: 0, memoryGiB: 0 });
// Preserve the caps a legacy owner actually received, even above today's ceiling.
function demandOf(entry: BudgetOwner, budget: ResourceBudget): Demand {
  if (entry.demand) return entry.demand;
  const tokens = Math.max(
    1,
    entry.limits?.vitestWorkers ?? 1,
    entry.limits?.buildJobs ?? 1
  );
  return {
    project: unassignedProject,
    tokens,
    memoryGiB: (tokens * budget.memoryGiB) / budget.tokens,
  };
}
export function budgetUsage(owners: BudgetOwner[], budget: ResourceBudget) {
  const total = zero();
  const byProject = new Map<string, Use>();
  for (const owner of owners) {
    const demand = demandOf(owner, budget);
    const use = byProject.get(demand.project) ?? zero();
    for (const target of [total, use]) {
      target.lanes += 1;
      target.tokens += demand.tokens;
      target.memoryGiB += demand.memoryGiB;
    }
    byProject.set(demand.project, use);
  }
  return { total, byProject };
}
const shareOf = (budget: ResourceBudget, id: string): Use =>
  budget.projects.find((entry) => entry.id === id) ?? zero();
const fits = (use: Use, demand: Demand, limit: Use) =>
  use.lanes + 1 <= limit.lanes &&
  use.tokens + demand.tokens <= limit.tokens &&
  use.memoryGiB + demand.memoryGiB <= limit.memoryGiB + 1e-9;
const utilisation = (use: Use, limit: Use) =>
  Math.max(
    limit.lanes ? use.lanes / limit.lanes : 1,
    limit.tokens ? use.tokens / limit.tokens : 1,
    limit.memoryGiB ? use.memoryGiB / limit.memoryGiB : 1
  );
const byAge = (a: BudgetEntry, b: BudgetEntry) =>
  Date.parse(a.queuedAt) - Date.parse(b.queuedAt) ||
  a.path.localeCompare(b.path);

/**
 * Which waiter may claim the next lane. Each project keeps FIFO order, and
 * only its oldest ticket competes. A head that fits inside its own share wins
 * first, the least-used share first. A request that cannot fit even an empty
 * project share gets age priority over younger reclaimers and drains host
 * capacity if needed. Ordinary borrowers still yield to share reclaim.
 * Running owners are never preempted.
 */
export function selectBudgetTicket(
  budget: ResourceBudget,
  waiting: BudgetEntry[],
  owners: BudgetOwner[]
): { selected?: BudgetEntry; blocked: Record<string, string> } {
  const usage = budgetUsage(owners, budget);
  const demandFor = (entry: BudgetOwner) => demandOf(entry, budget);
  const heads = new Map<string, BudgetEntry>();
  for (const entry of [...waiting].sort(byAge)) {
    const id = demandFor(entry).project;
    if (!heads.has(id)) heads.set(id, entry);
  }
  const blocked: Record<string, string> = {};
  for (const entry of waiting)
    if (![...heads.values()].includes(entry))
      blocked[entry.path] =
        `waiting behind an older ${demandFor(entry).project} ticket`;
  const ceiling: Use = budget;
  const own: BudgetEntry[] = [];
  const borrowers: BudgetEntry[] = [];
  const oversized: BudgetEntry[] = [];
  for (const [id, entry] of heads) {
    const demand = demandFor(entry);
    const use = usage.byProject.get(id) ?? zero();
    const share = shareOf(budget, id);
    if (!fits(zero(), demand, ceiling)) {
      blocked[entry.path] =
        'ticket exceeds the current host ceiling; cancel and requeue with current policy';
      continue;
    }
    // Reclaim priority is decided before global fit: otherwise small borrowers
    // can refill every freed token and the share owner never gets capacity.
    if (fits(use, demand, share)) own.push(entry);
    else if (budget.borrow && !fits(zero(), demand, share))
      oversized.push(entry);
    else if (!fits(usage.total, demand, ceiling))
      blocked[entry.path] = 'the host budget is fully used';
    else if (budget.borrow) borrowers.push(entry);
    else blocked[entry.path] = `${id} share is fully used and borrowing is off`;
  }
  const byPriority = (a: BudgetEntry, b: BudgetEntry) => {
    const ua = utilisation(
      usage.byProject.get(demandFor(a).project) ?? zero(),
      shareOf(budget, demandFor(a).project)
    );
    const ub = utilisation(
      usage.byProject.get(demandFor(b).project) ?? zero(),
      shareOf(budget, demandFor(b).project)
    );
    return ua - ub || byAge(a, b);
  };
  const oldestOversized = oversized.sort(byAge)[0];
  const reclaim = own
    .filter((entry) => !oldestOversized || byAge(entry, oldestOversized) < 0)
    .sort(byPriority)[0];
  if (reclaim) {
    for (const entry of [...own, ...borrowers, ...oversized])
      if (entry !== reclaim)
        blocked[entry.path] = 'another project is reclaiming its share first';
    if (!fits(usage.total, demandFor(reclaim), ceiling)) {
      blocked[reclaim.path] = 'draining the host budget for share reclaim';
      return { blocked };
    }
    return { selected: reclaim, blocked };
  }
  if (oldestOversized) {
    for (const entry of [...own, ...borrowers, ...oversized])
      if (entry !== oldestOversized)
        blocked[entry.path] = 'an older oversized borrower goes first';
    if (!fits(usage.total, demandFor(oldestOversized), ceiling)) {
      blocked[oldestOversized.path] =
        'draining the host budget for an older oversized borrower';
      return { blocked };
    }
    return { selected: oldestOversized, blocked };
  }
  borrowers.sort(byAge);
  for (const entry of borrowers.slice(1))
    blocked[entry.path] = 'an older borrower goes first';
  return { selected: borrowers[0], blocked };
}

// Status summary: ceiling, total use, and per-project share, use, borrowing
// (use above share) and waiters.
export function budgetStatus(
  budget: ResourceBudget,
  owners: BudgetOwner[],
  waiting: BudgetOwner[]
) {
  const usage = budgetUsage(owners, budget);
  const ids = [
    ...budget.projects.map((entry) => entry.id),
    ...(usage.byProject.has(unassignedProject) ||
    waiting.some(
      (entry) => demandOf(entry, budget).project === unassignedProject
    )
      ? [unassignedProject]
      : []),
  ];
  return {
    ceiling: {
      lanes: budget.lanes,
      tokens: budget.tokens,
      memoryGiB: budget.memoryGiB,
    },
    used: usage.total,
    borrow: budget.borrow,
    projects: ids.map((id) => {
      const limit = shareOf(budget, id);
      const used = usage.byProject.get(id) ?? zero();
      return {
        id,
        share: {
          lanes: limit.lanes,
          tokens: limit.tokens,
          memoryGiB: limit.memoryGiB,
        },
        used,
        borrowing: {
          lanes: Math.max(0, used.lanes - limit.lanes),
          tokens: Math.max(0, used.tokens - limit.tokens),
          memoryGiB: Math.max(0, used.memoryGiB - limit.memoryGiB),
        },
        waiting: waiting.filter(
          (entry) => demandOf(entry, budget).project === id
        ).length,
      };
    }),
  };
}
