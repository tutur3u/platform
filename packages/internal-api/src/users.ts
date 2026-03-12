import {
  encodePathSegment,
  getInternalApiClient,
  type InternalApiClientOptions,
} from './client';

type UserConfigResponse = {
  value: string | null;
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
