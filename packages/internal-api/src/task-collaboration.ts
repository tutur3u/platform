import {
  encodePathSegment,
  getInternalApiClient,
  type InternalApiClientOptions,
  withTaskApiBaseUrl,
} from './client';

const credentialedRequest = {
  cache: 'no-store',
  credentials: 'include',
} satisfies RequestInit;

function taskApi(options?: InternalApiClientOptions) {
  return getInternalApiClient(withTaskApiBaseUrl(options));
}

function taskPath(workspaceId: string, taskId: string) {
  return `/api/v1/workspaces/${encodePathSegment(workspaceId)}/tasks/${encodePathSegment(taskId)}`;
}

function pageQuery(page?: TaskPageOptions) {
  const query = new URLSearchParams();
  if (page?.cursor) query.set('cursor', page.cursor);
  if (page?.limit) query.set('limit', String(page.limit));
  const text = query.toString();
  return text ? `?${text}` : '';
}

export interface TaskPageOptions {
  cursor?: string | null;
  limit?: number;
}

export interface TaskPerson {
  id: string;
  display_name: string;
  avatar_url: string | null;
}

export interface TaskComment {
  id: string;
  task_id: string;
  author: TaskPerson | null;
  external_author: string | null;
  external_url: string | null;
  body: string;
  created_at: string;
  edited_at: string | null;
}

export interface TaskLink {
  /** Null for entries that only exist in the legacy task_resources list. */
  id: string | null;
  kind: string;
  provider: string;
  url: string;
  external_id: string | null;
  title: string | null;
  state: string | null;
  created_at: string | null;
  created_by: string | null;
  legacy?: true;
}

export interface CreateTaskLinkPayload {
  url: string;
  kind?: 'pull_request' | 'commit' | 'ci_run' | 'issue' | 'doc' | 'url';
  provider?: 'github' | 'web';
  title?: string;
  state?: string;
  external_id?: string;
}

export interface TaskExternalRef {
  provider: string;
  external_url: string;
  external_repo: string | null;
  external_number: number | null;
  external_author: string | null;
  external_state: string | null;
  external_state_reason: string | null;
  external_assignees: string[];
  external_created_at: string | null;
  external_closed_at: string | null;
  external_labels: string[];
}

export interface TaskTimelineEvent {
  id: string;
  type: string;
  at: string;
  actor: TaskPerson | null;
  external_actor: string | null;
  field_name: string | null;
  old_value: unknown;
  new_value: unknown;
  metadata: Record<string, unknown>;
  comment?: TaskComment;
}

export interface GithubImportMapping {
  status_lists: {
    open_list_id?: string | null;
    completed_list_id?: string | null;
    not_planned_list_id?: string | null;
  };
  labels?: Record<string, string>;
  always_labels?: string[];
  assignees?: Record<string, string>;
  authors?: Record<string, string>;
  milestones?: Record<string, string>;
}

export interface GithubImportIssue {
  url: string;
  repo: string;
  number: number;
  title: string;
  body: string | null;
  state: 'open' | 'closed';
  state_reason: string | null;
  author: string | null;
  created_at: string;
  closed_at: string | null;
  labels: string[];
  assignees: string[];
  milestone: string | null;
  comments: Array<{
    url: string;
    author: string | null;
    body: string;
    created_at: string;
  }>;
  linked_prs: Array<{
    url: string;
    number?: number;
    state?: string | null;
    merged?: boolean;
    title?: string | null;
  }>;
  linked_commits: Array<{ url: string; oid?: string }>;
  events?: Array<{
    event:
      | 'closed'
      | 'reopened'
      | 'labeled'
      | 'unlabeled'
      | 'assigned'
      | 'milestoned';
    at: string;
    actor?: string | null;
    label?: string;
    milestone?: string;
    assignee?: string;
  }>;
  parent_url: string | null;
  sub_issue_urls: string[];
}

export interface GithubImportPayload {
  board_id: string;
  dry_run: boolean;
  mapping: GithubImportMapping;
  issues: GithubImportIssue[];
}

export interface GithubImportResult {
  url: string;
  number: number;
  action: 'create' | 'update' | 'skip';
  task_id: string | null;
  warnings: string[];
  error?: string;
}

export function listWorkspaceTaskComments(
  workspaceId: string,
  taskId: string,
  page?: TaskPageOptions,
  options?: InternalApiClientOptions
) {
  return taskApi(options).json<{
    comments: TaskComment[];
    nextCursor: string | null;
  }>(
    `${taskPath(workspaceId, taskId)}/comments${pageQuery(page)}`,
    credentialedRequest
  );
}

export function createWorkspaceTaskComment(
  workspaceId: string,
  taskId: string,
  payload: { body: string },
  options?: InternalApiClientOptions
) {
  return taskApi(options).json<{ comment: TaskComment }>(
    `${taskPath(workspaceId, taskId)}/comments`,
    {
      ...credentialedRequest,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }
  );
}

