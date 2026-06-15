import {
  abortWorkspaceTaskDescriptionChunks,
  appendWorkspaceTaskDescriptionChunk,
  beginWorkspaceTaskDescriptionChunks,
  commitWorkspaceTaskDescriptionChunks,
  createWorkspaceTaskProject,
  getWorkspaceTask,
  getWorkspaceTaskDescription,
  updateWorkspaceTaskDescription as updateWorkspaceTaskDescriptionViaApi,
  updateWorkspaceTask as updateWorkspaceTaskViaApi,
  type WorkspaceTaskDescriptionChunkField,
  type WorkspaceTaskDescriptionChunkFields,
  type WorkspaceTaskDescriptionResponse,
  type WorkspaceTaskDescriptionUpdatePayload,
  type WorkspaceTaskUpdatePayload,
} from '@tuturuuu/internal-api/tasks';
import type { WorkspaceTaskLabel } from '../types';

const TASK_DESCRIPTION_DIRECT_BODY_LIMIT_BYTES = 192 * 1024;
const TASK_DESCRIPTION_CHUNK_TEXT_LENGTH = 96 * 1024;
const TASK_DESCRIPTION_TOO_LARGE_MESSAGE =
  'Description content is too large. Please shorten it or split it into smaller documents.';
const textEncoder = new TextEncoder();

async function getErrorMessage(
  response: Response,
  fallback: string,
  options?: {
    requestPath?: string;
    isDescriptionRequest?: boolean;
  }
) {
  const isDescriptionRequest =
    options?.isDescriptionRequest ??
    Boolean(options?.requestPath?.includes('/description'));

  if (response.status === 413 && isDescriptionRequest) {
    return 'Description content is too large. Please shorten it or split it into smaller documents.';
  }

  const payload = await response.json().catch(() => null);
  return typeof payload?.error === 'string' ? payload.error : fallback;
}

export async function updateWorkspaceTask(
  wsId: string,
  taskId: string,
  payload: WorkspaceTaskUpdatePayload
) {
  return updateWorkspaceTaskViaApi(wsId, taskId, payload);
}

export async function fetchWorkspaceTask(wsId: string, taskId: string) {
  return getWorkspaceTask(wsId, taskId);
}

export async function fetchWorkspaceTaskDescription(
  wsId: string,
  taskId: string
) {
  return getWorkspaceTaskDescription(wsId, taskId);
}

export async function updateWorkspaceTaskDescription(
  wsId: string,
  taskId: string,
  payload: WorkspaceTaskDescriptionUpdatePayload
) {
  if (shouldChunkTaskDescriptionPayload(payload)) {
    return updateWorkspaceTaskDescriptionChunked(wsId, taskId, payload);
  }

  try {
    return await updateWorkspaceTaskDescriptionViaApi(wsId, taskId, payload);
  } catch (error) {
    if (isPayloadTooLargeError(error)) {
      return updateWorkspaceTaskDescriptionChunked(wsId, taskId, payload);
    }

    throw normalizeTaskDescriptionError(
      error,
      'Failed to update task description'
    );
  }
}

export function shouldChunkTaskDescriptionPayload(
  payload: WorkspaceTaskDescriptionUpdatePayload
) {
  return getJsonByteLength(payload) > TASK_DESCRIPTION_DIRECT_BODY_LIMIT_BYTES;
}

export async function updateWorkspaceTaskDescriptionChunked(
  wsId: string,
  taskId: string,
  payload: WorkspaceTaskDescriptionUpdatePayload
): Promise<WorkspaceTaskDescriptionResponse> {
  const chunksByField = buildTaskDescriptionChunks(payload);
  const fields = buildTaskDescriptionChunkFields(chunksByField);

  if (Object.keys(fields).length === 0) {
    return updateWorkspaceTaskDescriptionViaApi(wsId, taskId, payload);
  }

  const { session_id: sessionId } = await beginWorkspaceTaskDescriptionChunks(
    wsId,
    taskId,
    fields
  );

  try {
    for (const field of ['description', 'description_yjs_state'] as const) {
      const chunks = chunksByField[field];
      if (!chunks) continue;

      for (let index = 0; index < chunks.length; index += 1) {
        await appendWorkspaceTaskDescriptionChunk(wsId, taskId, {
          chunk: chunks[index] ?? '',
          chunk_index: index,
          field,
          session_id: sessionId,
        });
      }
    }

    return await commitWorkspaceTaskDescriptionChunks(wsId, taskId, sessionId);
  } catch (error) {
    await abortWorkspaceTaskDescriptionChunks(wsId, taskId, sessionId).catch(
      () => undefined
    );

    throw normalizeTaskDescriptionError(
      error,
      'Failed to update task description'
    );
  }
}

