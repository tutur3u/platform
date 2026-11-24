import {
  encodePathSegment,
  getInternalApiClient,
  withTaskApiBaseUrl,
} from '@tuturuuu/internal-api/client';
import type {
  TaskComment,
  TaskExternalRef,
  TaskLink,
  TaskTimelineEvent,
} from './types';

/**
 * Fetch wrappers for the task comments, links, external-ref and timeline
 * routes. Kept in one module so the internal-api client methods can replace
 * them without touching the hooks or components.
 */

const credentialed = { cache: 'no-store', credentials: 'include' } as const;
const jsonHeaders = { 'Content-Type': 'application/json' };

function client() {
  return getInternalApiClient(withTaskApiBaseUrl());
}

function taskPath(wsId: string, taskId: string, suffix: string) {
  return `/api/v1/workspaces/${encodePathSegment(wsId)}/tasks/${encodePathSegment(taskId)}/${suffix}`;
}

export async function listTaskComments(
  wsId: string,
  taskId: string,
  options?: { cursor?: string; limit?: number }
) {
  return client().json<{
    comments: TaskComment[];
    nextCursor: string | null;
  }>(taskPath(wsId, taskId, 'comments'), {
    query: { cursor: options?.cursor, limit: options?.limit },
    ...credentialed,
  });
}

export async function createTaskComment(
  wsId: string,
  taskId: string,
  body: string
) {
  return client().json<{ comment: TaskComment }>(
    taskPath(wsId, taskId, 'comments'),
    {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ body }),
      ...credentialed,
    }
  );
}

export async function updateTaskComment(
  wsId: string,
  taskId: string,
  commentId: string,
  body: string
) {
  return client().json<{ comment: TaskComment }>(
    taskPath(wsId, taskId, `comments/${encodePathSegment(commentId)}`),
    {
      method: 'PATCH',
      headers: jsonHeaders,
      body: JSON.stringify({ body }),
      ...credentialed,
    }
  );
}

export async function deleteTaskComment(
  wsId: string,
  taskId: string,
  commentId: string
) {
  return client().json<unknown>(
    taskPath(wsId, taskId, `comments/${encodePathSegment(commentId)}`),
    { method: 'DELETE', ...credentialed }
  );
}

export async function listTaskLinks(wsId: string, taskId: string) {
  return client().json<{ links: TaskLink[] }>(
    taskPath(wsId, taskId, 'links'),
    credentialed
  );
}

export async function createTaskLink(
  wsId: string,
  taskId: string,
  url: string
) {
  return client().json<{ link: TaskLink }>(taskPath(wsId, taskId, 'links'), {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify({ url }),
    ...credentialed,
  });
}

export async function deleteTaskLink(
  wsId: string,
  taskId: string,
  linkId: string
) {
  return client().json<unknown>(
    taskPath(wsId, taskId, `links/${encodePathSegment(linkId)}`),
    { method: 'DELETE', ...credentialed }
  );
}

export async function getTaskExternalRef(wsId: string, taskId: string) {
  return client().json<{ ref: TaskExternalRef | null }>(
    taskPath(wsId, taskId, 'external-ref'),
    credentialed
  );
}

export async function listTaskTimeline(
  wsId: string,
  taskId: string,
  options?: { cursor?: string; limit?: number }
) {
  return client().json<{
    events: TaskTimelineEvent[];
    nextCursor: string | null;
  }>(taskPath(wsId, taskId, 'timeline'), {
    query: { cursor: options?.cursor, limit: options?.limit },
    ...credentialed,
  });
}
