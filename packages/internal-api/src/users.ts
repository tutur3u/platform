import type {
  PostApprovalItem,
  PostLogEntry,
  ReportApprovalItem,
  ReportLogEntry,
} from '@tuturuuu/types/db';
import {
  encodePathSegment,
  getInternalApiClient,
  type InternalApiClientOptions,
} from './client';

type UserConfigResponse = {
  value: string | null;
};

type UserWorkspaceConfigResponse = {
  value: string | null;
};

export const SHOW_VERSION_BADGE_CONFIG_ID = 'SHOW_VERSION_BADGE';

export type RootNavigationTarget =
  | 'workspace_home'
  | 'tasks'
  | 'calendar'
  | 'finance';

export type RootNavigationConfig = {
  target: RootNavigationTarget;
  submodule?: string;
  boardId?: string;
};

export type NormalizedRootNavigationConfig = {
  target: RootNavigationTarget;
  submodule: string;
  boardId: string;
};

const ROOT_NAVIGATION_TARGETS: readonly RootNavigationTarget[] = [
  'workspace_home',
  'tasks',
  'calendar',
  'finance',
];

const TASK_SUBMODULES = ['home', 'boards'] as const;
const FINANCE_SUBMODULES = [
  'home',
  'transactions',
  'wallets',
  'invoices',
] as const;

export function parseRootNavigationConfig(raw: unknown): RootNavigationConfig {
  if (!raw) {
    return { target: 'workspace_home' };
  }

  const parseObject = (value: {
    target?: unknown;
    submodule?: unknown;
    boardId?: unknown;
  }): RootNavigationConfig => {
    const target =
      typeof value.target === 'string' ? value.target.trim() : 'workspace_home';

    if (!ROOT_NAVIGATION_TARGETS.includes(target as RootNavigationTarget)) {
      return { target: 'workspace_home' };
    }

    return {
      target: target as RootNavigationTarget,
      submodule:
        typeof value.submodule === 'string'
          ? value.submodule.trim()
          : undefined,
      boardId:
        typeof value.boardId === 'string' ? value.boardId.trim() : undefined,
    };
  };

  if (typeof raw === 'object') {
    return parseObject(raw as Parameters<typeof parseObject>[0]);
  }

  if (typeof raw !== 'string') {
    return { target: 'workspace_home' };
  }

  try {
    return parseObject(JSON.parse(raw) as Parameters<typeof parseObject>[0]);
  } catch {
    return { target: 'workspace_home' };
  }
}

export function normalizeRootNavigationConfig(
  raw: unknown
): NormalizedRootNavigationConfig {
  const parsed = parseRootNavigationConfig(raw);

  if (parsed.target === 'tasks') {
    const submodule = (TASK_SUBMODULES as readonly string[]).includes(
      parsed.submodule ?? ''
    )
      ? (parsed.submodule as string)
      : 'home';

    return {
      target: parsed.target,
      submodule,
      boardId: parsed.boardId?.trim() ? parsed.boardId : 'none',
    };
  }

  if (parsed.target === 'finance') {
    const submodule = (FINANCE_SUBMODULES as readonly string[]).includes(
      parsed.submodule ?? ''
    )
      ? (parsed.submodule as string)
      : 'home';

    return {
      target: parsed.target,
      submodule,
      boardId: 'none',
    };
  }

  return {
    target: parsed.target,
    submodule: 'home',
    boardId: 'none',
  };
}

export type CurrentUserProfileResponse = {
  id: string;
  email: string | null;
  display_name: string | null;
  avatar_url: string | null;
  full_name: string | null;
  new_email: string | null;
  created_at: string;
  default_workspace_id: string | null;
};

export type CurrentUserDefaultWorkspaceResponse = {
  id: string;
  name: string;
  personal?: boolean | null;
} | null;

export type CurrentUserHiveAccessResponse = {
  hasAccess: boolean;
  isAdmin: boolean;
  isMember: boolean;
};

export interface WorkspaceAttendanceExportRecord {
  date: string;
  groupId: string;
  groupName: string | null;
  notes: string;
  status: string;
  userDisplayName: string | null;
  userEmail: string | null;
  userFullName: string | null;
  userId: string;
  userName: string;
}

