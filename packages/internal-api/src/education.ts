import type { Json, WorkspaceCourseModule } from '@tuturuuu/types';
import type {
  WorkspaceCourseBuilderModule,
  WorkspaceCourseModuleGroup,
} from '@tuturuuu/types/db';
import {
  encodePathSegment,
  getInternalApiClient,
  type InternalApiClientOptions,
  withTeachApiBaseUrl,
} from './client';

export interface UpsertWorkspaceCoursePayload {
  id?: string;
  name: string;
  archived?: boolean;
  description?: string;
  cert_template?: string;
  ending_date?: string | null;
  is_course_published?: boolean;
  starting_date?: string | null;
}

export interface WorkspaceCourseListItem {
  archived: boolean;
  cert_template: string | null;
  created_at: string | null;
  description: string | null;
  ending_date: string | null;
  id: string;
  is_course_published: boolean;
  members_count: number;
  modules_count: number;
  name: string;
  starting_date: string | null;
}

export interface ListWorkspaceCoursesParams {
  page?: number;
  pageSize?: number;
  q?: string;
  status?: 'active' | 'all' | 'archived';
}

export interface ListWorkspaceCoursesResponse {
  count: number;
  data: WorkspaceCourseListItem[];
  page: number;
  pageSize: number;
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
  const client = getInternalApiClient(withTeachApiBaseUrl(options));
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
  const client = getInternalApiClient(withTeachApiBaseUrl(options));
  return client.json<WorkspaceCourseBuilderModule[]>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/user-groups/${encodePathSegment(groupId)}/module-groups/${encodePathSegment(moduleGroupId)}/modules`,
    { cache: 'no-store' }
  );
}

export interface UpsertWorkspaceCourseModuleGroupPayload {
  id?: string;
  title: string;
  icon?: string | null;
  color?: string;
}

export interface UpsertWorkspaceQuizPayload {
  id?: string;
  question: string;
  quiz_options?: Array<{
    id?: string;
    value: string;
    is_correct: boolean;
    explanation?: string | null;
  }>;
  type?: string;
  content?: Json;
  answer?: Json;
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

export interface WorkspaceEducationAttemptSummary {
  attempt_number: number | null;
  completed_at: string | null;
  duration_seconds: number | null;
  id: string;
  learner_email: string | null;
  learner_name: string | null;
  set_id: string;
  set_name: string | null;
  started_at: string | null;
  submitted_at: string | null;
  total_score: number | null;
  user_id: string;
}

export interface WorkspaceEducationAttemptFilterState {
  dateFrom: string | null;
  dateTo: string | null;
  learnerId: string | null;
  setId: string | null;
  sortBy: 'duration' | 'newest' | 'score';
  sortDirection: 'asc' | 'desc';
  status: 'all' | 'completed' | 'incomplete';
}

export interface ListWorkspaceEducationAttemptsResponse {
  attempts: WorkspaceEducationAttemptSummary[];
  count: number;
  filters: {
    learners: Array<{
      email: string | null;
      full_name: string | null;
      user_id: string;
    }>;
    selected: WorkspaceEducationAttemptFilterState;
    sets: Array<{
      id: string;
      name: string;
    }>;
  };
  includedSetIds: string[];
  page: number;
  pageSize: number;
}

export interface WorkspaceEducationAttemptDetail {
  attempt_number: number | null;
  completed_at: string | null;
  duration_seconds: number | null;
  id: string;
  set_id: string;
  set_name: string | null;
  started_at: string | null;
  submitted_at: string | null;
  total_score: number | null;
  user_id: string;
}

export interface WorkspaceEducationAttemptLearner {
  email: string | null;
  full_name: string | null;
  user_id: string;
}

export interface WorkspaceEducationAttemptAnswerOption {
  explanation: string | null;
  id: string;
  is_correct: boolean;
  value: string;
}

export interface WorkspaceEducationAttemptAnswer {
  id: string;
  is_correct: boolean | null;
  options: WorkspaceEducationAttemptAnswerOption[];
  question: string | null;
  quiz_id: string;
  score_awarded: number | null;
  selected_option_id: string | null;
  selected_option_is_correct: boolean | null;
  selected_option_value: string | null;
}

export interface WorkspaceEducationAttemptDetailResponse {
  answers: WorkspaceEducationAttemptAnswer[];
  attempt: WorkspaceEducationAttemptDetail;
  learner: WorkspaceEducationAttemptLearner | null;
}

export async function createWorkspaceCourse(
  workspaceId: string,
  payload: UpsertWorkspaceCoursePayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(withTeachApiBaseUrl(options));
  return client.json<{ id: string; message: string }>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/courses`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      cache: 'no-store',
    }
  );
}

