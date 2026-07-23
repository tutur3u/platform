import type {
  Product,
  SupportType,
  WorkspaceUserReport,
} from '@tuturuuu/types';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import {
  encodePathSegment,
  getInternalApiClient,
  type InternalApiClientOptions,
} from './client';

export interface CreateReportUploadUrlPayload {
  filename: string;
  contentType: string;
  size: number;
}

export interface CreateReportUploadUrlResponse {
  signedUrl: string;
  token: string;
  path: string;
}

export interface CreateReportUploadUrlsPayload {
  files: CreateReportUploadUrlPayload[];
}

export interface CreateReportUploadUrlsResponse {
  uploads: CreateReportUploadUrlResponse[];
}

export interface DeleteReportUploadPathsPayload {
  paths: string[];
}

export interface DeleteReportUploadPathsResponse {
  ok: boolean;
}

export interface SubmitReportPayload {
  product: Product;
  type: SupportType;
  suggestion: string;
  subject: string;
  imagePaths?: string[];
}

export interface SubmitReportResponse {
  success: boolean;
  message: string;
  reportId: string;
  uploadedMedia: string[];
}

export type WorkspaceGroupReportDashboardReport = WorkspaceUserReport & {
  creator_name?: string | null;
  group_name?: string | null;
  user_archived?: boolean;
  user_archived_until?: string | null;
  user_name?: string | null;
  user_note?: string | null;
};

export interface WorkspaceGroupReportDashboardResponse {
  group: { id: string; name: string | null };
  managers: Array<{ id: string; full_name: string | null }>;
  reportDetail: WorkspaceGroupReportDashboardReport | null;
  reports: WorkspaceGroupReportDashboardReport[];
  userGroupMetrics: Array<{
    factor: number;
    id: string;
    is_weighted: boolean;
    name: string;
    unit: string;
    value: number | null;
  }>;
  userStatusSummary: Array<{
    approved_count: number;
    pending_count: number;
    rejected_count: number;
    user_id: string;
  }>;
  users: WorkspaceUser[];
}

export interface ListWorkspaceGroupReportDashboardParams {
  groupId: string;
  reportId?: string | null;
  userId?: string | null;
  workspaceId: string;
}

export type PeriodicReportCadence =
  | 'weekly'
  | 'monthly'
  | 'quarterly'
  | 'yearly';
export type PeriodicReportGenerationMode = 'manual' | 'ai';
export type PeriodicReportDeliveryStatus =
  | 'draft'
  | 'queued'
  | 'processing'
  | 'sent'
  | 'failed'
  | 'blocked'
  | 'cancelled';

export interface PeriodicReport {
  approved_at: string | null;
  cadence: PeriodicReportCadence;
  content: string;
  created_at: string;
  delivery_status: PeriodicReportDeliveryStatus;
  feedback: string;
  generation_mode: PeriodicReportGenerationMode;
  generation_status: 'draft' | 'generating' | 'ready' | 'failed';
  group_id: string;
  group_name: string | null;
  id: string;
  last_delivery_error: string | null;
  manager_instruction: string | null;
  period_end: string | null;
  period_start: string | null;
  report_approval_status: 'PENDING' | 'APPROVED' | 'REJECTED';
  score: number | null;
  title: string;
  updated_at: string;
  user_email: string | null;
  user_id: string;
  user_name: string | null;
}

export interface PeriodicReportCounts {
  approved: number;
  blocked: number;
  delivered: number;
  draft: number;
  failed: number;
  pendingReview: number;
  total: number;
}

export interface ListPeriodicReportsParams {
  approvalStatus?: 'PENDING' | 'APPROVED' | 'REJECTED';
  cadence?: PeriodicReportCadence;
  deliveryStatus?: PeriodicReportDeliveryStatus;
  page?: number;
  pageSize?: number;
  query?: string;
}

export interface ListPeriodicReportsResponse {
  counts: PeriodicReportCounts;
  data: PeriodicReport[];
  page: number;
  pageSize: number;
  total: number;
  workspace: { id: string; timezone: string | null };
}

export interface CreatePeriodicReportPayload {
  cadence?: PeriodicReportCadence;
  content: string;
  feedback: string;
  generation_mode?: PeriodicReportGenerationMode;
  group_id: string;
  manager_instruction?: string | null;
  period_end?: string | null;
  period_start?: string | null;
  score?: number | null;
  scores?: number[] | null;
  title: string;
  user_id: string;
}

export interface PeriodicReportSchedule {
  cadence: PeriodicReportCadence;
  delivery_time: string;
  enabled: boolean;
  generation_mode: PeriodicReportGenerationMode;
  group_id: string | null;
  id: string;
  manager_instruction: string | null;
  next_run_at: string | null;
  timezone: string | null;
}

