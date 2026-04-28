import type { WorkspaceCourseModule } from '@tuturuuu/types';
import type { WorkspaceCourseBuilderModule } from '@tuturuuu/types/db';
import {
  encodePathSegment,
  getInternalApiClient,
  type InternalApiClientOptions,
} from './client';

export interface UpsertWorkspaceCoursePayload {
  id?: string;
  name: string;
  description?: string;
  cert_template?: string;
}

export interface UpsertWorkspaceCourseModulePayload {
  id?: string;
  name: string;
  module_group_id: string;
  content?: unknown;
  extra_content?: unknown;
  is_public?: boolean;
  is_published?: boolean;
  youtube_links?: string[];
}

export async function listWorkspaceCourseModules(
  workspaceId: string,
  groupId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<WorkspaceCourseModule[]>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/user-groups/${encodePathSegment(groupId)}/modules`,
    { cache: 'no-store' }
  );
}

export async function listWorkspaceCourseModuleGroupModules(
  workspaceId: string,
  groupId: string,
  moduleGroupId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<WorkspaceCourseBuilderModule[]>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/user-groups/${encodePathSegment(groupId)}/module-groups/${encodePathSegment(moduleGroupId)}/modules`,
    { cache: 'no-store' }
  );
}

export interface UpsertWorkspaceCourseModuleGroupPayload {
  id?: string;
  title: string;
  icon?: string;
  color?: string;
}

export interface UpsertWorkspaceQuizPayload {
  id?: string;
  question: string;
  quiz_options: Array<{
    id?: string;
    value: string;
    is_correct: boolean;
    explanation?: string | null;
  }>;
}

export interface CreateWorkspaceQuizPayload {
  moduleId?: string;
  quizzes: UpsertWorkspaceQuizPayload[];
  setId?: string;
}

export interface UpsertWorkspaceQuizSetPayload {
  id?: string;
  moduleId?: string;
  name: string;
}

export interface UpsertWorkspaceFlashcardPayload {
  id?: string;
  moduleId?: string;
  front: string;
  back: string;
}

export interface WorkspaceEducationAttemptListQuery {
  dateFrom?: string;
  dateTo?: string;
  learnerId?: string;
  page?: number;
  pageSize?: number;
  setId?: string;
  sortBy?: 'duration' | 'newest' | 'score';
  sortDirection?: 'asc' | 'desc';
  status?: 'all' | 'completed' | 'incomplete';
}

export async function createWorkspaceCourse(
  workspaceId: string,
  payload: UpsertWorkspaceCoursePayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ message: string }>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/courses`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      cache: 'no-store',
    }
  );
}

export async function updateWorkspaceCourse(
  workspaceId: string,
  courseId: string,
  payload: Partial<UpsertWorkspaceCoursePayload>,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ message: string }>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/courses/${encodePathSegment(courseId)}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      cache: 'no-store',
    }
  );
}

export async function deleteWorkspaceCourse(
  workspaceId: string,
  courseId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ message: string }>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/courses/${encodePathSegment(courseId)}`,
    {
      method: 'DELETE',
      cache: 'no-store',
    }
  );
}

export async function createWorkspaceCourseModule(
  workspaceId: string,
  groupId: string,
  payload: UpsertWorkspaceCourseModulePayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<WorkspaceCourseModule>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/user-groups/${encodePathSegment(groupId)}/modules`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      cache: 'no-store',
    }
  );
}

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

/**
 * @deprecated Prefer {@link reorderWorkspaceCourseModulesInModuleGroup} for
 * per-group reorder, or {@link reorderWorkspaceCourseModuleGroups} for group-level
 * reorder. This legacy wrapper calls the upgraded `reorder_workspace_course_modules`
 * RPC which preserves sort_key within each module_group.
 */
export async function reorderWorkspaceCourseModules(
  workspaceId: string,
  groupId: string,
  moduleIds: string[],
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ message: string }>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/user-groups/${encodePathSegment(groupId)}/module-order`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ moduleIds }),
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

export async function listWorkspaceCourseModuleGroups(
  workspaceId: string,
  groupId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<
    Array<{
      id: string;
      group_id: string;
      title: string;
      icon: string | null;
      color: string | null;
      sort_key: number;
      created_at: string;
    }>
  >(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/user-groups/${encodePathSegment(groupId)}/module-groups`,
    { cache: 'no-store' }
  );
}

export async function createWorkspaceCourseModuleGroup(
  workspaceId: string,
  groupId: string,
  payload: UpsertWorkspaceCourseModuleGroupPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{
    id: string;
    group_id: string;
    title: string;
    icon: string | null;
    color: string | null;
    sort_key: number;
    created_at: string;
  }>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/user-groups/${encodePathSegment(groupId)}/module-groups`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      cache: 'no-store',
    }
  );
}

