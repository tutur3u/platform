import {
  encodePathSegment,
  getInternalApiClient,
  type InternalApiClientOptions,
} from '@tuturuuu/internal-api/client';
import {
  applyWorkspaceExternalProjectSyncManifest,
  diffWorkspaceExternalProjectSyncManifest,
  type ExternalProjectSyncManifest,
  getWorkspaceExternalProjectDelivery,
  getWorkspaceExternalProjectStudio,
  getWorkspaceExternalProjectSummary,
  getWorkspaceExternalProjectSyncSnapshot,
  listWorkspaceExternalProjectCollections,
  listWorkspaceExternalProjectEntries,
  setupWorkspaceExternalProject,
  type WorkspaceExternalProjectSyncApplyPayload,
} from '@tuturuuu/internal-api/external-projects';
import {
  abortWorkspaceTaskDescriptionChunks,
  addWorkspaceTaskLabel,
  appendWorkspaceTaskDescriptionChunk,
  type BulkWorkspaceTaskOperation,
  beginWorkspaceTaskDescriptionChunks,
  bulkWorkspaceTasks,
  type CreateWorkspaceTaskBoardPayload,
  type CreateWorkspaceTaskListPayload,
  type CreateWorkspaceTaskPayload,
  type CreateWorkspaceTaskWithRelationshipPayload,
  commitWorkspaceTaskDescriptionChunks,
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
  getWorkspaceTaskDescription,
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
  type SearchWorkspaceTasksPayload,
  type SearchWorkspaceTasksResponse,
  searchWorkspaceTasks,
  triggerWorkspaceTaskEmbedding,
  type UpdateWorkspaceTaskBoardPayload,
  type UpdateWorkspaceTaskListPayload,
  updateWorkspaceTask,
  updateWorkspaceTaskBoard,
  updateWorkspaceTaskDescription,
  updateWorkspaceTaskList,
  type WorkspaceTaskDescriptionChunkFields,
  type WorkspaceTaskDescriptionUpdatePayload,
  type WorkspaceTasksResponse,
  type WorkspaceTaskUpdatePayload,
} from '@tuturuuu/internal-api/tasks';
import {
  getCurrentUserDefaultWorkspace,
  getCurrentUserProfile,
} from '@tuturuuu/internal-api/users';
import { listWorkspaces } from '@tuturuuu/internal-api/workspaces';
import { taskDescriptionYjsStateToBase64 } from '@tuturuuu/utils/task-description-codec';
import { refreshCliSession } from './cli/auth';
import { type CliSession, normalizeBaseUrl } from './cli/config';
import { CalendarClient } from './platform-calendar';
import { DevboxesClient } from './platform-devbox';
import { FinanceClient } from './platform-finance';
import {
  createWorkspaceTaskTemplate,
  deleteWorkspaceTaskTemplate,
  getWorkspaceTaskTemplate,
  type InstantiateWorkspaceTaskTemplatePayload,
  instantiateWorkspaceTaskTemplate,
  type ListWorkspaceTaskTemplatesOptions,
  listWorkspaceTaskTemplates,
  type SaveWorkspaceTaskTemplateFromTaskPayload,
  saveWorkspaceTaskTemplateFromTask,
  type UpdateWorkspaceTaskTemplatePayload,
  updateWorkspaceTaskTemplate,
  type WorkspaceTaskTemplatePayload,
} from './task-templates';

export interface TuturuuuUserClientConfig {
  accessToken: string;
  baseUrl?: string;
  expiresAt?: number | null;
  fetch?: typeof fetch;
  onSessionRefresh?: (session: CliSession) => void | Promise<void>;
  refreshToken?: string;
  tasksBaseUrl?: string;
}

const SESSION_REFRESH_SKEW_MS = 60_000;
const PROTOCOL_RELATIVE_URL_PATTERN = /^\/\//u;
const TASK_DESCRIPTION_CHUNK_SIZE = 180_000;
const DEFAULT_TASKS_BASE_URL = 'https://tasks.tuturuuu.com';

type CliListWorkspaceTasksOptions = ListWorkspaceTasksOptions & {
  includeArchivedBoards?: boolean;
  listStatuses?: string[];
};

