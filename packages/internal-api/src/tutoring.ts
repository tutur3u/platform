import {
  encodePathSegment,
  getInternalApiClient,
  type InternalApiClientOptions,
  type InternalApiQuery,
} from './client';

export type TutoringReasonType = 'ABSENT_RECOVERY' | 'WEAK_SUPPORT' | 'CUSTOM';
export type TutoringAttendanceStatus =
  | 'PENDING'
  | 'DONE'
  | 'NO_SHOW'
  | 'CANCELLED';

export interface TutoringSessionRecord {
  id: string;
  group_id: string;
  student_user_id: string;
  teacher_user_id: string | null;
  session_date: string;
  start_time: string;
  duration_minutes: number;
  reason_type: TutoringReasonType;
  reason_detail: string;
  content: string;
  attendance_status: TutoringAttendanceStatus;
  parent_message_preview: string;
  source_feedback_id: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
  group: { id: string; name: string | null } | null;
  student: {
    id: string;
    full_name: string | null;
    display_name: string | null;
    email: string | null;
  } | null;
  teacher: {
    id: string;
    full_name: string | null;
    display_name: string | null;
    email: string | null;
  } | null;
}

export interface TutoringQueueItem {
  group_id: string;
  student_user_id: string;
  group_name: string;
  student_name: string;
  reason_type: 'ABSENT_RECOVERY' | 'WEAK_SUPPORT' | 'BOTH';
  absence_deficit: number;
  feedback_content: string;
  source_feedback_id: string | null;
}

export interface ListTutoringSessionsParams extends InternalApiQuery {
  fromDate?: string;
  toDate?: string;
  teacherId?: string;
  groupId?: string;
  studentUserId?: string;
  reasonType?: TutoringReasonType;
  attendanceStatus?: TutoringAttendanceStatus;
  page?: number;
  pageSize?: number;
}

export interface CreateTutoringSessionPayload {
  groupId: string;
  studentUserId: string;
  teacherUserId?: string | null;
  sessions?: {
    sessionDate: string;
    startTime: string;
    durationMinutes: number;
    teacherUserId?: string | null;
  }[];
  sessionDate?: string;
  startTime?: string;
  durationMinutes?: number;
  sessionCount?: number;
  reasonType: TutoringReasonType;
  reasonDetail?: string;
  content?: string;
  attendanceStatus?: TutoringAttendanceStatus;
  sourceFeedbackId?: string | null;
}

export interface UpdateTutoringSessionPayload {
  teacherUserId?: string | null;
  sessionDate?: string;
  startTime?: string;
  durationMinutes?: number;
  reasonType?: TutoringReasonType;
  reasonDetail?: string;
  content?: string;
  attendanceStatus?: TutoringAttendanceStatus;
  parentMessagePreview?: string;
  resolvedAt?: string | null;
}

function basePath(workspaceId: string) {
  return `/api/v1/workspaces/${encodePathSegment(workspaceId)}/tutoring`;
}

export async function listTutoringSessions(
  workspaceId: string,
  params: ListTutoringSessionsParams = {},
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{
    data: TutoringSessionRecord[];
    count: number;
    page: number;
    pageSize: number;
    totalPages: number;
  }>(`${basePath(workspaceId)}/sessions`, { cache: 'no-store', query: params });
}

export async function createTutoringSession(
  workspaceId: string,
  payload: CreateTutoringSessionPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{
    id: string | null;
    ids: string[];
    createdCount: number;
  }>(`${basePath(workspaceId)}/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function updateTutoringSession(
  workspaceId: string,
  sessionId: string,
  payload: UpdateTutoringSessionPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ message: string }>(
    `${basePath(workspaceId)}/sessions/${encodePathSegment(sessionId)}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }
  );
}

export async function markTutoringSession(
  workspaceId: string,
  sessionId: string,
  attendanceStatus: TutoringAttendanceStatus,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ message: string }>(
    `${basePath(workspaceId)}/sessions/${encodePathSegment(sessionId)}/mark`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ attendanceStatus }),
    }
  );
}

export async function generateTutoringMessagePreview(
  workspaceId: string,
  sessionId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ preview: string }>(
    `${basePath(workspaceId)}/sessions/${encodePathSegment(sessionId)}/message-preview`,
    {
      method: 'POST',
    }
  );
}

export async function listTutoringQueue(
  workspaceId: string,
  params: InternalApiQuery & { page?: number; pageSize?: number } = {},
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{
    data: TutoringQueueItem[];
    count: number;
    page: number;
    pageSize: number;
    totalPages: number;
  }>(`${basePath(workspaceId)}/queue`, {
    cache: 'no-store',
    query: params,
  });
}

export async function exportTutoringSessions(
  workspaceId: string,
  params: InternalApiQuery = {},
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ mode: 'detailed' | 'payroll'; data: unknown[] }>(
    `${basePath(workspaceId)}/export`,
    { cache: 'no-store', query: params }
  );
}
