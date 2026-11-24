import { MAX_TASK_NAME_LENGTH } from '@tuturuuu/utils/constants';
import {
  resolveStatusList,
  type StatusBoardDefaults,
  type StatusListCandidate,
  type TaskStatusName,
} from '@tuturuuu/utils/task-board-status-list';
import { inferTaskLink, type InferredLink } from '../github-links';
import type { ImportMapping, NormalizedIssue } from '../schemas';

export type ImportTaskState = 'open' | 'completed' | 'not_planned';
export type TaskPriority = 'low' | 'normal' | 'high' | 'critical';

/** `<title> #<number>`; the title is cut, never the number. */
export function importTaskName(title: string, number: number) {
  const suffix = ` #${number}`;
  const clean = title.replace(/\s+/gu, ' ').trim();
  const room = MAX_TASK_NAME_LENGTH - suffix.length;
  return `${clean.length > room ? clean.slice(0, room).trimEnd() : clean}${suffix}`;
}

/** Where the issue sits: open, closed as completed, or closed otherwise. */
export function issueTaskState(issue: NormalizedIssue): ImportTaskState {
  if (issue.state === 'open') return 'open';
  return issue.state_reason === 'not_planned' ||
    issue.state_reason === 'duplicate'
    ? 'not_planned'
    : 'completed';
}

const STATE_TO_STATUS: Record<ImportTaskState, TaskStatusName> = {
  open: 'todo',
  completed: 'done',
  not_planned: 'cancelled',
};

/**
 * The target list for an issue: the mapped list when the mapping names one on
 * the board, otherwise the board's list for that status.
 */
export function resolveIssueList(
  state: ImportTaskState,
  mapping: ImportMapping['status_lists'],
  lists: readonly StatusListCandidate[],
  defaults: StatusBoardDefaults
) {
  const mappedId = {
    open: mapping.open_list_id,
    completed: mapping.completed_list_id,
    not_planned: mapping.not_planned_list_id,
  }[state];
  if (mappedId) {
    const mapped = lists.find(
      (list) => list.id === mappedId && !list.deleted && !list.archived
    );
    if (mapped) return mapped;
  }
  return resolveStatusList(lists, STATE_TO_STATUS[state], defaults);
}

/** Completion columns a list implies; the fields are cleared again on reopen. */
export function taskFieldsForList(
  list: Pick<StatusListCandidate, 'status'>,
  issue: Pick<NormalizedIssue, 'closed_at'>
) {
  const closedAt = timestampOrNull(issue.closed_at);
  return {
    completed: list.status === 'done',
    completed_at: list.status === 'done' ? closedAt : null,
    closed_at: list.status === 'closed' ? closedAt : null,
  };
}

export type LabelPlan = {
  labelIds: string[];
  priority: TaskPriority | null;
  /** GitHub labels with no mapping entry. They stay in the external ref. */
  unmapped: string[];
};

const PRIORITY_RANK: Record<TaskPriority, number> = {
  low: 0,
  normal: 1,
  high: 2,
  critical: 3,
};

export function planLabels(
  labels: readonly string[],
  mapping: ImportMapping['labels']
): LabelPlan {
  const labelIds = new Set<string>();
  const unmapped: string[] = [];
  let priority: TaskPriority | null = null;
  for (const label of labels) {
    const target = mapping[label];
    if (target === undefined) {
      unmapped.push(label);
    } else if (target === 'ignore') {
      continue;
    } else if (target === 'priority:high' || target === 'priority:critical') {
      const next = target.slice('priority:'.length) as TaskPriority;
      if (!priority || PRIORITY_RANK[next] > PRIORITY_RANK[priority]) {
        priority = next;
      }
    } else {
      labelIds.add(target);
    }
  }
  return { labelIds: [...labelIds], priority, unmapped };
}

export type PeoplePlan = { userIds: string[]; unmapped: string[] };

/**
 * Logins resolve to workspace users only through the mapping. A login with no
 * entry, or an entry for someone who is not a member, stays external.
 */
export function planPeople(
  logins: readonly string[],
  mapping: Record<string, string>,
  memberIds: ReadonlySet<string>
): PeoplePlan {
  const userIds = new Set<string>();
  const unmapped: string[] = [];
  for (const login of logins) {
    const id = mapping[login];
    if (id && memberIds.has(id)) userIds.add(id);
    else unmapped.push(login);
  }
  return { userIds: [...userIds], unmapped };
}

export type LinkSpec = InferredLink & {
  url: string;
  title: string | null;
  state: 'open' | 'closed' | 'merged' | null;
};

/** Pull requests and commits that reference the issue, as task_links rows. */
export function planLinks(issue: NormalizedIssue): LinkSpec[] {
  const specs = new Map<string, LinkSpec>();
  for (const pr of issue.linked_prs) {
    const inferred = inferTaskLink(pr.url);
    specs.set(pr.url, {
      kind: 'pull_request',
      provider: inferred.provider,
      externalId: inferred.externalId,
      url: pr.url,
      title: pr.title?.slice(0, 500) || null,
      state: pr.merged
        ? 'merged'
        : pr.state?.toLowerCase() === 'closed'
          ? 'closed'
          : pr.state?.toLowerCase() === 'open'
            ? 'open'
            : null,
    });
  }
  for (const commit of issue.linked_commits) {
    const inferred = inferTaskLink(commit.url);
    specs.set(commit.url, {
      kind: 'commit',
      provider: inferred.provider,
      externalId: inferred.externalId,
      url: commit.url,
      title: null,
      state: null,
    });
  }
  return [...specs.values()];
}

/** Epoch millis, or null when the value is not a real timestamp. */
export function timestampOrNull(value: string | null | undefined) {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
}

export const EXTERNAL_STATES = ['open', 'closed'] as const;

/** `state_reason` values the external ref accepts; anything else is dropped. */
export function refStateReason(issue: NormalizedIssue) {
  const reason = issue.state_reason?.toLowerCase() ?? null;
  return reason === 'completed' ||
    reason === 'not_planned' ||
    reason === 'reopened' ||
    reason === 'duplicate'
    ? reason
    : null;
}