type TaskDescriptionChunkPayloadField =
  | {
      field: 'description';
      value: string | null;
    }
  | {
      field: 'description_yjs_state';
      value: string | null;
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

function inferTasksBaseUrl(baseUrl?: string) {
  const platformBaseUrl = normalizeBaseUrl(baseUrl);
  const url = new URL(platformBaseUrl);

  if (url.hostname === 'tuturuuu.com') {
    return DEFAULT_TASKS_BASE_URL;
  }

  if (url.hostname === 'tuturuuu.localhost') {
    return 'https://tasks.tuturuuu.localhost';
  }

  if (
    ['localhost', '127.0.0.1', '[::1]', '::1'].includes(url.hostname) &&
    url.port === '7803'
  ) {
    url.port = '7809';
    return url.origin;
  }

  return DEFAULT_TASKS_BASE_URL;
}

function chunkText(value: string, chunkSize = TASK_DESCRIPTION_CHUNK_SIZE) {
  const chunks: string[] = [];
  for (let index = 0; index < value.length; index += chunkSize) {
    chunks.push(value.slice(index, index + chunkSize));
  }
  return chunks;
}

function buildTaskDescriptionChunkFields(
  payload: WorkspaceTaskDescriptionUpdatePayload
) {
  const fields: WorkspaceTaskDescriptionChunkFields = {};
  const payloadFields: TaskDescriptionChunkPayloadField[] = [];

  if ('description' in payload) {
    payloadFields.push({
      field: 'description',
      value: payload.description ?? null,
    });
  }

  if ('description_yjs_state' in payload) {
    payloadFields.push({
      field: 'description_yjs_state',
      value: taskDescriptionYjsStateToBase64(payload.description_yjs_state),
    });
  }

  const chunksByField = new Map<
    TaskDescriptionChunkPayloadField['field'],
    string[]
  >();

  for (const { field, value } of payloadFields) {
    const normalizedValue = value === '' ? null : value;

    if (normalizedValue === null) {
      fields[field] = {
        chunk_count: 0,
        is_null: true,
        total_length: 0,
      };
      chunksByField.set(field, []);
      continue;
    }

    const chunks = chunkText(normalizedValue);
    fields[field] = {
      chunk_count: chunks.length,
      total_length: normalizedValue.length,
    };
    chunksByField.set(field, chunks);
  }

  return { chunksByField, fields };
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

export class ExternalProjectsUserClient {
  constructor(private readonly client: TuturuuuUserClient) {}

  apply(
    workspaceId: string,
    payload: WorkspaceExternalProjectSyncApplyPayload
  ) {
    return applyWorkspaceExternalProjectSyncManifest(
      workspaceId,
      payload,
      this.client.getClientOptions()
    );
  }

  collections(workspaceId: string) {
    return listWorkspaceExternalProjectCollections(
      workspaceId,
      this.client.getClientOptions()
    );
  }

  delivery(workspaceId: string, options?: { preview?: boolean }) {
    return getWorkspaceExternalProjectDelivery(
      workspaceId,
      options?.preview === true,
      this.client.getClientOptions()
    );
  }

  diff(workspaceId: string, manifest: ExternalProjectSyncManifest) {
    return diffWorkspaceExternalProjectSyncManifest(
      workspaceId,
      { manifest },
      this.client.getClientOptions()
    );
  }

  entries(workspaceId: string, options?: { collectionId?: string }) {
    return listWorkspaceExternalProjectEntries(
      workspaceId,
      options,
      this.client.getClientOptions()
    );
  }

  setup(workspaceId: string, manifest: ExternalProjectSyncManifest) {
    return setupWorkspaceExternalProject(
      workspaceId,
      { manifest },
      this.client.getClientOptions()
    );
  }

  snapshot(workspaceId: string) {
    return getWorkspaceExternalProjectSyncSnapshot(
      workspaceId,
      this.client.getClientOptions()
    );
  }

  studio(workspaceId: string) {
    return getWorkspaceExternalProjectStudio(
      workspaceId,
      this.client.getClientOptions()
    );
  }

  summary(workspaceId: string) {
    return getWorkspaceExternalProjectSummary(
      workspaceId,
      this.client.getClientOptions()
    );
  }
}

export class ExternalClient {
  readonly projects: ExternalProjectsUserClient;

  constructor(client: TuturuuuUserClient) {
    this.projects = new ExternalProjectsUserClient(client);
  }
}

export class TasksClient {
  constructor(private readonly client: TuturuuuUserClient) {}

  addLabel(workspaceId: string, taskId: string, labelId: string) {
    return addWorkspaceTaskLabel(
      workspaceId,
      taskId,
      labelId,
      this.client.getTaskClientOptions()
    );
  }

  bulk(
    workspaceId: string,
    payload: { operation: BulkWorkspaceTaskOperation; taskIds: string[] }
  ) {
    return bulkWorkspaceTasks(
      workspaceId,
      payload,
      this.client.getTaskClientOptions()
    );
  }

  create(workspaceId: string, payload: CreateWorkspaceTaskPayload) {
    return createWorkspaceTask(
      workspaceId,
      payload,
      this.client.getTaskClientOptions()
    );
  }

  createTemplate(workspaceId: string, payload: WorkspaceTaskTemplatePayload) {
    return createWorkspaceTaskTemplate(
      workspaceId,
      payload,
      this.client.getTaskClientOptions()
    );
  }

  getDescription(workspaceId: string, taskId: string) {
    return getWorkspaceTaskDescription(
      workspaceId,
      taskId,
      this.client.getTaskClientOptions()
    );
  }

  updateDescription(
    workspaceId: string,
    taskId: string,
    payload: WorkspaceTaskDescriptionUpdatePayload
  ) {
    return updateWorkspaceTaskDescription(
      workspaceId,
      taskId,
      payload,
      this.client.getTaskClientOptions()
    );
  }

  async updateDescriptionChunked(
    workspaceId: string,
    taskId: string,
    payload: WorkspaceTaskDescriptionUpdatePayload
  ) {
    const { chunksByField, fields } = buildTaskDescriptionChunkFields(payload);
    if (Object.keys(fields).length === 0) {
      throw new Error('Task description chunked update payload is empty');
    }

    const { session_id: sessionId } = await beginWorkspaceTaskDescriptionChunks(
      workspaceId,
      taskId,
      fields,
      this.client.getTaskClientOptions()
    );

    try {
      for (const [field, chunks] of chunksByField.entries()) {
        for (const [chunkIndex, chunk] of chunks.entries()) {
          await appendWorkspaceTaskDescriptionChunk(
            workspaceId,
            taskId,
            {
              chunk,
              chunk_index: chunkIndex,
              field,
              session_id: sessionId,
            },
            this.client.getTaskClientOptions()
          );
        }
      }

      return await commitWorkspaceTaskDescriptionChunks(
        workspaceId,
        taskId,
        sessionId,
        this.client.getTaskClientOptions()
      );
    } catch (error) {
      await abortWorkspaceTaskDescriptionChunks(
        workspaceId,
        taskId,
        sessionId,
        this.client.getTaskClientOptions()
      ).catch(() => undefined);
      throw error;
    }
  }

  createBoard(workspaceId: string, payload: CreateWorkspaceTaskBoardPayload) {
    return createWorkspaceTaskBoard(
      workspaceId,
      payload,
      this.client.getTaskClientOptions()
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
      this.client.getTaskClientOptions()
    );
  }

  createProject(
    workspaceId: string,
    payload: { description?: string; name: string }
  ) {
    return createWorkspaceTaskProject(
      workspaceId,
      payload,
      this.client.getTaskClientOptions()
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
      this.client.getTaskClientOptions()
    );
  }

  createWithRelationship(
    workspaceId: string,
    payload: CreateWorkspaceTaskWithRelationshipPayload
  ) {
    return createWorkspaceTaskWithRelationship(
      workspaceId,
      payload,
      this.client.getTaskClientOptions()
    );
  }

  delete(workspaceId: string, taskId: string) {
    return deleteWorkspaceTask(
      workspaceId,
      taskId,
      this.client.getTaskClientOptions()
    );
  }

  deleteTemplate(
    workspaceId: string,
    templateKey: string,
    options?: { permanent?: boolean }
  ) {
    return deleteWorkspaceTaskTemplate(
      workspaceId,
      templateKey,
      options,
      this.client.getTaskClientOptions()
    );
  }

  deleteBoard(workspaceId: string, boardId: string) {
    return deleteWorkspaceTaskBoard(
      workspaceId,
      boardId,
      this.client.getTaskClientOptions()
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
      this.client.getTaskClientOptions()
    );
  }

  get(workspaceId: string, taskId: string) {
    return getWorkspaceTask(
      workspaceId,
      taskId,
      this.client.getTaskClientOptions()
    );
  }

  getTemplate(workspaceId: string, templateKey: string) {
    return getWorkspaceTaskTemplate(
      workspaceId,
      templateKey,
      this.client.getTaskClientOptions()
    );
  }

  getBoard(workspaceId: string, boardId: string) {
    return getWorkspaceTaskBoard(
      workspaceId,
      boardId,
      this.client.getTaskClientOptions()
    );
  }

  getBoardsData(workspaceId: string, options?: ListWorkspaceTaskBoardsOptions) {
    return getWorkspaceBoardsData(
      workspaceId,
      options,
      this.client.getTaskClientOptions()
    );
  }

  getProject(workspaceId: string, projectId: string) {
    return getWorkspaceTaskProject(
      workspaceId,
      projectId,
      this.client.getTaskClientOptions()
    );
  }

  getProjectTasks(workspaceId: string, projectId: string) {
    return getWorkspaceTaskProjectTasks(
      workspaceId,
      projectId,
      this.client.getTaskClientOptions()
    );
  }

  getRelationships(workspaceId: string, taskId: string) {
    return getWorkspaceTaskRelationships(
      workspaceId,
      taskId,
      this.client.getTaskClientOptions()
    );
  }

  list(workspaceId: string, options?: CliListWorkspaceTasksOptions) {
    const client = getInternalApiClient(this.client.getTaskClientOptions());

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
      this.client.getTaskClientOptions()
    );
  }

  listBoardsWithLists(workspaceId: string) {
    return listWorkspaceBoardsWithLists(
      workspaceId,
      this.client.getTaskClientOptions()
    );
  }

  listLabels(workspaceId: string) {
    return listWorkspaceLabels(workspaceId, this.client.getTaskClientOptions());
  }

  listLists(workspaceId: string, boardId: string) {
    return listWorkspaceTaskLists(
      workspaceId,
      boardId,
      this.client.getTaskClientOptions()
    );
  }

  listProjects(workspaceId: string) {
    return listWorkspaceTaskProjects(
      workspaceId,
      this.client.getTaskClientOptions()
    );
  }

  listTemplates(
    workspaceId: string,
    options?: ListWorkspaceTaskTemplatesOptions
  ) {
    return listWorkspaceTaskTemplates(
      workspaceId,
      options,
      this.client.getTaskClientOptions()
    );
  }

  listStatusTemplates() {
    return listTaskBoardStatusTemplates(this.client.getTaskClientOptions());
  }

  move(workspaceId: string, taskId: string, payload: MoveWorkspaceTaskPayload) {
    return moveWorkspaceTask(
      workspaceId,
      taskId,
      payload,
      this.client.getTaskClientOptions()
    );
  }

  removeLabel(workspaceId: string, taskId: string, labelId: string) {
    return removeWorkspaceTaskLabel(
      workspaceId,
      taskId,
      labelId,
      this.client.getTaskClientOptions()
    );
  }

  search(
    workspaceId: string,
    payload: SearchWorkspaceTasksPayload
  ): Promise<SearchWorkspaceTasksResponse> {
    return searchWorkspaceTasks(
      workspaceId,
      payload,
      this.client.getTaskClientOptions()
    );
  }

  saveTemplateFromTask(
    workspaceId: string,
    payload: SaveWorkspaceTaskTemplateFromTaskPayload
  ) {
    return saveWorkspaceTaskTemplateFromTask(
      workspaceId,
      payload,
      this.client.getTaskClientOptions()
    );
  }

  triggerEmbedding(workspaceId: string, taskId: string) {
    return triggerWorkspaceTaskEmbedding(
      workspaceId,
      taskId,
      this.client.getTaskClientOptions()
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
      this.client.getTaskClientOptions()
    );
  }

  updateTemplate(
    workspaceId: string,
    templateKey: string,
    payload: UpdateWorkspaceTaskTemplatePayload
  ) {
    return updateWorkspaceTaskTemplate(
      workspaceId,
      templateKey,
      payload,
      this.client.getTaskClientOptions()
    );
  }

  useTemplate(
    workspaceId: string,
    templateKey: string,
    payload: InstantiateWorkspaceTaskTemplatePayload
  ) {
    return instantiateWorkspaceTaskTemplate(
      workspaceId,
      templateKey,
      payload,
      this.client.getTaskClientOptions()
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
      this.client.getTaskClientOptions()
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
      this.client.getTaskClientOptions()
    );
  }

  createLabel(workspaceId: string, payload: { color: string; name: string }) {
    return createWorkspaceLabel(
      workspaceId,
      payload,
      this.client.getTaskClientOptions()
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
  private readonly tasksBaseUrl: string;

  readonly calendar: CalendarClient;
  readonly devboxes: DevboxesClient;
  readonly external: ExternalClient;
  readonly finance: FinanceClient;
  readonly tasks: TasksClient;
  readonly users: UsersClient;
  readonly workspaces: WorkspacesClient;

  constructor(config: TuturuuuUserClientConfig) {
    this.accessToken = config.accessToken;
    this.baseUrl = normalizeBaseUrl(config.baseUrl);
    this.tasksBaseUrl = normalizeBaseUrl(
      config.tasksBaseUrl ?? inferTasksBaseUrl(config.baseUrl)
    );
    this.expiresAt = config.expiresAt;
    this.fetchImpl = config.fetch || globalThis.fetch;
    this.onSessionRefresh = config.onSessionRefresh;
    this.refreshToken = config.refreshToken;
    this.calendar = new CalendarClient(this);
    this.devboxes = new DevboxesClient(this.getClientOptions());
    this.external = new ExternalClient(this);
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

  private createClientOptions(baseUrl: string): InternalApiClientOptions {
    return {
      baseUrl,
      defaultHeaders: {
        'X-SDK-Client': 'tuturuuu-cli',
      },
      fetch: async (input, init) => {
        const headers = new Headers(init?.headers);
        const attachAuth = shouldAttachSdkAuth(input, baseUrl);

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

  getClientOptions(): InternalApiClientOptions {
    return this.createClientOptions(this.baseUrl);
  }

  getTaskClientOptions(): InternalApiClientOptions {
    return this.createClientOptions(this.tasksBaseUrl);
  }
}
