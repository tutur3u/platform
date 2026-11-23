/**
 * Open EduFest bugs per run-of-show step, from public GitHub issues labelled
 * `edufest-2026` and `edufest:<step>`. Only numbers and titles are kept;
 * bodies, authors and comments are never read into the page. Issues with a
 * security label never appear. A failed or capped search reads as
 * unavailable, never as zero bugs.
 */
import {
  RUN_STEPS,
  type RunStepId,
} from '../content/workshops/edufest-2026-run.ts';
import { type Fetcher, type SearchItem, searchIssues } from './github.ts';
import { isoTime, REPO_URL } from './model.ts';

export const BUG_LABEL = 'edufest-2026';
const STEP_LABEL = /^edufest:(s[0-7])$/;
const SECURITY_LABEL = /security/i;
/** Titles shown per step; the count covers the rest. */
export const BUGS_SHOWN = 3;
const MAX_ISSUES = 300;

export type BugIssue = { number: number; title: string; steps: RunStepId[] };

export type BugFeed =
  | {
      state: 'observed';
      observedAt: string;
      source: 'build' | 'live';
      issues: BugIssue[];
    }
  | {
      state: 'unavailable';
      reason: 'not_observed' | 'rate_limited' | 'failed' | 'incomplete';
    };

export type StepBugs =
  | { state: 'unavailable' }
  | { state: 'observed'; count: number; shown: BugIssue[] };

export const NOT_OBSERVED: BugFeed = {
  state: 'unavailable',
  reason: 'not_observed',
};

export function issueUrl(number: number) {
  return `${REPO_URL}/issues/${number}`;
}

function labelNames(item: SearchItem): string[] {
  return (item.labels ?? [])
    .map((label) => (typeof label === 'string' ? label : label?.name))
    .filter((name): name is string => typeof name === 'string');
}

/** A search item as a bug, or null for anything not safe or not tagged. */
export function toBug(item: SearchItem): BugIssue | null {
  if (
    !item ||
    typeof item.number !== 'number' ||
    !Number.isInteger(item.number) ||
    item.number < 1 ||
    typeof item.title !== 'string' ||
    !item.title.trim() ||
    item.state !== 'open'
  )
    return null;
  const labels = labelNames(item);
  if (!labels.includes(BUG_LABEL)) return null;
  if (labels.some((name) => SECURITY_LABEL.test(name))) return null;
  const steps = RUN_STEPS.filter((step) =>
    labels.some((name) => STEP_LABEL.exec(name)?.[1] === step)
  );
  return { number: item.number, title: item.title.trim().slice(0, 200), steps };
}

/** One search result as a feed: incomplete when the search was capped. */
export function feedFromSearch(
  result: { items: SearchItem[]; total: number },
  observedAt: string,
  source: 'build' | 'live'
): BugFeed {
  if (result.items.length < result.total)
    return { state: 'unavailable', reason: 'incomplete' };
  const issues = result.items
    .map(toBug)
    .filter((bug): bug is BugIssue => Boolean(bug))
    .sort((a, b) => b.number - a.number);
  return { state: 'observed', observedAt, source, issues };
}

export async function fetchEdufestBugs(
  fetcher: Fetcher,
  now: number,
  options: { token?: string; pages?: number; source: 'build' | 'live' }
): Promise<BugFeed> {
  const result = await searchIssues(
    fetcher,
    `is:open label:${BUG_LABEL}`,
    options.pages ?? 1,
    options.token
  );
  return feedFromSearch(result, new Date(now).toISOString(), options.source);
}

/**
 * The feed to show after a refresh: a new observation wins; a failed one
 * keeps the last observation (with its own time) rather than blanking it.
 */
export function nextBugFeed(previous: BugFeed, next: BugFeed): BugFeed {
  if (next.state === 'observed') return next;
  return previous.state === 'observed' ? previous : next;
}

/** Each step's open bugs, newest first; unavailable stays unavailable. */
export function groupBugs(feed: BugFeed): Record<RunStepId, StepBugs> {
  const groups = {} as Record<RunStepId, StepBugs>;
  for (const step of RUN_STEPS) {
    if (feed.state !== 'observed') {
      groups[step] = { state: 'unavailable' };
      continue;
    }
    const bugs = feed.issues.filter((bug) => bug.steps.includes(step));
    groups[step] = {
      state: 'observed',
      count: bugs.length,
      shown: bugs.slice(0, BUGS_SHOWN),
    };
  }
  return groups;
}

/** Strict reader for the build's embedded feed; anything off is unavailable. */
export function parseBugFeed(value: unknown): BugFeed {
  try {
    if (!value || typeof value !== 'object') return NOT_OBSERVED;
    const raw = value as Record<string, unknown>;
    if (raw.state === 'unavailable') {
      const reasons = ['not_observed', 'rate_limited', 'failed', 'incomplete'];
      return reasons.includes(raw.reason as string)
        ? { state: 'unavailable', reason: raw.reason as 'failed' }
        : NOT_OBSERVED;
    }
    if (raw.state !== 'observed') return NOT_OBSERVED;
    if (raw.source !== 'build' && raw.source !== 'live') return NOT_OBSERVED;
    if (!Array.isArray(raw.issues) || raw.issues.length > MAX_ISSUES)
      return NOT_OBSERVED;
    const issues: BugIssue[] = [];
    for (const item of raw.issues) {
      const issue = item as Partial<BugIssue>;
      if (
        typeof issue?.number !== 'number' ||
        !Number.isInteger(issue.number) ||
        issue.number < 1 ||
        typeof issue.title !== 'string' ||
        !issue.title.trim() ||
        issue.title.length > 200 ||
        !Array.isArray(issue.steps) ||
        !issue.steps.every((step) => RUN_STEPS.includes(step))
      )
        return NOT_OBSERVED;
      issues.push({
        number: issue.number,
        title: issue.title,
        steps: [...issue.steps],
      });
    }
    return {
      state: 'observed',
      observedAt: isoTime(raw.observedAt, 'bug list'),
      source: raw.source,
      issues,
    };
  } catch {
    return NOT_OBSERVED;
  }
}
