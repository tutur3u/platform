import {
  encodePathSegment,
  getInternalApiClient,
  type InternalApiClientOptions,
} from './client';

export async function updateWorkspaceCourseModule(
  workspaceId: string,
  moduleId: string,
  payload: Record<string, unknown>,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ message: string }>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/course-modules/${encodePathSegment(moduleId)}`,
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      cache: 'no-store',
    }
  );
}

export async function deleteWorkspaceCourseModule(
  workspaceId: string,
  moduleId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ message: string }>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/course-modules/${encodePathSegment(moduleId)}`,
    {
      method: 'DELETE',
      cache: 'no-store',
    }
  );
}

export async function linkQuizSetModules(
  workspaceId: string,
  setId: string,
  moduleIds: string[],
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ message: string }>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/quiz-sets/${encodePathSegment(setId)}/modules`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ moduleIds }),
      cache: 'no-store',
    }
  );
}

export async function unlinkQuizSetModule(
  workspaceId: string,
  setId: string,
  moduleId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ message: string }>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/quiz-sets/${encodePathSegment(setId)}/modules/${encodePathSegment(moduleId)}`,
    {
      method: 'DELETE',
      cache: 'no-store',
    }
  );
}

export async function deleteWorkspaceQuiz(
  workspaceId: string,
  quizId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ message: string }>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/quizzes/${encodePathSegment(quizId)}`,
    {
      method: 'DELETE',
      cache: 'no-store',
    }
  );
}

export async function deleteWorkspaceFlashcard(
  workspaceId: string,
  flashcardId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ message: string }>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/flashcards/${encodePathSegment(flashcardId)}`,
    {
      method: 'DELETE',
      cache: 'no-store',
    }
  );
}

export async function deleteWorkspaceStorageObject(
  workspaceId: string,
  path: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ success: true }>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/storage/object`,
    {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ path }),
      cache: 'no-store',
    }
  );
}
