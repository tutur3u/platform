import { randomUUID } from 'node:crypto';
import type { StatusListCandidate } from '@tuturuuu/utils/task-board-status-list';
import type {
  CommentInsert,
  ExistingRef,
  ExistingTask,
  HistoryInsert,
  ImportBoard,
  ImportStore,
  LinkInsert,
  RefValues,
  TaskPatch,
} from './store';

export const FLEET_LISTS: StatusListCandidate[] = [
  { id: 'l-queued', name: 'Queued', status: 'not_started', position: 0 },
  { id: 'l-live', name: 'Live Today', status: 'active', position: 1 },
  {
    id: 'l-review',
    name: 'Needs User / Review',
    status: 'review',
    position: 2,
  },
  { id: 'l-done', name: 'Done', status: 'done', position: 3 },
  { id: 'l-closed', name: 'Archived / Closed', status: 'closed', position: 4 },
  {
    id: 'l-waiting',
    name: 'Waiting on USER',
    status: 'not_started',
    position: 5,
  },
  {
    id: 'l-knowledge',
    name: 'Fleet Knowledge',
    status: 'not_started',
    position: 6,
  },
];

type StoredTask = ExistingTask & {
  completed: boolean | null;
  completed_at: string | null;
  closed_at: string | null;
  created_at: string | null;
  creator_id: string;
  description_yjs_state: number[] | null;
};

/** In-memory ImportStore that enforces the same keys as the database. */
export class FakeImportStore implements ImportStore {
  board: ImportBoard;
  lists: StatusListCandidate[];
  members = new Set<string>();
  workspaceLabels = new Map<string, string>(); // name -> id
  cycles = new Set<string>();
  tasks = new Map<string, StoredTask>();
  taskLabels = new Map<string, Set<string>>();
  taskAssignees = new Map<string, string[]>();
  refs = new Map<
    string,
    ExistingRef & { task_id: string; values: RefValues; imported_by: string }
  >();
  comments = new Map<string, Array<CommentInsert & { task_id: string }>>();
  links = new Map<string, Array<LinkInsert & { task_id: string }>>();
  history: HistoryInsert[] = [];
  cycleTasks: Array<[string, string]> = [];
  relationships: Array<[string, string]> = [];
  writes = 0;
  failCreateFor: string | null = null;

  constructor(
    public wsId: string,
    lists: StatusListCandidate[] = FLEET_LISTS,
    defaults: Partial<ImportBoard> = {}
  ) {
    this.lists = lists;
    this.board = {
      id: 'board-1',
      ws_id: wsId,
      default_done_list_id: null,
      default_closed_list_id: null,
      ...defaults,
    };
  }

  /** A task another tool synced: it has no external ref. */
  addForeignTask(name: string, listId = 'l-queued') {
    const id = randomUUID();
    this.tasks.set(id, {
      id,
      name,
      description: null,
      list_id: listId,
      priority: null,
      deleted_at: null,
      completed: false,
      completed_at: null,
      closed_at: null,
      created_at: null,
      creator_id: 'other',
      description_yjs_state: null,
    });
    return id;
  }

