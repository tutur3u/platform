import {
  encodePathSegment,
  getInternalApiClient,
  type InternalApiClientOptions,
} from './client';
import type { TulearnBootstrapResponse } from './tulearn';

export type TeachBootstrapResponse = TulearnBootstrapResponse;

export interface TeachWorkspaceUser {
  archived?: boolean | null;
  avatar_url?: string | null;
  display_name?: string | null;
  email?: string | null;
  full_name?: string | null;
  id: string;
}

export interface TeachCourseMember extends TeachWorkspaceUser {
  role: 'STUDENT' | 'TEACHER' | string | null;
}

export type TeachAttendanceStatus = 'PRESENT' | 'ABSENT' | 'LATE' | 'NONE';

export interface TeachAttendanceEntry {
  date: string;
  notes?: string | null;
  status: TeachAttendanceStatus;
  user_id: string;
}

export interface TeachAttendanceDaySummary {
  absent: number;
  date: string;
  late: number;
  notes: number;
  present: number;
  totalMarked: number;
}

export interface TeachPost {
  content: string | null;
  created_at: string;
  id: string;
  notes: string | null;
  post_approval_status?: string | null;
  title: string | null;
}

export interface TeachReport {
  content: string;
  created_at: string;
  feedback: string;
  id: string;
  report_approval_status?: string | null;
  score: number | null;
  scores: number[] | null;
  title: string;
  updated_at: string;
  user?: TeachWorkspaceUser | null;
  user_id: string;
}

export interface TeachIndicator {
  created_at: string | null;
  factor: number;
  id: string;
  is_weighted: boolean;
  name: string;
  unit: string;
}

export interface TeachIndicatorValue {
  indicator_id: string;
  user_id: string;
  value: number | null;
}

export function getTeachBootstrap(options?: InternalApiClientOptions) {
  const client = getInternalApiClient(options);
  return client.json<TeachBootstrapResponse>('/api/v1/tulearn/bootstrap', {
    cache: 'no-store',
  });
}

export function listWorkspaceUsers(
  workspaceId: string,
  params: { from?: number; limit?: number; q?: string } = {},
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ count: number; data: TeachWorkspaceUser[] }>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/teach/users`,
    { cache: 'no-store', query: params }
  );
}

export function listWorkspaceCourseMembers(
  workspaceId: string,
  courseId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ data: TeachCourseMember[] }>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/teach/courses/${encodePathSegment(courseId)}/members`,
    { cache: 'no-store' }
  );
}

export function addWorkspaceCourseMembers(
  workspaceId: string,
  courseId: string,
  payload: { memberIds: string[]; role?: 'STUDENT' | 'TEACHER' },
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ message: string }>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/teach/courses/${encodePathSegment(courseId)}/members`,
    {
      body: JSON.stringify(payload),
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    }
  );
}

export function removeWorkspaceCourseMember(
  workspaceId: string,
  courseId: string,
  userId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ message: string }>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/teach/courses/${encodePathSegment(courseId)}/members/${encodePathSegment(userId)}`,
    { cache: 'no-store', method: 'DELETE' }
  );
}

export function listWorkspaceCourseAttendance(
  workspaceId: string,
  courseId: string,
  date: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ data: TeachAttendanceEntry[] }>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/teach/courses/${encodePathSegment(courseId)}/attendance`,
    { cache: 'no-store', query: { date } }
  );
}

export function listWorkspaceCourseAttendanceMonth(
  workspaceId: string,
  courseId: string,
  month: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ days: TeachAttendanceDaySummary[] }>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/teach/courses/${encodePathSegment(courseId)}/attendance`,
    { cache: 'no-store', query: { month } }
  );
}

export function updateWorkspaceCourseAttendance(
  workspaceId: string,
  courseId: string,
  entries: TeachAttendanceEntry[],
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ message: string }>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/teach/courses/${encodePathSegment(courseId)}/attendance`,
    {
      body: JSON.stringify(entries),
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    }
  );
}

export function listWorkspaceCoursePosts(
  workspaceId: string,
  courseId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ data: TeachPost[] }>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/teach/courses/${encodePathSegment(courseId)}/posts`,
    { cache: 'no-store' }
  );
}

export function createWorkspaceCoursePost(
  workspaceId: string,
  courseId: string,
  payload: {
    content?: string | null;
    notes?: string | null;
    title?: string | null;
  },
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ id: string }>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/teach/courses/${encodePathSegment(courseId)}/posts`,
    {
      body: JSON.stringify(payload),
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    }
  );
}

export function listWorkspaceCourseReports(
  workspaceId: string,
  courseId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ data: TeachReport[] }>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/teach/courses/${encodePathSegment(courseId)}/reports`,
    { cache: 'no-store' }
  );
}

export function createWorkspaceCourseReport(
  workspaceId: string,
  courseId: string,
  payload: {
    content: string;
    feedback: string;
    score?: number | null;
    scores?: number[] | null;
    title: string;
    user_id: string;
  },
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ id: string }>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/teach/courses/${encodePathSegment(courseId)}/reports`,
    {
      body: JSON.stringify(payload),
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    }
  );
}

export function listWorkspaceCourseIndicators(
  workspaceId: string,
  courseId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{
    indicators: TeachIndicator[];
    values: TeachIndicatorValue[];
  }>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/teach/courses/${encodePathSegment(courseId)}/indicators`,
    { cache: 'no-store' }
  );
}

export function createWorkspaceCourseIndicator(
  workspaceId: string,
  courseId: string,
  payload: {
    factor?: number;
    is_weighted?: boolean;
    name: string;
    unit?: string;
  },
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<TeachIndicator>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/teach/courses/${encodePathSegment(courseId)}/indicators`,
    {
      body: JSON.stringify(payload),
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    }
  );
}

export function updateWorkspaceCourseIndicators(
  workspaceId: string,
  courseId: string,
  values: TeachIndicatorValue[],
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ message: string }>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/teach/courses/${encodePathSegment(courseId)}/indicators`,
    {
      body: JSON.stringify(values),
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      method: 'PATCH',
    }
  );
}

export interface TeachCourseTest {
  id: string;
  course_id: string;
  name: string;
  created_at: string;
  module_ids?: string[];
  start_at?: string | null;
  duration_in_minutes?: number | null;
  description?: string | null;
}

export function listWorkspaceCourseTests(
  workspaceId: string,
  courseId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ data: TeachCourseTest[] }>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/teach/courses/${encodePathSegment(courseId)}/tests`,
    { cache: 'no-store' }
  );
}

export function createWorkspaceCourseTest(
  workspaceId: string,
  courseId: string,
  payload: {
    name: string;
    moduleIds: string[];
    startAt?: string | null;
    durationInMinutes?: number | null;
    description?: string | null;
  },
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ id: string }>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/teach/courses/${encodePathSegment(courseId)}/tests`,
    {
      body: JSON.stringify(payload),
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    }
  );
}