export interface PeriodicReportSchedulesResponse {
  canManage: boolean;
  defaults: PeriodicReportSchedule[];
  emailDelivery: {
    globalGateEnabled: boolean;
    periodicGateEnabled: boolean;
    ready: boolean;
    senderConfigured: boolean;
  };
  overrides: PeriodicReportSchedule[];
  recentDeliveries: Array<{
    attempted_at: string;
    error_message: string | null;
    id: string;
    status: 'sent' | 'failed' | 'blocked';
  }>;
  recentRuns: Array<{
    cadence: PeriodicReportCadence;
    completed_at: string | null;
    id: string;
    last_error: string | null;
    period_end: string;
    period_start: string;
    status: 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled';
  }>;
  workspaceTimezone: string | null;
}

export interface UpsertPeriodicReportSchedulePayload {
  cadence: PeriodicReportCadence;
  delivery_time?: string;
  enabled: boolean;
  generation_mode: PeriodicReportGenerationMode;
  group_id?: string | null;
  manager_instruction?: string | null;
  timezone: string;
}

export interface ReportGroupSelectorResponse {
  groupStatusSummary: Array<{
    approved_count: number;
    group_id: string;
    pending_count: number;
    rejected_count: number;
  }>;
  groups: Array<{ id: string; name: string | null }>;
  selectedGroup: { id: string; name: string | null } | null;
  selectedGroupManagers: Array<{ id: string; full_name: string | null }>;
}

export async function createReportUploadUrl(
  payload: CreateReportUploadUrlPayload,
  options?: InternalApiClientOptions
) {
  const result = await createReportUploadUrls({ files: [payload] }, options);
  const firstUpload = result.uploads[0];

  if (!firstUpload) {
    throw new Error('Missing upload URL payload');
  }

  return firstUpload;
}

export async function createReportUploadUrls(
  payload: CreateReportUploadUrlsPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<CreateReportUploadUrlsResponse>(
    '/api/reports/upload-url',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      cache: 'no-store',
    }
  );
}

export async function deleteReportUploadPaths(
  payload: DeleteReportUploadPathsPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<DeleteReportUploadPathsResponse>(
    '/api/reports/upload-url',
    {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      cache: 'no-store',
    }
  );
}

export async function submitReport(
  payload: SubmitReportPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<SubmitReportResponse>('/api/reports', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
    cache: 'no-store',
  });
}

export async function listWorkspaceGroupReportDashboard(
  {
    groupId,
    reportId,
    userId,
    workspaceId,
  }: ListWorkspaceGroupReportDashboardParams,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);

  return client.json<WorkspaceGroupReportDashboardResponse>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/users/reports/groups/${encodePathSegment(groupId)}/dashboard`,
    {
      cache: 'no-store',
      query: {
        reportId: reportId || undefined,
        userId: userId || undefined,
      },
    }
  );
}

export async function listWorkspaceReportGroups(
  workspaceId: string,
  params?: { query?: string; selectedGroupId?: string | null },
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<ReportGroupSelectorResponse>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/users/reports/groups`,
    {
      cache: 'no-store',
      query: {
        q: params?.query,
        selectedGroupId: params?.selectedGroupId ?? undefined,
      },
    }
  );
}

export async function listPeriodicReports(
  workspaceId: string,
  params: ListPeriodicReportsParams = {},
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<ListPeriodicReportsResponse>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/users/reports`,
    {
      cache: 'no-store',
      query: {
        approvalStatus: params.approvalStatus,
        cadence: params.cadence,
        deliveryStatus: params.deliveryStatus,
        page: params.page,
        pageSize: params.pageSize,
        q: params.query,
      },
    }
  );
}

export async function createPeriodicReport(
  workspaceId: string,
  payload: CreatePeriodicReportPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ id: string }>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/users/reports`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      cache: 'no-store',
    }
  );
}

export async function updatePeriodicReport(
  workspaceId: string,
  reportId: string,
  payload: Partial<CreatePeriodicReportPayload> & {
    report_approval_status?: 'PENDING' | 'APPROVED' | 'REJECTED';
    rejection_reason?: string | null;
  },
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ success: boolean }>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/users/reports/${encodePathSegment(reportId)}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      cache: 'no-store',
    }
  );
}

export async function requestPeriodicReportGeneration(
  workspaceId: string,
  reportId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ queued: boolean }>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/users/reports/${encodePathSegment(reportId)}/generate`,
    { method: 'POST', cache: 'no-store' }
  );
}

export async function requestPeriodicReportDelivery(
  workspaceId: string,
  reportId: string,
  action: 'preview' | 'test' | 'send' | 'retry' | 'cancel',
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{
    message: string;
    preview?: {
      content: string;
      feedback: string;
      recipient: string | null;
      title: string;
    };
    queued: boolean;
    status: PeriodicReportDeliveryStatus;
  }>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/users/reports/${encodePathSegment(reportId)}/delivery`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
      cache: 'no-store',
    }
  );
}

export async function getPeriodicReportSchedules(
  workspaceId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<PeriodicReportSchedulesResponse>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/users/reports/schedules`,
    { cache: 'no-store' }
  );
}

export async function upsertPeriodicReportSchedule(
  workspaceId: string,
  payload: UpsertPeriodicReportSchedulePayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ id: string }>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/users/reports/schedules`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      cache: 'no-store',
    }
  );
}
