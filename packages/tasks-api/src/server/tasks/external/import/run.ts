import type { NormalizedIssue } from '../schemas';
import {
  externalEventKey,
  importTaskName,
  issueTaskState,
  planLabels,
  planPeople,
  refStateReason,
  resolveIssueList,
  taskFieldsForList,
  timestampOrNull,
} from './plan';
import { linkRelationships } from './relationships';
import {
  buildDescription,
  type Context,
  eventRow,
  GUID,
  type ImportAction,
  type ImportInput,
  type IssueResult,
  pendingLinks,
  refValues,
  sameInstant,
  sameSet,
  syncComments,
  timelineEventRows,
} from './run-support';
import type { HistoryInsert, ImportStore, TaskPatch } from './store-types';

export type { ImportAction, ImportInput, IssueResult } from './run-support';

async function importOne(
  ctx: Context,
  issue: NormalizedIssue
): Promise<IssueResult> {
  const { store, wsId, actorId } = ctx;
  const warnings: string[] = [];
  const result = (
    action: ImportAction,
    taskId: string | null
  ): IssueResult => ({
    url: issue.url,
    number: issue.number,
    action,
    task_id: taskId,
    warnings,
  });

  const labelPlan = planLabels(issue.labels, ctx.mapping.labels);
  for (const label of issue.labels) {
    const target = ctx.mapping.labels[label];
    if (target && ctx.badLabelTargets.has(target)) {
      warnings.push(`label_target_missing: ${label}`);
    }
  }
  const labelIds = [
    ...new Set([
      ...ctx.alwaysLabelIds,
      ...labelPlan.labelIds.filter((id) => !ctx.badLabelTargets.has(id)),
    ]),
  ];
  const people = planPeople(
    issue.assignees,
    ctx.mapping.assignees,
    ctx.memberIds
  );
  if (people.unmapped.length) {
    warnings.push(`unmapped_assignees: ${people.unmapped.join(', ')}`);
  }
  const cycleId = issue.milestone
    ? ctx.mapping.milestones[issue.milestone]
    : undefined;
  if (issue.milestone && !cycleId)
    warnings.push(`unmapped_milestone: ${issue.milestone}`);
  const cycleOk = cycleId && ctx.cycleIds.has(cycleId) ? cycleId : null;
  if (cycleId && !cycleOk)
    warnings.push(`milestone_target_missing: ${issue.milestone}`);

  const state = issueTaskState(issue);
  const name = importTaskName(issue.title, issue.number);
  const description = buildDescription(issue, warnings);
  const values = refValues(issue, people);
  const ref = ctx.refs.get(issue.url);

  if (!ref) {
    const list = resolveIssueList(
      state,
      ctx.mapping.status_lists,
      ctx.lists,
      ctx.board
    );
    if (!list) {
      warnings.push('no_target_list');
      return result('skip', null);
    }
    if (ctx.dryRun) return result('create', null);
    const comments = await syncComments(ctx, null, issue);

    const taskId = await store.createTask(ctx.board, actorId, {
      name,
      description: description.description,
      description_yjs_state: description.yjs,
      list_id: list.id,
      priority: labelPlan.priority,
      ...taskFieldsForList(list, issue),
      created_at: timestampOrNull(issue.created_at),
    });
    const saved = await store.insertRef(
      wsId,
      taskId,
      actorId,
      issue.url,
      values
    );
    if (saved === 'conflict') {
      await store.deleteTask(taskId);
      warnings.push('concurrent_import');
      return result('skip', null);
    }
    await store.setRelations(taskId, actorId, {
      labelIds,
      ...(people.userIds.length ? { assigneeIds: people.userIds } : {}),
    });
    const history: HistoryInsert[] = [
      {
        task_id: taskId,
        changed_by: actorId,
        changed_at: new Date().toISOString(),
        change_type: 'external_imported',
        field_name: 'external',
        metadata: {
          external_url: issue.url,
          external_number: issue.number,
          external_repo: issue.repo,
        },
      },
    ];
    // The recorded timeline carries the original close; the synthesized event
    // only stands in when the source supplied none.
    const timeline = timelineEventRows(
      taskId,
      issue,
      ctx.mapping.authors,
      ctx.memberIds
    );
    if (timeline.length) history.push(...timeline);
    else if (issue.state === 'closed')
      history.push(eventRow(taskId, issue, 'closed'));
    await store.insertHistory(history);
    await store.insertComments(wsId, taskId, comments);
    await store.insertLinks(
      wsId,
      taskId,
      actorId,
      await pendingLinks(ctx, null, issue)
    );
    if (cycleOk) await store.addToCycle(taskId, cycleOk);
    return result('create', taskId);
  }

  // A task is only ever touched through its own external ref.
  // The ref may point at a task that was moved to another workspace or
  // removed; such a task is never read or written through this import.
  const task = await store.loadTask(ref.task_id, wsId);
  if (!task || task.deleted_at) {
    warnings.push(task ? 'task_deleted' : 'task_outside_workspace');
    return result('skip', task ? ref.task_id : null);
  }

  // Only a change of the issue's open/closed state moves the task. Name,
  // description, list, priority and assignees stay as people left them unless
  // the caller opts into refreshing content.
  const stateChanged = ref.external_state !== issue.state;
  const reasonChanged =
    (ref.external_state_reason ?? null) !== refStateReason(issue);
  const patch: TaskPatch = {};
  if (ctx.refreshContent) {
    if (task.name !== name) patch.name = name;
    if ((task.description ?? null) !== description.description) {
      patch.description = description.description;
      patch.description_yjs_state = description.yjs;
    }
  }
  if (stateChanged) {
    const list = resolveIssueList(
      state,
      ctx.mapping.status_lists,
      ctx.lists,
      ctx.board
    );
    if (list) {
      if (list.id !== task.list_id) patch.list_id = list.id;
      Object.assign(patch, taskFieldsForList(list, issue));
    } else {
      warnings.push('no_target_list');
    }
  }

  const existingLabels = await store.loadTaskLabelIds(task.id);
  const missingLabels = labelIds.filter((id) => !existingLabels.includes(id));
  const comments = await syncComments(ctx, task.id, issue);
  const links = await pendingLinks(ctx, task.id, issue);
  const known = await store.externalEventKeys(task.id);
  const sourceEvents = timelineEventRows(
    task.id,
    issue,
    ctx.mapping.authors,
    ctx.memberIds
  ).filter((event) => !known.has(externalEventKey(event)));
  const newEvents =
    sourceEvents.length || !stateChanged || issue.events.length
      ? sourceEvents
      : [
          eventRow(
            task.id,
            issue,
            issue.state === 'closed' ? 'closed' : 'open'
          ),
        ];
  const refChanged =
    stateChanged ||
    reasonChanged ||
    !sameInstant(ref.external_closed_at, values.external_closed_at) ||
    !sameSet(ref.external_labels, values.external_labels) ||
    !sameSet(ref.external_assignees, values.external_assignees);

  const changed =
    Object.keys(patch).length > 0 ||
    missingLabels.length > 0 ||
    comments.length > 0 ||
    links.length > 0 ||
    newEvents.length > 0 ||
    refChanged;
  if (!changed) return result('skip', task.id);
  if (ctx.dryRun) return result('update', task.id);

  // Check again right before writing: the task can move or be deleted while
  // the plan above was being built.
  const current = await store.loadTask(task.id, wsId);
  if (!current || current.deleted_at) {
    warnings.push(current ? 'task_deleted' : 'task_outside_workspace');
    return result('skip', current ? task.id : null);
  }

  if (Object.keys(patch).length) await store.updateTask(task.id, patch);
  if (missingLabels.length) {
    // Labels people added in Tasks stay; the import only adds its own.
    await store.setRelations(task.id, actorId, {
      labelIds: [...new Set([...existingLabels, ...labelIds])],
    });
  }
  if (refChanged) await store.updateRef(wsId, issue.url, values);
  await store.insertHistory(newEvents);
  await store.insertComments(wsId, task.id, comments);
  await store.insertLinks(wsId, task.id, actorId, links);
  if (cycleOk) await store.addToCycle(task.id, cycleOk);
  return result('update', task.id);
}