export interface ListWorkspaceAttendanceExportResponse {
  count: number;
  data: WorkspaceAttendanceExportRecord[];
  nextOffset?: number;
}

export interface WorkspaceBasicUserRecord {
  id: string;
  full_name: string | null;
  display_name: string | null;
  email: string | null;
  avatar_url?: string | null;
  archived?: boolean | null;
}

export interface ListWorkspaceBasicUsersResponse {
  count: number;
  data: WorkspaceBasicUserRecord[];
}

export interface WorkspaceReferralUserRecord extends WorkspaceBasicUserRecord {
  has_require_attention_feedback?: boolean;
  phone?: string | null;
}

export interface ListWorkspaceUserReferralsResponse {
  count: number;
  data: WorkspaceReferralUserRecord[];
}

export type WorkspaceUserPlatformLinkRepairSkipReason =
  | 'missing_email'
  | 'no_member_match'
  | 'ambiguous_workspace_profile'
  | 'ambiguous_platform_match'
  | 'already_linked'
  | 'platform_already_linked';

export interface WorkspaceUserPlatformLinkRepairPayload {
  workspaceUserId?: string;
}

export interface WorkspaceUserPlatformLinkRepairLinkedUser {
  email: string;
  platformUserId: string;
  workspaceUserId: string;
  workspaceUserName: string | null;
}

export interface WorkspaceUserPlatformLinkRepairSkippedUser {
  detail?: string;
  email: string | null;
  reason: WorkspaceUserPlatformLinkRepairSkipReason;
  workspaceUserId: string;
  workspaceUserName: string | null;
}

export interface WorkspaceUserPlatformLinkRepairResponse {
  linked: WorkspaceUserPlatformLinkRepairLinkedUser[];
  skipped: WorkspaceUserPlatformLinkRepairSkippedUser[];
  summary: {
    linked: number;
    scanned: number;
    skipped: number;
  };
}

export type UpdateCurrentUserDefaultWorkspaceResponse = {
  success: boolean;
};

type CurrentUserAvatarUploadUrlResponse = {
  uploadUrl: string;
  publicUrl: string;
};

export type UploadCurrentUserAvatarResult = {
  publicUrl: string;
  finalizeOk: boolean;
  finalizeError?: string;
};

export type UpdateCurrentUserProfilePayload = {
  avatar_url?: string | null;
  display_name?: string | null;
  full_name?: string | null;
};

export type UpdatePlatformUserRolesPayload = {
  allow_challenge_management: boolean;
  allow_manage_all_challenges: boolean;
  allow_role_management: boolean;
  allow_workspace_creation: boolean;
  enabled: boolean;
};

export interface CreateSupportInquiryPayload {
  name: string;
  email: string;
  type: 'bug' | 'feature-request' | 'support' | 'job-application';
  product:
    | 'web'
    | 'nova'
    | 'rewise'
    | 'calendar'
    | 'finance'
    | 'tudo'
    | 'tumeet'
    | 'shortener'
    | 'qr'
    | 'drive'
    | 'mail'
    | 'other';
  subject: string;
  message: string;
}

export async function getUserConfig(
  configId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<UserConfigResponse>(
    `/api/v1/users/me/configs/${encodePathSegment(configId)}`,
    {
      cache: 'no-store',
    }
  );
}

export async function updateUserConfig(
  configId: string,
  value: string | null,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ message: string }>(
    `/api/v1/users/me/configs/${encodePathSegment(configId)}`,
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ value }),
    }
  );
}

export async function getUserWorkspaceConfig(
  workspaceId: string,
  configId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<UserWorkspaceConfigResponse>(
    `/api/v1/users/me/workspaces/${encodePathSegment(workspaceId)}/configs/${encodePathSegment(configId)}`,
    {
      cache: 'no-store',
    }
  );
}

export async function updateUserWorkspaceConfig(
  workspaceId: string,
  configId: string,
  value: string | null,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ message: string }>(
    `/api/v1/users/me/workspaces/${encodePathSegment(workspaceId)}/configs/${encodePathSegment(configId)}`,
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ value }),
      cache: 'no-store',
    }
  );
}

export async function getCurrentUserProfile(
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<CurrentUserProfileResponse>('/api/v1/users/me/profile', {
    cache: 'no-store',
  });
}

