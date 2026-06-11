import type { Json } from '@tuturuuu/types';

import {
  encodePathSegment,
  getInternalApiClient,
  type InternalApiClientOptions,
} from './client';

export type TulearnRole = 'parent' | 'student';

export interface TulearnWorkspaceSummary {
  id: string;
  name: string | null;
  avatar_url: string | null;
  logo_url: string | null;
  roles: TulearnRole[];
}

export interface TulearnStudentSummary {
  id: string;
  platform_user_id: string;
  workspace_user_id: string;
  workspace_id: string;
  name: string | null;
  email: string | null;
  avatar_url: string | null;
}

export interface TulearnBootstrapResponse {
  profile: {
    id: string;
    email: string | null;
    display_name: string | null;
    avatar_url: string | null;
  };
  workspaces: TulearnWorkspaceSummary[];
  linkedStudents: TulearnStudentSummary[];
}

export interface TulearnLearnerState {
  hearts: number;
  max_hearts: number;
  xp_total: number;
  current_streak: number;
  longest_streak: number;
  streak_freezes: number;
  last_activity_date: string | null;
}

export interface TulearnCourseSummary {
  id: string;
  name: string;
  description: string | null;
  completedModules: number;
  totalModules: number;
  progress: number;
}

export interface TulearnAssignmentSummary {
  id: string;
  title: string | null;
  content: string | null;
  created_at: string;
  course: {
    id: string;
    name: string | null;
  };
  is_completed: boolean;
  approval_status?: string | null;
}

export interface TulearnMarkSummary {
  id: string;
  value: number | null;
  created_at: string | null;
  metric: {
    id: string;
    name: string | null;
    unit: string | null;
  };
  course: {
    id: string;
    name: string;
  } | null;
}

export interface TulearnReportSummary {
  id: string;
  title: string;
  content: string;
  feedback: string | null;
  score: number | null;
  created_at: string;
  course: {
    id: string;
    name: string;
  } | null;
}

export interface TulearnHomeResponse {
  role: TulearnRole;
  readOnly: boolean;
  student: {
    id: string;
    name: string | null;
  };
  state: TulearnLearnerState;
  courses: TulearnCourseSummary[];
  assignments: TulearnAssignmentSummary[];
  marks: TulearnMarkSummary[];
  recommendedPractice: TulearnPracticeItem | null;
}

export interface TulearnCourseModuleSummary {
  id: string;
  name: string;
  sort_key: number;
  is_published: boolean;
  completed: boolean;
  locked: boolean;
  counts: {
    flashcards: number;
    quizzes: number;
    quizSets: number;
  };
}

export interface TulearnCourseDetail extends TulearnCourseSummary {
  modules: TulearnCourseModuleSummary[];
}

export interface TulearnQuizOption {
  id: string;
  value: string;
}

export interface TulearnQuiz {
  id: string;
  question: string;
  type: string | null;
  content: Json | null;
  score: number;
  quiz_options?: TulearnQuizOption[];
}

export interface TulearnCourseModuleDetail extends TulearnCourseModuleSummary {
  content: unknown;
  extra_content: unknown;
  youtube_links: string[] | null;
  flashcards: Array<{ id: string; front: string; back: string }>;
  quizzes: TulearnQuiz[];
  quizSets: Array<{ id: string; name: string }>;
}

export interface TulearnPracticeItem {
  type: 'flashcard' | 'module' | 'quiz' | 'quiz_set';
  id: string;
  title: string;
  courseId: string;
  courseName: string;
  prompt: string | null;
}

export interface SubmitTulearnPracticePayload {
  type: TulearnPracticeItem['type'] | 'assignment';
  itemId: string;
  correct?: boolean;
}

export interface TulearnPracticeResult {
  correct: boolean;
  hearts: number;
  xpAwarded: number;
  state: TulearnLearnerState;
}

export interface CompleteTulearnAssignmentPayload {
  postId: string;
  completed: boolean;
}

export interface UpdateTulearnProfilePayload {
  displayName: string;
  email?: string;
}

function studentQuery(studentId?: string | null) {
  return studentId ? { studentId } : undefined;
}

