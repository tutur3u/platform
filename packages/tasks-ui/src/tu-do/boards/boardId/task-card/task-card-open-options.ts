import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import { isPersonalExternalOverlayTask } from '@tuturuuu/ui/lib/task-personal-external';
import {
  type BoardConfig,
  getTaskTicketLabel,
  getTaskTicketProject,
} from '@tuturuuu/utils/task-helper';
import type { SharedTaskContext } from '../../../shared/task-edit-dialog/hooks/use-task-data';

interface TaskCardOpenOptionsInput {
  task: Task;
  boardId: string;
  availableLists?: TaskList[];
  assigneeMemberSource?: 'workspace' | 'board' | 'workspace-and-board';
  canUseBoardAssignees?: boolean;
  effectiveWorkspaceId?: string;
  isPersonalWorkspace: boolean;
}

export function isExternalTaskSnapshot(task: Task) {
  if (task.is_personal_external === false) {
    return false;
  }

  return (
    isPersonalExternalOverlayTask(task) ||
    Boolean(task.source_workspace_id) ||
    Boolean(task.source_board_id)
  );
}

function normalizeSourceListStatus(status?: string | null): TaskList['status'] {
  switch (status) {
    case 'documents':
    case 'not_started':
    case 'active':
    case 'review':
    case 'done':
    case 'closed':
      return status;
    default:
      return 'not_started';
  }
}

function getTaskTicketPrefix(task: Task) {
  return 'ticket_prefix' in task && typeof task.ticket_prefix === 'string'
    ? task.ticket_prefix
    : undefined;
}

export function getTaskCardTicketIdentifier({
  task,
}: {
  boardConfig: BoardConfig | null | undefined;
  isExternalTask: boolean;
  task: Task;
}) {
  return getTaskTicketLabel(task);
}

/** The ticket ID a card shows; Documents lists show none. */
export function getShownTicketIdentifier(
  ticketIdentifier: string | null,
  listStatus: TaskList['status'] | null | undefined
) {
  return listStatus === 'documents' ? null : ticketIdentifier;
}

/** A task's ticket ID as its card shows it. */
export function getShownTaskTicketLabel(
  task: Task,
  listStatus: TaskList['status'] | null | undefined
) {
  return getShownTicketIdentifier(getTaskTicketLabel(task), listStatus);
}

/**
 * Projects to show as a card badge. The `[KEY-N]` prefix already names the
 * project it comes from, so a card whose only project is that one drops the
 * badge; several projects, or a prefix from another project (a personal
 * overlay keeps the source ticket), keep theirs.
 */
export function getTaskCardBadgeProjects(
  task: Pick<Task, 'projects'> & { ticket_projects?: Task['projects'] },
  ticketIdentifier: string | null
): NonNullable<Task['projects']> {
  const projects = task.projects ?? [];
  if (!ticketIdentifier || projects.length !== 1) return projects;
  return getTaskTicketProject(task)?.id === projects[0]?.id ? [] : projects;
}

function buildInitialSourceList(
  task: Task,
  sourceBoardId: string
): TaskList | undefined {
  if (!task.source_list_id) {
    return undefined;
  }

  return {
    id: task.source_list_id,
    name: task.source_list_name ?? task.source_list_id,
    archived: false,
    deleted: false,
    created_at: task.created_at,
    board_id: sourceBoardId,
    creator_id: '',
    status: normalizeSourceListStatus(task.source_list_status),
    color: 'GRAY',
    position: 0,
  };
}

function buildInitialSourceContext(
  task: Task,
  sourceWorkspaceId?: string,
  sourceBoardId?: string
): SharedTaskContext | undefined {
  if (!sourceBoardId) {
    return undefined;
  }

  const sourceList = buildInitialSourceList(task, sourceBoardId);

  return {
    boardConfig: {
      id: sourceBoardId,
      name: task.source_board_name ?? sourceBoardId,
      ws_id: sourceWorkspaceId,
      ticket_prefix: getTaskTicketPrefix(task),
    },
    availableLists: sourceList ? [sourceList] : undefined,
    workspaceLabels: task.labels ?? [],
    workspaceMembers:
      task.assignees?.map((assignee) => ({
        id: assignee.id,
        user_id: assignee.id,
        display_name: assignee.display_name ?? assignee.email ?? assignee.id,
        avatar_url: assignee.avatar_url ?? null,
      })) ?? [],
    workspaceProjects: task.projects ?? [],
  };
}

export function getTaskCardHydratingOpenOptions({
  task,
  boardId,
  availableLists,
  assigneeMemberSource,
  canUseBoardAssignees,
  effectiveWorkspaceId,
  isPersonalWorkspace,
}: TaskCardOpenOptionsInput) {
  const sourceWorkspaceId = task.source_workspace_id;
  const sourceBoardId = task.source_board_id;
  const isExternalSnapshot = isExternalTaskSnapshot(task);
  const initialSharedContext = buildInitialSourceContext(
    task,
    sourceWorkspaceId ?? undefined,
    sourceBoardId ?? undefined
  );
  const initialTask = {
    ...task,
    list_id: task.source_list_id ?? task.list_id,
  };
  const sourceBoardAssigneesEnabled = sourceWorkspaceId
    ? true
    : !isPersonalWorkspace;

  return {
    initialTask,
    boardId: sourceBoardId ?? boardId,
    availableLists:
      sourceBoardId && initialSharedContext?.availableLists
        ? initialSharedContext.availableLists
        : sourceBoardId
          ? undefined
          : availableLists,
    taskWsId: sourceWorkspaceId ?? effectiveWorkspaceId,
    taskWorkspacePersonal: sourceWorkspaceId ? false : isPersonalWorkspace,
    canUseBoardAssignees: canUseBoardAssignees ?? sourceBoardAssigneesEnabled,
    assigneeMemberSource:
      assigneeMemberSource ?? (sourceWorkspaceId ? 'board' : undefined),
    initialSharedContext,
    ...(isExternalSnapshot
      ? {
          visibleBoardId: boardId,
          visibleTaskSnapshot: task,
        }
      : {}),
  };
}

/** The card title's accessible name keeps the visible "[ID] Title" prefix. */
export function getTaskCardTitleName(
  name: string,
  ticketIdentifier: string | null | undefined
) {
  return ticketIdentifier ? `[${ticketIdentifier}] ${name}` : name;
}
