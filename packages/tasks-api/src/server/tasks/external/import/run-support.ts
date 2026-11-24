import { MAX_TASK_DESCRIPTION_LENGTH } from '@tuturuuu/utils/constants';
import { createTaskDescriptionPayload } from '@tuturuuu/utils/task-description-codec';
import type { StatusListCandidate } from '@tuturuuu/utils/task-board-status-list';
import type { ImportMapping, NormalizedIssue } from '../schemas';
import { planLinks, planPeople, refStateReason, timestampOrNull } from './plan';
import type {
  ExistingRef,
  HistoryInsert,
  ImportBoard,
  ImportStore,
  RefValues,
} from './store-types';

export type ImportAction = 'create' | 'update' | 'skip';

export type IssueResult = {
  url: string;
  number: number;
  action: ImportAction;
  task_id: string | null;
  warnings: string[];
  error?: string;
};

export type ImportInput = {
  actorId: string;
  board: ImportBoard;
  dryRun: boolean;
  refreshContent: boolean;
  issues: NormalizedIssue[];
  lists: StatusListCandidate[];
  mapping: ImportMapping;
  wsId: string;
};

export type Context = ImportInput & {
  alwaysLabelIds: string[];
  badLabelTargets: Set<string>;
  cycleIds: Set<string>;
  memberIds: Set<string>;
  refs: Map<string, ExistingRef>;
  store: ImportStore;
};

export const GUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

export function sameSet(left: readonly string[], right: readonly string[]) {
  return (
    left.length === right.length && left.every((item) => right.includes(item))
  );
}

export function sameInstant(left: string | null, right: string | null) {
  if (!left || !right) return left === right;
  return Date.parse(left) === Date.parse(right);
}

export function buildDescription(issue: NormalizedIssue, warnings: string[]) {
  const body = issue.body?.trim();
  if (!body) return { description: null, yjs: null };
  let payload = createTaskDescriptionPayload(body, 'markdown');
  if ((payload.description?.length ?? 0) > MAX_TASK_DESCRIPTION_LENGTH) {
    warnings.push('description_truncated');
    payload = createTaskDescriptionPayload(
      `${body.slice(0, 20000)}\n\n[Description truncated on import]`,
      'markdown'
    );
  }
  return {
    description: payload.description,
    yjs: payload.description_yjs_state,
  };
}

export function refValues(
  issue: NormalizedIssue,
  plan: ReturnType<typeof planPeople>
): RefValues {
  return {
    external_repo: issue.repo,
    external_number: issue.number,
    external_author: issue.author,
    external_state: issue.state,
    external_state_reason: refStateReason(issue),
    external_created_at: timestampOrNull(issue.created_at),
    external_closed_at: timestampOrNull(issue.closed_at),
    external_labels: issue.labels,
    external_assignees: plan.unmapped,
  };
}

function stateReasonForEvent(issue: NormalizedIssue) {
  const reason = refStateReason(issue);
  return reason === 'completed' || reason === 'not_planned' ? reason : null;
}

export function eventRow(
  taskId: string,
  issue: NormalizedIssue,
  state: 'open' | 'closed'
): HistoryInsert {
  return {
    task_id: taskId,
    changed_by: null,
    changed_at:
      state === 'closed'
        ? (timestampOrNull(issue.closed_at) ?? new Date().toISOString())
        : new Date().toISOString(),
    change_type: 'external_event',
    field_name: 'external',
    old_value: state === 'closed' ? 'open' : 'closed',
    new_value: state,
    metadata: {
      event: state === 'closed' ? 'closed' : 'reopened',
      external_actor: null,
      external_url: issue.url,
      ...(state === 'closed' && stateReasonForEvent(issue)
        ? { state_reason: stateReasonForEvent(issue) }
        : {}),
    },
  };
}

export async function syncComments(
  ctx: Context,
  taskId: string | null,
  issue: NormalizedIssue
) {
  const known = taskId
    ? await ctx.store.commentUrls(taskId)
    : new Set<string>();
  const rows = issue.comments
    .filter((comment) => comment.body.trim() && !known.has(comment.url))
    .map((comment) => {
      const authorId = comment.author
        ? ctx.mapping.authors[comment.author]
        : undefined;
      return {
        author_id: authorId && ctx.memberIds.has(authorId) ? authorId : null,
        external_author: comment.author ?? 'unknown',
        external_url: comment.url,
        body: comment.body,
        created_at:
          timestampOrNull(comment.created_at) ?? new Date().toISOString(),
      };
    });
  return rows;
}

export async function pendingLinks(
  ctx: Context,
  taskId: string | null,
  issue: NormalizedIssue
) {
  const known = taskId ? await ctx.store.linkUrls(taskId) : new Set<string>();
  return planLinks(issue)
    .filter((spec) => !known.has(spec.url))
    .map((spec) => ({
      kind: spec.kind,
      provider: spec.provider,
      url: spec.url,
      external_id: spec.externalId,
      title: spec.title,
      state: spec.state,
    }));
}

/**
 * History rows for the issue's original timeline. The actor maps to a
 * workspace user only through the authors mapping; otherwise the login stays
 * in the metadata.
 */
export function timelineEventRows(
  taskId: string,
  issue: NormalizedIssue,
  authors: Record<string, string>,
  memberIds: ReadonlySet<string>
): HistoryInsert[] {
  const rows: HistoryInsert[] = [];
  for (const event of issue.events) {
    const at = timestampOrNull(event.at);
    if (!at) continue;
    const mapped = event.actor ? authors[event.actor] : undefined;
    rows.push({
      task_id: taskId,
      changed_by: mapped && memberIds.has(mapped) ? mapped : null,
      changed_at: at,
      change_type: 'external_event',
      field_name: 'external',
      ...(event.event === 'closed' || event.event === 'reopened'
        ? {
            old_value: event.event === 'closed' ? 'open' : 'closed',
            new_value: event.event === 'closed' ? 'closed' : 'open',
          }
        : {}),
      metadata: {
        event: event.event,
        external_actor: event.actor ?? null,
        external_url: issue.url,
        ...(event.event === 'closed' && stateReasonForEvent(issue)
          ? { state_reason: stateReasonForEvent(issue) }
          : {}),
        ...(event.label ? { label: event.label } : {}),
        ...(event.milestone ? { milestone: event.milestone } : {}),
        ...(event.assignee ? { assignee: event.assignee } : {}),
      },
    });
  }
  return rows;
}
