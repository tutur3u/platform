import type { SharedTaskContext } from '@tuturuuu/tasks-ui/tu-do/shared/task-edit-dialog';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import type {
  SharedTaskEditResponse,
  SharedTaskResponse,
  SharedTaskViewResponse,
} from '@/app/api/v1/shared/tasks/[shareCode]/response';

export type SharedTaskContentModel =
  | { kind: 'view'; response: SharedTaskViewResponse }
  | { kind: 'edit'; response: SharedTaskEditResponse };

export function getSharedTaskContentModel(
  response: SharedTaskResponse
): SharedTaskContentModel {
  return response.permission === 'view'
    ? { kind: 'view', response }
    : { kind: 'edit', response };
}

export function getSharedTaskEditLists(
  response: SharedTaskEditResponse
): TaskList[] {
  return response.availableLists.length > 0
    ? response.availableLists
    : [{ id: response.list.id, name: response.list.name } as TaskList];
}

export function getSharedTaskEditContext(
  response: SharedTaskEditResponse,
  availableLists: TaskList[]
): SharedTaskContext {
  return {
    boardConfig: response.boardConfig,
    availableLists,
    workspaceLabels: response.workspaceLabels,
    workspaceMembers: response.workspaceMembers,
    workspaceProjects: response.workspaceProjects,
  };
}

function extractDescriptionText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    return value.map(extractDescriptionText).filter(Boolean).join('\n');
  }
  if (!value || typeof value !== 'object') return '';

  const record = value as Record<string, unknown>;
  if (typeof record.text === 'string') return record.text;
  return extractDescriptionText(record.content);
}

export function getSharedTaskDescriptionText(description?: string): string {
  if (!description) return '';
  try {
    return extractDescriptionText(JSON.parse(description)).trim();
  } catch {
    return description.trim();
  }
}
