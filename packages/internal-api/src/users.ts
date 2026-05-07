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
}

export interface ListWorkspaceBasicUsersResponse {
  count: number;
  data: WorkspaceBasicUserRecord[];
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
  value: string,
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
  value: string,
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
