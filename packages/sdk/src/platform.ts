import {
  encodePathSegment,
  getInternalApiClient,
  type InternalApiClientOptions,
} from '@tuturuuu/internal-api/client';
import {
  addWorkspaceTaskLabel,
  type BulkWorkspaceTaskOperation,
  bulkWorkspaceTasks,
  type CreateWorkspaceTaskBoardPayload,
  type CreateWorkspaceTaskListPayload,
  type CreateWorkspaceTaskPayload,
  type CreateWorkspaceTaskWithRelationshipPayload,
  createWorkspaceLabel,
  createWorkspaceTask,
  createWorkspaceTaskBoard,
  createWorkspaceTaskList,
  createWorkspaceTaskProject,
  createWorkspaceTaskRelationship,
  createWorkspaceTaskWithRelationship,
  deleteWorkspaceTask,
  deleteWorkspaceTaskBoard,
  deleteWorkspaceTaskRelationship,
  getWorkspaceBoardsData,
  getWorkspaceTask,
  getWorkspaceTaskBoard,
  getWorkspaceTaskProject,
  getWorkspaceTaskProjectTasks,
  getWorkspaceTaskRelationships,
  type ListWorkspaceTaskBoardsOptions,
  type ListWorkspaceTasksOptions,
  listTaskBoardStatusTemplates,
  listWorkspaceBoardsWithLists,
  listWorkspaceLabels,
  listWorkspaceTaskBoards,
  listWorkspaceTaskLists,
  listWorkspaceTaskProjects,
  type MoveWorkspaceTaskPayload,
  moveWorkspaceTask,
  removeWorkspaceTaskLabel,
  triggerWorkspaceTaskEmbedding,
  type UpdateWorkspaceTaskBoardPayload,
  type UpdateWorkspaceTaskListPayload,
  updateWorkspaceTask,
  updateWorkspaceTaskBoard,
  updateWorkspaceTaskList,
  type WorkspaceTasksResponse,
  type WorkspaceTaskUpdatePayload,
} from '@tuturuuu/internal-api/tasks';
import {
  getCurrentUserDefaultWorkspace,
  getCurrentUserProfile,
} from '@tuturuuu/internal-api/users';
import { listWorkspaces } from '@tuturuuu/internal-api/workspaces';
import { refreshCliSession } from './cli/auth';
import { type CliSession, normalizeBaseUrl } from './cli/config';
import { DevboxesClient } from './platform-devbox';
import { FinanceClient } from './platform-finance';

export interface TuturuuuUserClientConfig {
  accessToken: string;
  baseUrl?: string;
  expiresAt?: number | null;
  fetch?: typeof fetch;
  onSessionRefresh?: (session: CliSession) => void | Promise<void>;
  refreshToken?: string;
}

const SESSION_REFRESH_SKEW_MS = 60_000;
const PROTOCOL_RELATIVE_URL_PATTERN = /^\/\//u;

type CliListWorkspaceTasksOptions = ListWorkspaceTasksOptions & {
  includeArchivedBoards?: boolean;
  listStatuses?: string[];
};

function getAuthorizationHeader(accessToken: string) {
  return `Bearer ${accessToken}`;
}

function getRequestInfoUrl(input: RequestInfo | URL) {
  if (typeof input === 'string') {
    return input;
  }

  if (input instanceof URL) {
    return input.toString();
  }

  if (typeof Request !== 'undefined' && input instanceof Request) {
    return input.url;
  }

  const requestLike = input as { url?: unknown };
  return typeof requestLike.url === 'string' ? requestLike.url : null;
}

function shouldAttachSdkAuth(input: RequestInfo | URL, baseUrl: string) {
  const requestUrl = getRequestInfoUrl(input);

  if (!requestUrl) {
    return false;
  }

  const trimmedUrl = requestUrl.trim();

  if (PROTOCOL_RELATIVE_URL_PATTERN.test(trimmedUrl)) {
    return false;
  }

  try {
    return new URL(trimmedUrl).origin === baseUrl;
  } catch {
    return true;
  }
}

export class WorkspacesClient {
  constructor(private readonly client: TuturuuuUserClient) {}

  list() {
    return listWorkspaces(this.client.getClientOptions());
  }
}

export class UsersClient {
  constructor(private readonly client: TuturuuuUserClient) {}

  defaultWorkspace() {
    return getCurrentUserDefaultWorkspace(this.client.getClientOptions());
  }

  profile() {
    return getCurrentUserProfile(this.client.getClientOptions());
  }
}

export class TasksClient {
  constructor(private readonly client: TuturuuuUserClient) {}

  addLabel(workspaceId: string, taskId: string, labelId: string) {
    return addWorkspaceTaskLabel(
      workspaceId,
      taskId,
      labelId,
      this.client.getClientOptions()
    );
  }

  bulk(
    workspaceId: string,
    payload: { operation: BulkWorkspaceTaskOperation; taskIds: string[] }
  ) {
    return bulkWorkspaceTasks(
      workspaceId,
      payload,
      this.client.getClientOptions()
    );
  }