export function updateWorkspaceTaskComment(
  workspaceId: string,
  taskId: string,
  commentId: string,
  payload: { body: string },
  options?: InternalApiClientOptions
) {
  return taskApi(options).json<{ comment: TaskComment }>(
    `${taskPath(workspaceId, taskId)}/comments/${encodePathSegment(commentId)}`,
    {
      ...credentialedRequest,
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }
  );
}

export function deleteWorkspaceTaskComment(
  workspaceId: string,
  taskId: string,
  commentId: string,
  options?: InternalApiClientOptions
) {
  return taskApi(options).json<{ success: true }>(
    `${taskPath(workspaceId, taskId)}/comments/${encodePathSegment(commentId)}`,
    { ...credentialedRequest, method: 'DELETE' }
  );
}

export function listWorkspaceTaskLinks(
  workspaceId: string,
  taskId: string,
  options?: InternalApiClientOptions
) {
  return taskApi(options).json<{ links: TaskLink[] }>(
    `${taskPath(workspaceId, taskId)}/links`,
    credentialedRequest
  );
}

export function createWorkspaceTaskLink(
  workspaceId: string,
  taskId: string,
  payload: CreateTaskLinkPayload,
  options?: InternalApiClientOptions
) {
  return taskApi(options).json<{ link: TaskLink }>(
    `${taskPath(workspaceId, taskId)}/links`,
    {
      ...credentialedRequest,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }
  );
}

export function deleteWorkspaceTaskLink(
  workspaceId: string,
  taskId: string,
  linkId: string,
  options?: InternalApiClientOptions
) {
  return taskApi(options).json<{ success: true }>(
    `${taskPath(workspaceId, taskId)}/links/${encodePathSegment(linkId)}`,
    { ...credentialedRequest, method: 'DELETE' }
  );
}

export function getWorkspaceTaskExternalRef(
  workspaceId: string,
  taskId: string,
  options?: InternalApiClientOptions
) {
  return taskApi(options).json<{ ref: TaskExternalRef | null }>(
    `${taskPath(workspaceId, taskId)}/external-ref`,
    credentialedRequest
  );
}

export function getWorkspaceTaskTimeline(
  workspaceId: string,
  taskId: string,
  page?: TaskPageOptions,
  options?: InternalApiClientOptions
) {
  return taskApi(options).json<{
    events: TaskTimelineEvent[];
    nextCursor: string | null;
  }>(
    `${taskPath(workspaceId, taskId)}/timeline${pageQuery(page)}`,
    credentialedRequest
  );
}

export function importWorkspaceTasksFromGithub(
  workspaceId: string,
  payload: GithubImportPayload,
  options?: InternalApiClientOptions
) {
  return taskApi(options).json<{ results: GithubImportResult[] }>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/tasks/import/github`,
    {
      ...credentialedRequest,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }
  );
}

/** The collaboration endpoints bound to one set of client options. */
export function createTaskCollaborationApi(options?: InternalApiClientOptions) {
  return {
    listComments: (
      workspaceId: string,
      taskId: string,
      page?: TaskPageOptions
    ) => listWorkspaceTaskComments(workspaceId, taskId, page, options),
    addComment: (workspaceId: string, taskId: string, body: string) =>
      createWorkspaceTaskComment(workspaceId, taskId, { body }, options),
    editComment: (
      workspaceId: string,
      taskId: string,
      commentId: string,
      body: string
    ) =>
      updateWorkspaceTaskComment(
        workspaceId,
        taskId,
        commentId,
        { body },
        options
      ),
    removeComment: (workspaceId: string, taskId: string, commentId: string) =>
      deleteWorkspaceTaskComment(workspaceId, taskId, commentId, options),
    listLinks: (workspaceId: string, taskId: string) =>
      listWorkspaceTaskLinks(workspaceId, taskId, options),
    addLink: (
      workspaceId: string,
      taskId: string,
      payload: CreateTaskLinkPayload
    ) => createWorkspaceTaskLink(workspaceId, taskId, payload, options),
    removeLink: (workspaceId: string, taskId: string, linkId: string) =>
      deleteWorkspaceTaskLink(workspaceId, taskId, linkId, options),
    getExternalRef: (workspaceId: string, taskId: string) =>
      getWorkspaceTaskExternalRef(workspaceId, taskId, options),
    timeline: (workspaceId: string, taskId: string, page?: TaskPageOptions) =>
      getWorkspaceTaskTimeline(workspaceId, taskId, page, options),
    importGithub: (workspaceId: string, payload: GithubImportPayload) =>
      importWorkspaceTasksFromGithub(workspaceId, payload, options),
  };
}