export async function listWorkspaceCourses(
  workspaceId: string,
  params: ListWorkspaceCoursesParams = {},
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(withTeachApiBaseUrl(options));
  return client.json<ListWorkspaceCoursesResponse>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/courses`,
    {
      cache: 'no-store',
      query: {
        page: params.page,
        pageSize: params.pageSize,
        q: params.q,
        status: params.status,
      },
    }
  );
}

export interface GenerateQuizOptionExplanationPayload {
  question: string;
  option: unknown;
}

export interface GenerateQuizOptionExplanationResponse {
  explanation?: string;
}

/**
 * Generate an AI explanation for a single quiz option via
 * `POST /api/ai/objects/quizzes/explanation` (note: not under `/api/v1`; the
 * workspace id travels in the body as `wsId`). Forwards the caller's auth.
 */
export async function generateWorkspaceQuizOptionExplanation(
  workspaceId: string,
  payload: GenerateQuizOptionExplanationPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(withTeachApiBaseUrl(options));
  return client.json<GenerateQuizOptionExplanationResponse>(
    '/api/ai/objects/quizzes/explanation',
    {
      body: JSON.stringify({ wsId: workspaceId, ...payload }),
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'POST',
    }
  );
}

export async function updateWorkspaceCourse(
  workspaceId: string,
  courseId: string,
  payload: Partial<UpsertWorkspaceCoursePayload>,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(withTeachApiBaseUrl(options));
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

export function archiveWorkspaceCourse(
  workspaceId: string,
  courseId: string,
  options?: InternalApiClientOptions
) {
  return updateWorkspaceCourse(
    workspaceId,
    courseId,
    { archived: true, is_course_published: false },
    options
  );
}

export function publishWorkspaceCourse(
  workspaceId: string,
  courseId: string,
  isPublished: boolean,
  options?: InternalApiClientOptions
) {
  return updateWorkspaceCourse(
    workspaceId,
    courseId,
    { is_course_published: isPublished },
    options
  );
}

export async function deleteWorkspaceCourse(
  workspaceId: string,
  courseId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(withTeachApiBaseUrl(options));
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
  const client = getInternalApiClient(withTeachApiBaseUrl(options));
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
  const client = getInternalApiClient(withTeachApiBaseUrl(options));
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
  const client = getInternalApiClient(withTeachApiBaseUrl(options));
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
  const client = getInternalApiClient(withTeachApiBaseUrl(options));
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
  const client = getInternalApiClient(withTeachApiBaseUrl(options));
  return client.json<WorkspaceCourseModuleGroup[]>(
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
  const client = getInternalApiClient(withTeachApiBaseUrl(options));
  return client.json<WorkspaceCourseModuleGroup>(
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
  const client = getInternalApiClient(withTeachApiBaseUrl(options));
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
  const client = getInternalApiClient(withTeachApiBaseUrl(options));
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
  const client = getInternalApiClient(withTeachApiBaseUrl(options));
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
  const client = getInternalApiClient(withTeachApiBaseUrl(options));
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
  const client = getInternalApiClient(withTeachApiBaseUrl(options));
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
  const client = getInternalApiClient(withTeachApiBaseUrl(options));
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
  const client = getInternalApiClient(withTeachApiBaseUrl(options));
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
  const client = getInternalApiClient(withTeachApiBaseUrl(options));
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
  const client = getInternalApiClient(withTeachApiBaseUrl(options));
  return client.json<{ message: string }>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/quizzes/${encodePathSegment(quizId)}`,
    {
      method: 'DELETE',
      cache: 'no-store',
    }
  );
}

export interface ListWorkspaceQuizzesParams {
  page?: number;
  pageSize?: number;
  q?: string;
  moduleId?: string;
}

export interface ListWorkspaceQuizzesResponse {
  data: Array<{
    id: string;
    question: string;
    type?: string;
    content?: Json;
    answer?: Json;
    created_at?: string;
    quiz_options?: Array<{
      id: string;
      value: string;
      is_correct: boolean;
      explanation?: string | null;
    }>;
  }>;
  count: number;
  page: number;
  pageSize: number;
}