export async function updateWorkspaceCourseModuleGroup(
  workspaceId: string,
  groupId: string,
  moduleGroupId: string,
  payload: Partial<UpsertWorkspaceCourseModuleGroupPayload>,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ message: string }>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/user-groups/${encodePathSegment(groupId)}/module-groups/${encodePathSegment(moduleGroupId)}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      cache: 'no-store',
    }
  );
}

export async function deleteWorkspaceCourseModuleGroup(
  workspaceId: string,
  groupId: string,
  moduleGroupId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ message: string }>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/user-groups/${encodePathSegment(groupId)}/module-groups/${encodePathSegment(moduleGroupId)}`,
    {
      method: 'DELETE',
      cache: 'no-store',
    }
  );
}

export async function reorderWorkspaceCourseModuleGroups(
  workspaceId: string,
  groupId: string,
  moduleGroupIds: string[],
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ message: string }>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/user-groups/${encodePathSegment(groupId)}/module-groups/order`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ moduleGroupIds }),
      cache: 'no-store',
    }
  );
}

export async function reorderWorkspaceCourseModulesInModuleGroup(
  workspaceId: string,
  groupId: string,
  moduleGroupId: string,
  moduleIds: string[],
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ message: string }>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/user-groups/${encodePathSegment(groupId)}/module-groups/${encodePathSegment(moduleGroupId)}/module-order`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ moduleIds }),
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

export async function createWorkspaceQuiz(
  workspaceId: string,
  payload: CreateWorkspaceQuizPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ message: string }>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/quizzes`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      cache: 'no-store',
    }
  );
}

export async function updateWorkspaceQuiz(
  workspaceId: string,
  quizId: string,
  payload: Partial<UpsertWorkspaceQuizPayload>,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ message: string }>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/quizzes/${encodePathSegment(quizId)}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
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

export async function createWorkspaceQuizSet(
  workspaceId: string,
  payload: UpsertWorkspaceQuizSetPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ message: string }>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/quiz-sets`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      cache: 'no-store',
    }
  );
}

export async function updateWorkspaceQuizSet(
  workspaceId: string,
  setId: string,
  payload: Partial<UpsertWorkspaceQuizSetPayload>,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ message: string }>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/quiz-sets/${encodePathSegment(setId)}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      cache: 'no-store',
    }
  );
}

export async function deleteWorkspaceQuizSet(
  workspaceId: string,
  setId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ message: string }>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/quiz-sets/${encodePathSegment(setId)}`,
    {
      method: 'DELETE',
      cache: 'no-store',
    }
  );
}

export async function createWorkspaceFlashcard(
  workspaceId: string,
  payload: UpsertWorkspaceFlashcardPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ message: string }>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/flashcards`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      cache: 'no-store',
    }
  );
}

export async function updateWorkspaceFlashcard(
  workspaceId: string,
  flashcardId: string,
  payload: Partial<UpsertWorkspaceFlashcardPayload>,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ message: string }>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/flashcards/${encodePathSegment(flashcardId)}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
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

export async function listWorkspaceEducationAttempts(
  workspaceId: string,
  query: WorkspaceEducationAttemptListQuery = {},
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  const search = new URLSearchParams();

  if (query.page) search.set('page', `${query.page}`);
  if (query.pageSize) search.set('pageSize', `${query.pageSize}`);
  if (query.setId) search.set('setId', query.setId);
  if (query.learnerId) search.set('learnerId', query.learnerId);
  if (query.status) search.set('status', query.status);
  if (query.dateFrom) search.set('dateFrom', query.dateFrom);
  if (query.dateTo) search.set('dateTo', query.dateTo);
  if (query.sortBy) search.set('sortBy', query.sortBy);
  if (query.sortDirection) search.set('sortDirection', query.sortDirection);

  const suffix = search.size > 0 ? `?${search.toString()}` : '';
  return client.json<{
    attempts: Array<Record<string, unknown>>;
    count: number;
    page: number;
    pageSize: number;
  }>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/education/attempts${suffix}`,
    { cache: 'no-store' }
  );
}

export async function getWorkspaceEducationAttemptDetail(
  workspaceId: string,
  attemptId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{
    attempt: Record<string, unknown>;
    learner: Record<string, unknown> | null;
    answers: Array<Record<string, unknown>>;
  }>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/education/attempts/${encodePathSegment(attemptId)}`,
    {
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