export async function getTulearnBootstrap(options?: InternalApiClientOptions) {
  const client = getInternalApiClient(options);
  return client.json<TulearnBootstrapResponse>('/api/v1/tulearn/bootstrap', {
    cache: 'no-store',
  });
}

export async function getTulearnHome(
  workspaceId: string,
  studentId?: string | null,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<TulearnHomeResponse>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/tulearn/home`,
    { cache: 'no-store', query: studentQuery(studentId) }
  );
}

export async function listTulearnCourses(
  workspaceId: string,
  studentId?: string | null,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ courses: TulearnCourseSummary[] }>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/tulearn/courses`,
    { cache: 'no-store', query: studentQuery(studentId) }
  );
}

export async function getTulearnCourse(
  workspaceId: string,
  courseId: string,
  studentId?: string | null,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<TulearnCourseDetail>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/tulearn/courses/${encodePathSegment(courseId)}`,
    { cache: 'no-store', query: studentQuery(studentId) }
  );
}

export async function getTulearnCourseModule(
  workspaceId: string,
  courseId: string,
  moduleId: string,
  studentId?: string | null,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<TulearnCourseModuleDetail>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/tulearn/courses/${encodePathSegment(courseId)}/modules/${encodePathSegment(moduleId)}`,
    { cache: 'no-store', query: studentQuery(studentId) }
  );
}

export async function getTulearnPractice(
  workspaceId: string,
  studentId?: string | null,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ item: TulearnPracticeItem | null }>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/tulearn/practice`,
    { cache: 'no-store', query: studentQuery(studentId) }
  );
}

export async function submitTulearnPractice(
  workspaceId: string,
  payload: SubmitTulearnPracticePayload,
  studentId?: string | null,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<TulearnPracticeResult>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/tulearn/practice`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      cache: 'no-store',
      query: studentQuery(studentId),
    }
  );
}

export async function listTulearnAssignments(
  workspaceId: string,
  studentId?: string | null,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ assignments: TulearnAssignmentSummary[] }>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/tulearn/assignments`,
    { cache: 'no-store', query: studentQuery(studentId) }
  );
}

export async function completeTulearnAssignment(
  workspaceId: string,
  payload: CompleteTulearnAssignmentPayload,
  studentId?: string | null,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{
    assignment: TulearnAssignmentSummary;
    xpAwarded: number;
  }>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/tulearn/assignments`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      cache: 'no-store',
      query: studentQuery(studentId),
    }
  );
}

export async function listTulearnReports(
  workspaceId: string,
  studentId?: string | null,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ reports: TulearnReportSummary[] }>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/tulearn/reports`,
    { cache: 'no-store', query: studentQuery(studentId) }
  );
}

export async function listTulearnMarks(
  workspaceId: string,
  studentId?: string | null,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ marks: TulearnMarkSummary[] }>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/tulearn/marks`,
    { cache: 'no-store', query: studentQuery(studentId) }
  );
}

export async function updateTulearnProfile(
  payload: UpdateTulearnProfilePayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ message: string }>('/api/v1/users/me/profile', {
    body: JSON.stringify({ display_name: payload.displayName }),
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    method: 'PATCH',
  });
}

export interface SharedCourseContentResponse {
  group: {
    name: string | null;
    description: string | null;
  };
  modules: Array<{
    id: string;
    name: string | null;
    content: unknown;
    extra_content: unknown;
    youtube_links: string[] | null;
    group_id: string;
    module_group_id: string;
    created_at: string;
    is_public: boolean;
    is_published: boolean;
    sort_key: number | null;
    flashcards: number;
    quizzes: number;
    quizSets: number;
  }>;
}

export async function getSharedCourseContent(
  courseId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<SharedCourseContentResponse>('/api/v1/course', {
    cache: 'no-store',
    query: { courseId },
  });
}

export interface CourseListItem {
  id: string;
  name: string | null;
  description: string | null;
  totalModules: number;
  completedModules: number;
  progress: number;
}

export interface CourseListResponse {
  courses: CourseListItem[];
}

export async function listSharedCourses(
  wsId: string,
  studentId?: string | null,
  options?: InternalApiClientOptions
) {
  return listTulearnCourses(wsId, studentId, options);
}