export async function getCurrentUserDefaultWorkspace(
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<CurrentUserDefaultWorkspaceResponse>(
    '/api/v1/users/me/default-workspace',
    {
      cache: 'no-store',
    }
  );
}

export async function getCurrentUserHiveAccess(
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<CurrentUserHiveAccessResponse>(
    '/api/v1/users/me/hive-access',
    {
      cache: 'no-store',
    }
  );
}

export async function updateCurrentUserDefaultWorkspace(
  workspaceId: string | null,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<UpdateCurrentUserDefaultWorkspaceResponse>(
    '/api/v1/users/me/default-workspace',
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ workspaceId }),
    }
  );
}

export async function createCurrentUserAvatarUploadUrl(
  filename: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<CurrentUserAvatarUploadUrlResponse>(
    '/api/v1/users/me/avatar/upload-url',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ filename }),
      cache: 'no-store',
    }
  );
}

export async function updateCurrentUserProfile(
  payload: UpdateCurrentUserProfilePayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<CurrentUserProfileResponse>('/api/v1/users/me/profile', {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
    cache: 'no-store',
  });
}

export async function updatePlatformUserRoles(
  userId: string,
  payload: UpdatePlatformUserRolesPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{
    data: unknown;
    message: string;
  }>(`/api/v1/platform/users/${encodePathSegment(userId)}/roles`, {
    body: JSON.stringify(payload),
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
    },
    method: 'PUT',
  });
}

export async function uploadCurrentUserAvatar(
  file: File,
  filename = file.name,
  options?: InternalApiClientOptions
): Promise<UploadCurrentUserAvatarResult> {
  const client = getInternalApiClient(options);
  const { uploadUrl, publicUrl } = await createCurrentUserAvatarUploadUrl(
    filename,
    options
  );

  const uploadResponse = await client.fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': file.type,
    },
    body: file,
    cache: 'no-store',
  });

  if (!uploadResponse.ok) {
    throw new Error('Failed to upload file');
  }

  try {
    await updateCurrentUserProfile({ avatar_url: publicUrl }, options);
    return { publicUrl, finalizeOk: true };
  } catch (error) {
    return {
      publicUrl,
      finalizeOk: false,
      finalizeError:
        error instanceof Error
          ? error.message
          : 'Failed to finalize avatar profile update',
    };
  }
}

export async function removeCurrentUserAvatar(
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<void>('/api/v1/users/me/avatar', {
    method: 'DELETE',
    cache: 'no-store',
  });
}

export async function getUserCalendarSettings(
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{
    timezone?: string | null;
    first_day_of_week?: string | null;
    time_format?: string | null;
  }>('/api/v1/users/calendar-settings', {
    cache: 'no-store',
  });
}

export async function createSupportInquiry(
  payload: CreateSupportInquiryPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ success: true; inquiryId: string }>(
    '/api/v1/inquiries',
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

export async function listWorkspaceAttendanceExportRecords(
  workspaceId: string,
  {
    endDate,
    limit,
    offset,
    startDate,
  }: {
    endDate: string;
    limit?: number;
    offset?: number;
    startDate: string;
  },
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<ListWorkspaceAttendanceExportResponse>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/users/attendance/export`,
    {
      cache: 'no-store',
      query: {
        endDate,
        limit,
        offset,
        startDate,
      },
    }
  );
}

export async function listWorkspaceBasicUsers(
  workspaceId: string,
  {
    from = 0,
    limit = 200,
    q,
  }: {
    from?: number;
    limit?: number;
    q?: string;
  } = {},
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<ListWorkspaceBasicUsersResponse>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/users`,
    {
      cache: 'no-store',
      query: {
        from,
        limit,
        q,
      },
    }
  );
}

export async function getWorkspaceUser(
  workspaceId: string,
  userId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<WorkspaceBasicUserRecord>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/users/${encodePathSegment(userId)}`,
    {
      cache: 'no-store',
    }
  );
}

export async function listWorkspaceUserReferralCandidates(
  workspaceId: string,
  userId: string,
  {
    q,
  }: {
    q?: string;
  } = {},
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<WorkspaceReferralUserRecord[]>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/users/${encodePathSegment(userId)}/referrals`,
    {
      cache: 'no-store',
      query: {
        q,
        type: 'available',
      },
    }
  );
}

