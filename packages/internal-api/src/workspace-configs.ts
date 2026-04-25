import {
  encodePathSegment,
  getInternalApiClient,
  type InternalApiClientOptions,
} from './client';

export const DATABASE_DEFAULT_EXCLUDED_GROUPS_CONFIG_ID =
  'DATABASE_DEFAULT_EXCLUDED_GROUPS';
export const DATABASE_DEFAULT_INCLUDED_GROUPS_CONFIG_ID =
  'DATABASE_DEFAULT_INCLUDED_GROUPS';
export const DATABASE_FEATURED_GROUPS_CONFIG_ID = 'DATABASE_FEATURED_GROUPS';
export const DATABASE_AUTO_ADD_NEW_GROUPS_TO_DEFAULT_INCLUDED_GROUPS_CONFIG_ID =
  'DATABASE_AUTO_ADD_NEW_GROUPS_TO_DEFAULT_INCLUDED_GROUPS';
export const ENABLE_GUEST_SELF_JOIN_FROM_WORKSPACE_USER_EMAIL_CONFIG_ID =
  'ENABLE_GUEST_SELF_JOIN_FROM_WORKSPACE_USER_EMAIL';
export const ENABLE_CMS_GAMES_CONFIG_ID = 'ENABLE_CMS_GAMES';

type WorkspaceConfigResponse = {
  value: string | null;
};

export function parseWorkspaceConfigIdList(
  value: string | null | undefined
): string[] {
  return (value || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export async function getWorkspaceConfig(
  workspaceId: string,
  configId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<WorkspaceConfigResponse>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/settings/${encodePathSegment(configId)}`,
    {
      cache: 'no-store',
    }
  );
}

export async function getOptionalWorkspaceConfig(
  workspaceId: string,
  configId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  const response = await client.fetch(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/settings/${encodePathSegment(configId)}`,
    {
      cache: 'no-store',
    }
  );

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    const fallbackMessage = `Internal API request failed: ${response.status}`;
    let message = fallbackMessage;

    try {
      const data = (await response.json()) as {
        error?: string;
        message?: string;
      };
      message = data.message || data.error || fallbackMessage;
    } catch {
      message = fallbackMessage;
    }

    throw new Error(message);
  }

  return (await response.json()) as WorkspaceConfigResponse;
}

export async function updateWorkspaceConfig(
  workspaceId: string,
  configId: string,
  value: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ message: string }>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/settings/${encodePathSegment(configId)}`,
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ value }),
    }
  );
}

export async function getWorkspaceConfigIdList(
  workspaceId: string,
  configId: string,
  options?: InternalApiClientOptions
) {
  const config = await getOptionalWorkspaceConfig(
    workspaceId,
    configId,
    options
  );
  return parseWorkspaceConfigIdList(config?.value);
}

export async function getWorkspaceUsersDatabaseFilterSettings(
  workspaceId: string,
  options?: InternalApiClientOptions
) {
  const [defaultIncludedGroupIds, defaultExcludedGroupIds, featuredGroupIds] =
    await Promise.all([
      getWorkspaceConfigIdList(
        workspaceId,
        DATABASE_DEFAULT_INCLUDED_GROUPS_CONFIG_ID,
        options
      ),
      getWorkspaceConfigIdList(
        workspaceId,
        DATABASE_DEFAULT_EXCLUDED_GROUPS_CONFIG_ID,
        options
      ),
      getWorkspaceConfigIdList(
        workspaceId,
        DATABASE_FEATURED_GROUPS_CONFIG_ID,
        options
      ),
    ]);

  return {
    defaultIncludedGroupIds,
    defaultExcludedGroupIds,
    featuredGroupIds,
  };
}