function getJsonByteLength(value: unknown) {
  return textEncoder.encode(JSON.stringify(value)).byteLength;
}

function isPayloadTooLargeError(error: unknown) {
  return (
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    (error as { status?: unknown }).status === 413
  );
}

function normalizeTaskDescriptionError(error: unknown, fallback: string) {
  if (isPayloadTooLargeError(error)) {
    return new Error(TASK_DESCRIPTION_TOO_LARGE_MESSAGE);
  }

  return error instanceof Error ? error : new Error(fallback);
}

function splitStringIntoChunks(value: string) {
  const chunks: string[] = [];

  for (
    let index = 0;
    index < value.length;
    index += TASK_DESCRIPTION_CHUNK_TEXT_LENGTH
  ) {
    chunks.push(value.slice(index, index + TASK_DESCRIPTION_CHUNK_TEXT_LENGTH));
  }

  return chunks.length > 0 ? chunks : [''];
}

function bytesToBase64(bytes: number[]) {
  const byteArray = Uint8Array.from(bytes);

  if (typeof btoa === 'function') {
    let binary = '';
    const step = 0x8000;

    for (let index = 0; index < byteArray.length; index += step) {
      binary += String.fromCharCode(...byteArray.subarray(index, index + step));
    }

    return btoa(binary);
  }

  const nodeBuffer = (
    globalThis as typeof globalThis & {
      Buffer?: {
        from: (value: Uint8Array) => {
          toString: (encoding: 'base64') => string;
        };
      };
    }
  ).Buffer;

  if (!nodeBuffer) {
    throw new Error('Unable to encode task description state.');
  }

  return nodeBuffer.from(byteArray).toString('base64');
}

function buildTaskDescriptionChunks(
  payload: WorkspaceTaskDescriptionUpdatePayload
): Partial<Record<WorkspaceTaskDescriptionChunkField, string[] | null>> {
  const chunks: Partial<
    Record<WorkspaceTaskDescriptionChunkField, string[] | null>
  > = {};

  if ('description' in payload) {
    chunks.description =
      payload.description === null
        ? null
        : splitStringIntoChunks(payload.description ?? '');
  }

  if ('description_yjs_state' in payload) {
    chunks.description_yjs_state =
      payload.description_yjs_state === null
        ? null
        : splitStringIntoChunks(
            bytesToBase64(payload.description_yjs_state ?? [])
          );
  }

  return chunks;
}

function buildTaskDescriptionChunkFields(
  chunksByField: Partial<
    Record<WorkspaceTaskDescriptionChunkField, string[] | null>
  >
) {
  const fields: WorkspaceTaskDescriptionChunkFields = {};

  for (const field of ['description', 'description_yjs_state'] as const) {
    const chunks = chunksByField[field];
    if (chunks === undefined) continue;

    if (chunks === null) {
      fields[field] = {
        chunk_count: 0,
        is_null: true,
        total_length: 0,
      };
      continue;
    }

    fields[field] = {
      chunk_count: chunks.length,
      total_length: chunks.join('').length,
    };
  }

  return fields;
}

export async function createWorkspaceLabel(
  wsId: string,
  payload: { name: string; color: string }
) {
  const response = await fetch(`/api/v1/workspaces/${wsId}/labels`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(await getErrorMessage(response, 'Failed to create label'));
  }

  return (await response.json()) as WorkspaceTaskLabel;
}

export async function createWorkspaceProject(
  wsId: string,
  payload: { name: string; description?: string }
) {
  try {
    return await createWorkspaceTaskProject(wsId, payload);
  } catch (error) {
    throw new Error(
      error instanceof Error ? error.message : 'Failed to create project'
    );
  }
}