export async function listWorkspaceUserReferrals(
  workspaceId: string,
  userId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<ListWorkspaceUserReferralsResponse>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/users/${encodePathSegment(userId)}/referrals`,
    {
      cache: 'no-store',
    }
  );
}

export async function createWorkspaceUserReferral(
  workspaceId: string,
  userId: string,
  referredUserId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ message: string }>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/users/${encodePathSegment(userId)}/referrals`,
    {
      body: JSON.stringify({ referredUserId }),
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'POST',
    }
  );
}

export async function deleteWorkspaceUserReferral(
  workspaceId: string,
  userId: string,
  referredUserId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ message: string }>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/users/${encodePathSegment(userId)}/referrals`,
    {
      cache: 'no-store',
      method: 'DELETE',
      query: {
        referredUserId,
      },
    }
  );
}

// ---------------------------------------------------------------------------
// User approvals (reports + posts)
// ---------------------------------------------------------------------------

export type WorkspaceUserApprovalKind = 'reports' | 'posts';

export type WorkspaceUserApprovalStatusFilter =
  | 'all'
  | 'pending'
  | 'approved'
  | 'rejected';

export interface ListWorkspaceUserApprovalsParams {
  kind: WorkspaceUserApprovalKind;
  status?: WorkspaceUserApprovalStatusFilter;
  page?: number;
  limit?: number;
  groupId?: string;
  userId?: string;
  creatorId?: string;
}

export interface ListWorkspaceUserApprovalsResponse<
  TItem = ReportApprovalItem | PostApprovalItem,
> {
  items: TItem[];
  totalCount: number;
  totalPages: number;
}

export interface UpdateWorkspaceUserApprovalPayload {
  action: 'approve' | 'reject' | 'approveAll' | 'unapprove';
  kind: WorkspaceUserApprovalKind;
  itemId?: string;
  reason?: string;
  filters?: {
    groupId?: string;
    userId?: string;
    creatorId?: string;
  };
}

export interface UpdateWorkspaceUserApprovalResponse {
  success: boolean;
}

export interface ListWorkspaceUserApprovalLogsParams {
  kind: WorkspaceUserApprovalKind;
  reportId?: string;
  postId?: string;
}

export async function listWorkspaceUserApprovals<
  TItem = ReportApprovalItem | PostApprovalItem,
>(
  workspaceId: string,
  params: ListWorkspaceUserApprovalsParams,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<ListWorkspaceUserApprovalsResponse<TItem>>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/users/approvals`,
    {
      cache: 'no-store',
      query: {
        kind: params.kind,
        status: params.status,
        page: params.page,
        limit: params.limit,
        groupId: params.groupId,
        userId: params.userId,
        creatorId: params.creatorId,
      },
    }
  );
}

export async function updateWorkspaceUserApproval(
  workspaceId: string,
  payload: UpdateWorkspaceUserApprovalPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<UpdateWorkspaceUserApprovalResponse>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/users/approvals`,
    {
      body: JSON.stringify(payload),
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'PUT',
    }
  );
}

export async function listWorkspaceUserApprovalLogs<
  TLog = ReportLogEntry | PostLogEntry,
>(
  workspaceId: string,
  params: ListWorkspaceUserApprovalLogsParams,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<TLog | null>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/users/approvals/logs`,
    {
      cache: 'no-store',
      query: {
        kind: params.kind,
        reportId: params.reportId,
        postId: params.postId,
      },
    }
  );
}