export async function getWorkspaceQuizzes(
  workspaceId: string,
  params?: ListWorkspaceQuizzesParams,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(withTeachApiBaseUrl(options));
  const searchParams = new URLSearchParams();
  if (params?.page) searchParams.set('page', params.page.toString());
  if (params?.pageSize)
    searchParams.set('pageSize', params.pageSize.toString());
  if (params?.q) searchParams.set('q', params.q);
  if (params?.moduleId) searchParams.set('moduleId', params.moduleId);

  const query = searchParams.toString();
  return client.json<ListWorkspaceQuizzesResponse>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/quizzes${
      query ? `?${query}` : ''
    }`,
    {
      method: 'GET',
      cache: 'no-store',
    }
  );
}

export interface ListWorkspaceFlashcardsParams {
  page?: number;
  pageSize?: number;
  q?: string;
}

export interface ListWorkspaceFlashcardsResponse {
  data: Array<{
    id: string;
    front: string;
    back: string;
    created_at?: string;
  }>;
  count: number;
  page: number;
  pageSize: number;
}

/**
 * Paginated read of a workspace's flashcard library via
 * `GET /api/v1/workspaces/:wsId/flashcards`. Forwards the caller's auth.
 */
export async function getWorkspaceFlashcards(
  workspaceId: string,
  params?: ListWorkspaceFlashcardsParams,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(withTeachApiBaseUrl(options));
  const searchParams = new URLSearchParams();
  if (params?.page) searchParams.set('page', params.page.toString());
  if (params?.pageSize)
    searchParams.set('pageSize', params.pageSize.toString());
  if (params?.q) searchParams.set('q', params.q);

  const query = searchParams.toString();
  return client.json<ListWorkspaceFlashcardsResponse>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/flashcards${
      query ? `?${query}` : ''
    }`,
    {
      method: 'GET',
      cache: 'no-store',
    }
  );
}

export interface ListAllWorkspaceCourseModulesParams {
  page?: number;
  pageSize?: number;
  q?: string;
}

export interface ListAllWorkspaceCourseModulesResponse {
  data: Array<{
    id: string;
    name?: string | null;
    is_public?: boolean | null;
    is_published?: boolean | null;
  }>;
  count: number;
  page: number;
  pageSize: number;
}

/**
 * Paginated read of EVERY course module in a workspace (across all course
 * groups) via `GET /api/v1/workspaces/:wsId/course-modules`.
 */
export async function listAllWorkspaceCourseModules(
  workspaceId: string,
  params?: ListAllWorkspaceCourseModulesParams,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(withTeachApiBaseUrl(options));
  const searchParams = new URLSearchParams();
  if (params?.page) searchParams.set('page', params.page.toString());
  if (params?.pageSize)
    searchParams.set('pageSize', params.pageSize.toString());
  if (params?.q) searchParams.set('q', params.q);

  const query = searchParams.toString();
  return client.json<ListAllWorkspaceCourseModulesResponse>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/course-modules${
      query ? `?${query}` : ''
    }`,
    {
      method: 'GET',
      cache: 'no-store',
    }
  );
}

export interface ListQuizSetLinkedModulesParams {
  page?: number;
  pageSize?: number;
  q?: string;
}

export interface ListQuizSetLinkedModulesResponse {
  data: Array<{
    id: string;
    group_id?: string | null;
    name?: string | null;
    is_public?: boolean | null;
    is_published?: boolean | null;
  }>;
  count: number;
  page: number;
  pageSize: number;
}

/**
 * Paginated read of the course modules linked to a quiz set via
 * `GET /api/v1/workspaces/:wsId/quiz-sets/:setId/linked-modules`.
 */
export async function getQuizSetLinkedModules(
  workspaceId: string,
  setId: string,
  params?: ListQuizSetLinkedModulesParams,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(withTeachApiBaseUrl(options));
  const searchParams = new URLSearchParams();
  if (params?.page) searchParams.set('page', params.page.toString());
  if (params?.pageSize)
    searchParams.set('pageSize', params.pageSize.toString());
  if (params?.q) searchParams.set('q', params.q);

  const query = searchParams.toString();
  return client.json<ListQuizSetLinkedModulesResponse>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/quiz-sets/${encodePathSegment(setId)}/linked-modules${
      query ? `?${query}` : ''
    }`,
    {
      method: 'GET',
      cache: 'no-store',
    }
  );
}

export interface ListQuizSetQuizzesParams {
  page?: number;
  pageSize?: number;
  q?: string;
}