/** Second pass: parent/sub-issue links once both ends have tasks. */
export async function runGithubImport(
  store: ImportStore,
  input: ImportInput
): Promise<IssueResult[]> {
  const { mapping, wsId, actorId } = input;
  const labelTargets = Object.values(mapping.labels).filter((value) =>
    GUID.test(value)
  );
  const validLabels = await store.filterWorkspaceLabels(wsId, labelTargets);
  const people = [
    ...Object.values(mapping.assignees),
    ...Object.values(mapping.authors),
  ];
  const always = await store.ensureLabels(wsId, mapping.always_labels, {
    create: !input.dryRun,
    actorId,
  });
  const ctx: Context = {
    ...input,
    alwaysLabelIds: [...always.values()].filter((id): id is string => !!id),
    badLabelTargets: new Set(labelTargets.filter((id) => !validLabels.has(id))),
    cycleIds: await store.filterWorkspaceCycles(
      wsId,
      Object.values(mapping.milestones)
    ),
    memberIds: await store.filterWorkspaceMembers(wsId, [...new Set(people)]),
    refs: await store.findRefs(
      wsId,
      input.issues.map((issue) => issue.url)
    ),
    store,
  };

  const results: IssueResult[] = [];
  for (const issue of input.issues) {
    try {
      results.push(await importOne(ctx, issue));
    } catch (error) {
      console.error('GitHub import failed for an issue:', error);
      results.push({
        url: issue.url,
        number: issue.number,
        action: 'skip',
        task_id: null,
        warnings: [],
        error: error instanceof Error ? error.message : 'Import failed',
      });
    }
  }
  if (!input.dryRun) await linkRelationships(ctx, input.issues, results);
  return results;
}