export async function repairWorkspaceUserPlatformLinks(
  workspaceId: string,
  payload: WorkspaceUserPlatformLinkRepairPayload = {},
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<WorkspaceUserPlatformLinkRepairResponse>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/users/links/repair`,
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

// ---------------------------------------------------------------------------
// External profile-completion links
// ---------------------------------------------------------------------------

export type WorkspaceUserProfileLinkField =
  | 'display_name'
  | 'full_name'
  | 'birthday'
  | 'gender'
  | 'avatar_url'
  | 'email'
  | 'phone';

export type WorkspaceUserProfileLinkMode = 'per_user' | 'generic';

export interface WorkspaceUserProfileLinkSummary {
  id: string;
  code: string;
  mode: WorkspaceUserProfileLinkMode;
  target_user_id: string | null;
  target_user: WorkspaceUserProfileLinkTargetUser | null;
  allowed_fields: WorkspaceUserProfileLinkField[];
  prefill_existing_values: boolean;
  /** When false, the link can be completed without an account. */
  requires_auth: boolean;
  max_uses: number | null;
  expires_at: string | null;
  current_uses: number;
  is_expired: boolean;
  is_full: boolean;
  is_revoked: boolean;
  created_at: string;
}

export interface WorkspaceUserProfileLinkTargetUser {
  id: string;
  display_name: string | null;
  full_name: string | null;
  avatar_url: string | null;
  email: string | null;
  phone: string | null;
  birthday: string | null;
  gender: string | null;
  archived: boolean | null;
  private_fields_hidden: boolean;
}

export interface ListWorkspaceUserProfileLinkUsersResponse {
  data: WorkspaceUserProfileLinkTargetUser[];
}

export interface CreateWorkspaceUserProfileLinkPayload {
  mode: WorkspaceUserProfileLinkMode;
  target_user_id?: string | null;
  allowed_fields?: WorkspaceUserProfileLinkField[];
  prefill_existing_values?: boolean;
  requires_auth?: boolean;
  expires_at?: string | null;
  max_uses?: number | null;
}

export interface UpdateWorkspaceUserProfileLinkPayload {
  revoked?: boolean;
  expires_at?: string | null;
  max_uses?: number | null;
  allowed_fields?: WorkspaceUserProfileLinkField[];
  prefill_existing_values?: boolean;
  requires_auth?: boolean;
}

export interface SubmitUserProfileLinkPayload {
  fields: Record<string, string | null>;
}

export interface UserProfileLinkAvatarUploadUrl {
  signedUrl: string;
  token: string;
  path: string;
  publicUrl: string;
}

export async function listWorkspaceUserProfileLinks(
  workspaceId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ links: WorkspaceUserProfileLinkSummary[] }>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/user-profile-links`,
    {
      cache: 'no-store',
    }
  );
}

export async function listWorkspaceUserProfileLinkUsers(
  workspaceId: string,
  {
    limit = 20,
    q,
  }: {
    limit?: number;
    q?: string;
  } = {},
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<ListWorkspaceUserProfileLinkUsersResponse>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/user-profile-links/users`,
    {
      cache: 'no-store',
      query: {
        limit,
        q,
      },
    }
  );
}

export async function createWorkspaceUserProfileLink(
  workspaceId: string,
  payload: CreateWorkspaceUserProfileLinkPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ id: string; code: string }>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/user-profile-links`,
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

export async function updateWorkspaceUserProfileLink(
  workspaceId: string,
  linkId: string,
  payload: UpdateWorkspaceUserProfileLinkPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ message: string }>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/user-profile-links/${encodePathSegment(
      linkId
    )}`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      cache: 'no-store',
    }
  );
}

export async function deleteWorkspaceUserProfileLink(
  workspaceId: string,
  linkId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ message: string }>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/user-profile-links/${encodePathSegment(
      linkId
    )}`,
    {
      method: 'DELETE',
      cache: 'no-store',
    }
  );
}

export async function submitUserProfileLink(
  code: string,
  payload: SubmitUserProfileLinkPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ message: string }>(
    `/api/v1/public/user-profile-links/${encodePathSegment(code)}/submit`,
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

export async function createUserProfileLinkAvatarUploadUrl(
  code: string,
  contentType: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<UserProfileLinkAvatarUploadUrl>(
    `/api/v1/public/user-profile-links/${encodePathSegment(code)}/avatar`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ contentType }),
      cache: 'no-store',
    }
  );
}

export async function uploadUserProfileLinkAvatar(
  code: string,
  file: File,
  options?: InternalApiClientOptions
): Promise<{ publicUrl: string }> {
  const client = getInternalApiClient(options);
  const { signedUrl, publicUrl } = await createUserProfileLinkAvatarUploadUrl(
    code,
    file.type,
    options
  );

  const uploadResponse = await client.fetch(signedUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': file.type,
    },
    body: file,
    cache: 'no-store',
  });

  if (!uploadResponse.ok) {
    throw new Error('Failed to upload file');
  }

  return { publicUrl };
}