  create(workspaceId: string, payload: CreateWorkspaceTaskPayload) {
    return createWorkspaceTask(
      workspaceId,
      payload,
      this.client.getClientOptions()
    );
  }

  createBoard(workspaceId: string, payload: CreateWorkspaceTaskBoardPayload) {
    return createWorkspaceTaskBoard(
      workspaceId,
      payload,
      this.client.getClientOptions()
    );
  }

  createList(
    workspaceId: string,
    boardId: string,
    payload: CreateWorkspaceTaskListPayload
  ) {
    return createWorkspaceTaskList(
      workspaceId,
      boardId,
      payload,
      this.client.getClientOptions()
    );
  }

  createProject(
    workspaceId: string,
    payload: { description?: string; name: string }
  ) {
    return createWorkspaceTaskProject(
      workspaceId,
      payload,
      this.client.getClientOptions()
    );
  }

  createRelationship(
    workspaceId: string,
    taskId: string,
    payload: Parameters<typeof createWorkspaceTaskRelationship>[2]
  ): Promise<unknown> {
    return createWorkspaceTaskRelationship(
      workspaceId,
      taskId,
      payload,
      this.client.getClientOptions()
    );
  }

  createWithRelationship(
    workspaceId: string,
    payload: CreateWorkspaceTaskWithRelationshipPayload
  ) {
    return createWorkspaceTaskWithRelationship(
      workspaceId,
      payload,
      this.client.getClientOptions()
    );
  }

  delete(workspaceId: string, taskId: string) {
    return deleteWorkspaceTask(
      workspaceId,
      taskId,
      this.client.getClientOptions()
    );
  }

  deleteBoard(workspaceId: string, boardId: string) {
    return deleteWorkspaceTaskBoard(
      workspaceId,
      boardId,
      this.client.getClientOptions()
    );
  }

  deleteRelationship(
    workspaceId: string,
    taskId: string,
    payload: Parameters<typeof deleteWorkspaceTaskRelationship>[2]
  ): Promise<unknown> {
    return deleteWorkspaceTaskRelationship(
      workspaceId,
      taskId,
      payload,
      this.client.getClientOptions()
    );
  }

  get(workspaceId: string, taskId: string) {
    return getWorkspaceTask(
      workspaceId,
      taskId,
      this.client.getClientOptions()
    );
  }

  getBoard(workspaceId: string, boardId: string) {
    return getWorkspaceTaskBoard(
      workspaceId,
      boardId,
      this.client.getClientOptions()
    );
  }

  getBoardsData(workspaceId: string, options?: ListWorkspaceTaskBoardsOptions) {
    return getWorkspaceBoardsData(
      workspaceId,
      options,
      this.client.getClientOptions()
    );
  }

  getProject(workspaceId: string, projectId: string) {
    return getWorkspaceTaskProject(
      workspaceId,
      projectId,
      this.client.getClientOptions()
    );
  }

  getProjectTasks(workspaceId: string, projectId: string) {
    return getWorkspaceTaskProjectTasks(
      workspaceId,
      projectId,
      this.client.getClientOptions()
    );
  }

  getRelationships(workspaceId: string, taskId: string) {
    return getWorkspaceTaskRelationships(
      workspaceId,
      taskId,
      this.client.getClientOptions()
    );
  }

  list(workspaceId: string, options?: CliListWorkspaceTasksOptions) {
    const client = getInternalApiClient(this.client.getClientOptions());

    return client.json<WorkspaceTasksResponse>(
      `/api/v1/workspaces/${encodePathSegment(workspaceId)}/tasks`,
      {
        query: {
          boardId: options?.boardId,
          listId: options?.listId,
          listStatuses: options?.listStatuses?.join(','),
          q: options?.q,
          identifier: options?.identifier,
          limit: options?.limit,
          offset: options?.offset,
          assignedToMe: options?.assignedToMe,
          completed: options?.completed,
          closed: options?.closed,
          externalIncludeDocuments: options?.externalIncludeDocuments,
          externalIncludeDoneClosed: options?.externalIncludeDoneClosed,
          externalSortBy: options?.externalSortBy,
          forTimeTracking: options?.forTimeTracking,
          includeRelationshipSummary: options?.includeRelationshipSummary,
          includeArchivedBoards: options?.includeArchivedBoards,
          includeDeleted:
            options?.includeDeleted === 'only'
              ? 'only'
              : options?.includeDeleted === true
                ? 'all'
                : undefined,
          includeCount: options?.includeCount,
        },
        cache: 'no-store',
      }
    );
  }

  listBoards(workspaceId: string, options?: ListWorkspaceTaskBoardsOptions) {
    return listWorkspaceTaskBoards(
      workspaceId,
      options,
      this.client.getClientOptions()
    );
  }

  listBoardsWithLists(workspaceId: string) {
    return listWorkspaceBoardsWithLists(
      workspaceId,
      this.client.getClientOptions()
    );
  }

  listLabels(workspaceId: string) {
    return listWorkspaceLabels(workspaceId, this.client.getClientOptions());
  }

  listLists(workspaceId: string, boardId: string) {
    return listWorkspaceTaskLists(
      workspaceId,
      boardId,
      this.client.getClientOptions()
    );
  }