  async loadBoard(boardId: string, wsId: string) {
    return boardId === this.board.id && wsId === this.board.ws_id
      ? { board: this.board, lists: this.lists }
      : null;
  }
  async filterWorkspaceMembers(_ws: string, ids: string[]) {
    return new Set(ids.filter((id) => this.members.has(id)));
  }
  async filterWorkspaceLabels(_ws: string, ids: string[]) {
    const known = new Set(this.workspaceLabels.values());
    return new Set(ids.filter((id) => known.has(id)));
  }
  async filterWorkspaceCycles(_ws: string, ids: string[]) {
    return new Set(ids.filter((id) => this.cycles.has(id)));
  }
  async ensureLabels(
    _ws: string,
    names: string[],
    options: { create: boolean }
  ) {
    const out = new Map<string, string | null>();
    for (const name of names) {
      const key = name.toLowerCase();
      let id = this.workspaceLabels.get(key) ?? null;
      if (!id && options.create) {
        id = randomUUID();
        this.workspaceLabels.set(key, id);
        this.writes++;
      }
      out.set(name, id);
    }
    return out;
  }
  async findRefs(_ws: string, urls: string[]) {
    return new Map(
      urls.flatMap((url) =>
        this.refs.has(url) ? [[url, this.refs.get(url)!] as const] : []
      )
    );
  }
  async loadTask(id: string) {
    return this.tasks.get(id) ?? null;
  }
  async loadTaskLabelIds(id: string) {
    return [...(this.taskLabels.get(id) ?? [])];
  }
  async createTask(
    _b: ImportBoard,
    actorId: string,
    task: Parameters<ImportStore['createTask']>[2]
  ) {
    if (this.failCreateFor && task.name.includes(this.failCreateFor))
      throw new Error('create failed');
    this.writes++;
    const id = randomUUID();
    this.tasks.set(id, { ...task, id, deleted_at: null, creator_id: actorId });
    return id;
  }
  async updateTask(id: string, patch: TaskPatch) {
    this.writes++;
    Object.assign(this.tasks.get(id)!, patch);
  }
  async deleteTask(id: string) {
    this.tasks.delete(id);
  }
  async setRelations(
    id: string,
    _actor: string,
    rel: { labelIds?: string[]; assigneeIds?: string[] }
  ) {
    this.writes++;
    if (rel.labelIds) this.taskLabels.set(id, new Set(rel.labelIds));
    if (rel.assigneeIds) this.taskAssignees.set(id, rel.assigneeIds);
  }
  async insertRef(
    _ws: string,
    taskId: string,
    actorId: string,
    url: string,
    values: RefValues
  ) {
    if (this.refs.has(url)) return 'conflict' as const;
    this.writes++;
    this.refs.set(url, {
      task_id: taskId,
      imported_by: actorId,
      values,
      ...values,
    });
    return 'created' as const;
  }
  async updateRef(_ws: string, url: string, values: RefValues) {
    this.writes++;
    Object.assign(this.refs.get(url)!, values, { values });
  }
  async commentUrls(taskId: string) {
    return new Set(
      (this.comments.get(taskId) ?? []).map((c) => c.external_url)
    );
  }
  async insertComments(_ws: string, taskId: string, rows: CommentInsert[]) {
    if (rows.length) this.writes++;
    const list = this.comments.get(taskId) ?? [];
    for (const row of rows) {
      if (!list.some((c) => c.external_url === row.external_url))
        list.push({ ...row, task_id: taskId });
    }
    this.comments.set(taskId, list);
  }
  async linkUrls(taskId: string) {
    return new Set((this.links.get(taskId) ?? []).map((l) => l.url));
  }
  async insertLinks(
    _ws: string,
    taskId: string,
    _actor: string,
    rows: LinkInsert[]
  ) {
    if (rows.length) this.writes++;
    this.links.set(taskId, [
      ...(this.links.get(taskId) ?? []),
      ...rows.map((row) => ({ ...row, task_id: taskId })),
    ]);
  }
  async insertHistory(rows: HistoryInsert[]) {
    if (rows.length) this.writes++;
    this.history.push(...rows);
  }
  async addToCycle(taskId: string, cycleId: string) {
    if (!this.cycleTasks.some(([t, c]) => t === taskId && c === cycleId))
      this.cycleTasks.push([taskId, cycleId]);
  }
  async taskIdsByRefUrl(_ws: string, urls: string[]) {
    return new Map(
      urls.flatMap((url) =>
        this.refs.has(url) ? [[url, this.refs.get(url)!.task_id] as const] : []
      )
    );
  }
  async linkParentChild(parent: string, child: string) {
    if (!this.relationships.some(([p, c]) => p === parent && c === child))
      this.relationships.push([parent, child]);
  }
}
