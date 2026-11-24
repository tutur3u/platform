import type { StatusListCandidate } from '@tuturuuu/utils/task-board-status-list';

export type ImportBoard = {
  id: string;
  ws_id: string;
  default_done_list_id: string | null;
  default_closed_list_id: string | null;
};

export type ExistingRef = {
  task_id: string;
  external_state: string | null;
  external_state_reason: string | null;
  external_closed_at: string | null;
  external_labels: string[];
  external_assignees: string[];
};

export type ExistingTask = {
  id: string;
  name: string;
  description: string | null;
  list_id: string | null;
  priority: string | null;
  deleted_at: string | null;
};

export type NewTask = {
  name: string;
  description: string | null;
  description_yjs_state: number[] | null;
  list_id: string;
  priority: 'low' | 'normal' | 'high' | 'critical' | null;
  completed: boolean;
  completed_at: string | null;
  closed_at: string | null;
  created_at: string | null;
};

export type TaskPatch = Partial<
  Omit<NewTask, 'created_at' | 'list_id'> & { list_id: string }
>;

export type RefValues = {
  external_repo: string;
  external_number: number;
  external_author: string | null;
  external_state: 'open' | 'closed';
  external_state_reason: string | null;
  external_created_at: string | null;
  external_closed_at: string | null;
  external_labels: string[];
  external_assignees: string[];
};

export type CommentInsert = {
  author_id: string | null;
  external_author: string | null;
  external_url: string;
  body: string;
  created_at: string;
};

export type LinkInsert = {
  kind: string;
  provider: string;
  url: string;
  external_id: string | null;
  title: string | null;
  state: string | null;
};

export type HistoryInsert = {
  task_id: string;
  changed_by: string | null;
  changed_at: string;
  change_type: 'external_imported' | 'external_event';
  field_name: string;
  old_value?: unknown;
  new_value?: unknown;
  metadata: Record<string, unknown>;
};

/** Every database effect of an import; tests replace it with a fake. */
export interface ImportStore {
  loadBoard(
    boardId: string,
    wsId: string
  ): Promise<{ board: ImportBoard; lists: StatusListCandidate[] } | null>;
  filterWorkspaceMembers(wsId: string, ids: string[]): Promise<Set<string>>;
  filterWorkspaceLabels(wsId: string, ids: string[]): Promise<Set<string>>;
  filterWorkspaceCycles(wsId: string, ids: string[]): Promise<Set<string>>;
  /** Resolves label names to ids, creating missing ones only when asked. */
  ensureLabels(
    wsId: string,
    names: string[],
    options: { create: boolean; actorId: string }
  ): Promise<Map<string, string | null>>;
  findRefs(wsId: string, urls: string[]): Promise<Map<string, ExistingRef>>;
  /** The task, or null when it does not sit on a board of this workspace. */
  loadTask(taskId: string, wsId: string): Promise<ExistingTask | null>;
  loadTaskLabelIds(taskId: string): Promise<string[]>;
  createTask(
    board: ImportBoard,
    actorId: string,
    task: NewTask
  ): Promise<string>;
  updateTask(taskId: string, patch: TaskPatch): Promise<void>;
  deleteTask(taskId: string): Promise<void>;
  setRelations(
    taskId: string,
    actorId: string,
    relations: { labelIds?: string[]; assigneeIds?: string[] }
  ): Promise<void>;
  insertRef(
    wsId: string,
    taskId: string,
    actorId: string,
    url: string,
    values: RefValues
  ): Promise<'created' | 'conflict'>;
  updateRef(wsId: string, url: string, values: RefValues): Promise<void>;
  commentUrls(taskId: string): Promise<Set<string>>;
  insertComments(
    wsId: string,
    taskId: string,
    rows: CommentInsert[]
  ): Promise<void>;
  linkUrls(taskId: string): Promise<Set<string>>;
  insertLinks(
    wsId: string,
    taskId: string,
    actorId: string,
    rows: LinkInsert[]
  ): Promise<void>;
  insertHistory(rows: HistoryInsert[]): Promise<void>;
  /** Keys (externalEventKey) of the external_event rows a task already has. */
  externalEventKeys(taskId: string): Promise<Set<string>>;
  addToCycle(taskId: string, cycleId: string): Promise<void>;
  taskIdsByRefUrl(wsId: string, urls: string[]): Promise<Map<string, string>>;
  linkParentChild(
    parentId: string,
    childId: string,
    actorId: string
  ): Promise<void>;
}
