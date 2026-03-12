import {
  createInternalApiClient,
  type InternalApiClientOptions,
  internalApiClient,
} from './client';

type UserConfigResponse = {
  value: string | null;
};

function getClient(options?: InternalApiClientOptions) {
  return options ? createInternalApiClient(options) : internalApiClient;
}

export async function getUserConfig(
  configId: string,
  options?: InternalApiClientOptions
) {
  const client = getClient(options);
  return client.json<UserConfigResponse>(
    `/api/v1/users/me/configs/${configId}`,
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
  const client = getClient(options);
  return client.json<{ message: string }>(
    `/api/v1/users/me/configs/${configId}`,
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ value }),
    }
  );
}
