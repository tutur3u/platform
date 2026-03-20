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
};

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