  listProjects(workspaceId: string) {
    return listWorkspaceTaskProjects(
      workspaceId,
      this.client.getClientOptions()
    );
  }

  listStatusTemplates() {
    return listTaskBoardStatusTemplates(this.client.getClientOptions());
  }

  move(workspaceId: string, taskId: string, payload: MoveWorkspaceTaskPayload) {
    return moveWorkspaceTask(
      workspaceId,
      taskId,
      payload,
      this.client.getClientOptions()
    );
  }

  removeLabel(workspaceId: string, taskId: string, labelId: string) {
    return removeWorkspaceTaskLabel(
      workspaceId,
      taskId,
      labelId,
      this.client.getClientOptions()
    );
  }

  triggerEmbedding(workspaceId: string, taskId: string) {
    return triggerWorkspaceTaskEmbedding(
      workspaceId,
      taskId,
      this.client.getClientOptions()
    );
  }

  update(
    workspaceId: string,
    taskId: string,
    payload: WorkspaceTaskUpdatePayload
  ) {
    return updateWorkspaceTask(
      workspaceId,
      taskId,
      payload,
      this.client.getClientOptions()
    );
  }

  updateBoard(
    workspaceId: string,
    boardId: string,
    payload: UpdateWorkspaceTaskBoardPayload
  ) {
    return updateWorkspaceTaskBoard(
      workspaceId,
      boardId,
      payload,
      this.client.getClientOptions()
    );
  }

  updateList(
    workspaceId: string,
    boardId: string,
    listId: string,
    payload: UpdateWorkspaceTaskListPayload
  ) {
    return updateWorkspaceTaskList(
      workspaceId,
      boardId,
      listId,
      payload,
      this.client.getClientOptions()
    );
  }

  createLabel(workspaceId: string, payload: { color: string; name: string }) {
    return createWorkspaceLabel(
      workspaceId,
      payload,
      this.client.getClientOptions()
    );
  }
}

export class TuturuuuUserClient {
  private accessToken: string;
  private readonly baseUrl: string;
  private expiresAt?: number | null;
  private readonly fetchImpl: typeof fetch;
  private readonly onSessionRefresh?: (
    session: CliSession
  ) => void | Promise<void>;
  private refreshPromise?: Promise<CliSession>;
  private refreshToken?: string;

  readonly devboxes: DevboxesClient;
  readonly finance: FinanceClient;
  readonly tasks: TasksClient;
  readonly users: UsersClient;
  readonly workspaces: WorkspacesClient;

  constructor(config: TuturuuuUserClientConfig) {
    this.accessToken = config.accessToken;
    this.baseUrl = normalizeBaseUrl(config.baseUrl);
    this.expiresAt = config.expiresAt;
    this.fetchImpl = config.fetch || globalThis.fetch;
    this.onSessionRefresh = config.onSessionRefresh;
    this.refreshToken = config.refreshToken;
    this.devboxes = new DevboxesClient(this.getClientOptions());
    this.finance = new FinanceClient(this);
    this.tasks = new TasksClient(this);
    this.users = new UsersClient(this);
    this.workspaces = new WorkspacesClient(this);
  }

  private shouldRefreshSession() {
    if (!this.refreshToken || !this.expiresAt) return false;
    return this.expiresAt * 1000 <= Date.now() + SESSION_REFRESH_SKEW_MS;
  }

  private async refreshSession() {
    if (!this.refreshToken) {
      throw new Error('CLI session expired. Run `ttr login` again.');
    }

    this.refreshPromise ??= refreshCliSession({
      baseUrl: this.baseUrl,
      fetch: this.fetchImpl,
      refreshToken: this.refreshToken,
    }).finally(() => {
      this.refreshPromise = undefined;
    });

    const nextSession = await this.refreshPromise;
    this.accessToken = nextSession.accessToken;
    this.expiresAt = nextSession.expiresAt;
    this.refreshToken = nextSession.refreshToken;
    await this.onSessionRefresh?.(nextSession);
    return nextSession;
  }

  getClientOptions(): InternalApiClientOptions {
    return {
      baseUrl: this.baseUrl,
      defaultHeaders: {
        'X-SDK-Client': 'tuturuuu-cli',
      },
      fetch: async (input, init) => {
        const headers = new Headers(init?.headers);
        const attachAuth = shouldAttachSdkAuth(input, this.baseUrl);

        if (!attachAuth) {
          headers.delete('Authorization');

          return this.fetchImpl(input, {
            ...init,
            headers,
          });
        }

        if (this.shouldRefreshSession()) {
          await this.refreshSession();
        }

        headers.set('Authorization', getAuthorizationHeader(this.accessToken));

        const response = await this.fetchImpl(input, {
          ...init,
          headers,
        });
        if (response.status !== 401 || !this.refreshToken) {
          return response;
        }

        await this.refreshSession();
        headers.set('Authorization', getAuthorizationHeader(this.accessToken));

        return this.fetchImpl(input, {
          ...init,
          headers,
        });
      },
    };
  }
}