/**
 * Paginated read of the quizzes (with options) that belong to a quiz set via
 * `GET /api/v1/workspaces/:wsId/quiz-sets/:setId/quizzes`.
 */
export async function getQuizSetQuizzes(
  workspaceId: string,
  setId: string,
  params?: ListQuizSetQuizzesParams,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(withTeachApiBaseUrl(options));
  const searchParams = new URLSearchParams();
  if (params?.page) searchParams.set('page', params.page.toString());
  if (params?.pageSize)
    searchParams.set('pageSize', params.pageSize.toString());
  if (params?.q) searchParams.set('q', params.q);

  const query = searchParams.toString();
  return client.json<ListWorkspaceQuizzesResponse>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/quiz-sets/${encodePathSegment(setId)}/quizzes${
      query ? `?${query}` : ''
    }`,
    {
      method: 'GET',
      cache: 'no-store',
    }
  );
}

export interface ListCourseModuleQuizSetsParams {
  page?: number;
  pageSize?: number;
  q?: string;
}

export interface ListCourseModuleQuizSetsResponse {
  data: Array<{
    id: string;
    name: string;
    created_at?: string;
  }>;
  count: number;
  page: number;
  pageSize: number;
}

/**
 * Paginated read of the quiz sets linked to a single course module via
 * `GET /api/v1/workspaces/:wsId/course-modules/:moduleId/quiz-sets`.
 */
export async function getCourseModuleQuizSets(
  workspaceId: string,
  moduleId: string,
  params?: ListCourseModuleQuizSetsParams,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(withTeachApiBaseUrl(options));
  const searchParams = new URLSearchParams();
  if (params?.page) searchParams.set('page', params.page.toString());
  if (params?.pageSize)
    searchParams.set('pageSize', params.pageSize.toString());
  if (params?.q) searchParams.set('q', params.q);

  const query = searchParams.toString();
  return client.json<ListCourseModuleQuizSetsResponse>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/course-modules/${encodePathSegment(moduleId)}/quiz-sets${
      query ? `?${query}` : ''
    }`,
    {
      method: 'GET',
      cache: 'no-store',
    }
  );
}

export interface ListWorkspaceQuizSetsParams {
  page?: number;
  pageSize?: number;
  q?: string;
}

const LINKED_MODULES_PAGE_SIZE = 100;
const COURSE_LOOKUP_PAGE_SIZE = 100;

export interface WorkspaceQuizSetLinkedModule {
  course_id: string;
  course_name: string;
  module_id: string;
  module_name: string;
}

export interface WorkspaceQuizSetListItem {
  id: string;
  name: string;
  created_at?: string;
  course_module_quiz_sets?: Array<{ module_id: string }>;
  linked_modules?: WorkspaceQuizSetLinkedModule[];
  linked_modules_count?: number;
}

export interface ListWorkspaceQuizSetsResponse {
  data: WorkspaceQuizSetListItem[];
  count: number;
  page: number;
  pageSize: number;
}

async function listAllQuizSetLinkedModules(
  workspaceId: string,
  setId: string,
  options?: InternalApiClientOptions
) {
  const modules: ListQuizSetLinkedModulesResponse['data'] = [];
  let page = 1;
  let count = 0;

  do {
    const result = await getQuizSetLinkedModules(
      workspaceId,
      setId,
      { page, pageSize: LINKED_MODULES_PAGE_SIZE },
      options
    );

    modules.push(...result.data);
    count = result.count;
    page += 1;

    if (result.data.length === 0) break;
  } while (modules.length < count);

  return modules;
}

async function listAllWorkspaceCoursesForLookup(
  workspaceId: string,
  options?: InternalApiClientOptions
) {
  const courses: WorkspaceCourseListItem[] = [];
  let page = 1;
  let count = 0;

  do {
    const result = await listWorkspaceCourses(
      workspaceId,
      { page, pageSize: COURSE_LOOKUP_PAGE_SIZE, status: 'all' },
      options
    );

    courses.push(...result.data);
    count = result.count;
    page += 1;

    if (result.data.length === 0) break;
  } while (courses.length < count);

  return new Map(courses.map((course) => [course.id, course.name]));
}

/**
 * Paginated read of a workspace's quiz-set library via
 * `GET /api/v1/workspaces/:wsId/quiz-sets`. Forwards the caller's auth.
 */
