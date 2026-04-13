import {
  encodePathSegment,
  getInternalApiClient,
  type InternalApiClientOptions,
} from './client';

type UserConfigResponse = {
  value: string | null;
};

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

export type UpdateCurrentUserDefaultWorkspaceResponse = {
  success: boolean;
};

type CurrentUserAvatarUploadUrlResponse = {
  uploadUrl: string;
  publicUrl: string;
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

export async function getCurrentUserProfile(
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<CurrentUserProfileResponse>('/api/v1/users/me/profile', {
    cache: 'no-store',
  });
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
) {
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

  await updateCurrentUserProfile({ avatar_url: publicUrl }, options);

  return { publicUrl };
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