export async function getWorkspaceQuizSets(
  workspaceId: string,
  params?: ListWorkspaceQuizSetsParams,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(withTeachApiBaseUrl(options));
  const searchParams = new URLSearchParams();
  if (params?.page) searchParams.set('page', params.page.toString());
  if (params?.pageSize)
    searchParams.set('pageSize', params.pageSize.toString());
  if (params?.q) searchParams.set('q', params.q);

  const query = searchParams.toString();
  const result = await client.json<ListWorkspaceQuizSetsResponse>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/quiz-sets${
      query ? `?${query}` : ''
    }`,
    {
      method: 'GET',
      cache: 'no-store',
    }
  );

  if (result.data.length === 0) {
    return result;
  }

  const linkedModulesBySetId = await Promise.all(
    result.data.map(async (quizSet) => {
      const knownLinkedModulesCount =
        quizSet.linked_modules_count ?? quizSet.course_module_quiz_sets?.length;

      return {
        quizSetId: quizSet.id,
        linkedModules:
          knownLinkedModulesCount === 0
            ? []
            : await listAllQuizSetLinkedModules(
                workspaceId,
                quizSet.id,
                options
              ),
      };
    })
  );
  const courseIds = new Set(
    linkedModulesBySetId.flatMap(({ linkedModules }) =>
      linkedModules
        .map((module) => module.group_id)
        .filter((groupId): groupId is string => Boolean(groupId))
    )
  );
  const courseNameById =
    courseIds.size > 0
      ? await listAllWorkspaceCoursesForLookup(workspaceId, options)
      : new Map<string, string>();

  return {
    ...result,
    data: result.data.map((quizSet) => {
      const linkedModules =
        linkedModulesBySetId.find(({ quizSetId }) => quizSetId === quizSet.id)
          ?.linkedModules ?? [];

      return {
        ...quizSet,
        linked_modules: linkedModules.flatMap((module) => {
          const courseId = module.group_id;

          if (!courseId) return [];

          return {
            course_id: courseId,
            course_name: courseNameById.get(courseId) ?? courseId,
            module_id: module.id,
            module_name: module.name ?? '',
          };
        }),
        linked_modules_count: linkedModules.length,
      };
    }),
  };
}

export async function createWorkspaceQuizSet(
  workspaceId: string,
  payload: UpsertWorkspaceQuizSetPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(withTeachApiBaseUrl(options));
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
  const client = getInternalApiClient(withTeachApiBaseUrl(options));
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
  const client = getInternalApiClient(withTeachApiBaseUrl(options));
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
  const client = getInternalApiClient(withTeachApiBaseUrl(options));
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
  const client = getInternalApiClient(withTeachApiBaseUrl(options));
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
  const client = getInternalApiClient(withTeachApiBaseUrl(options));
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
  const client = getInternalApiClient(withTeachApiBaseUrl(options));
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
  return client.json<ListWorkspaceEducationAttemptsResponse>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/education/attempts${suffix}`,
    { cache: 'no-store' }
  );
}

export async function getWorkspaceEducationAttemptDetail(
  workspaceId: string,
  attemptId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(withTeachApiBaseUrl(options));
  return client.json<WorkspaceEducationAttemptDetailResponse>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/education/attempts/${encodePathSegment(attemptId)}`,
    {
      cache: 'no-store',
    }
  );
}

export interface ListWorkspaceCourseTestQuestionsParams {
  moduleId?: string;
}

export async function getWorkspaceCourseTestQuestions(
  workspaceId: string,
  courseId: string,
  testId: string,
  params?: ListWorkspaceCourseTestQuestionsParams,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(withTeachApiBaseUrl(options));
  const searchParams = new URLSearchParams();
  if (params?.moduleId) searchParams.set('moduleId', params.moduleId);

  const query = searchParams.toString();
  return client.json<ListWorkspaceQuizzesResponse>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/teach/courses/${encodePathSegment(courseId)}/tests/${encodePathSegment(testId)}/questions${
      query ? `?${query}` : ''
    }`,
    {
      method: 'GET',
      cache: 'no-store',
    }
  );
}

export async function createWorkspaceCourseTestQuestions(
  workspaceId: string,
  courseId: string,
  testId: string,
  payload: CreateWorkspaceQuizPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(withTeachApiBaseUrl(options));
  return client.json<{ message: string }>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/teach/courses/${encodePathSegment(courseId)}/tests/${encodePathSegment(testId)}/questions`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
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
  return client.json<{ url: string }>(
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
