import {
  encodePathSegment,
  getInternalApiClient,
  type InternalApiClientOptions,
} from './client';
import {
  DATABASE_DEFAULT_EXCLUDED_GROUPS_CONFIG_ID,
  DATABASE_DEFAULT_INCLUDED_GROUPS_CONFIG_ID,
  DATABASE_FEATURED_GROUPS_CONFIG_ID,
  WORKSPACE_USER_PROFILE_LINK_DEFAULT_CONFIG_IDS,
} from './workspace-config-ids';

export {
  ATTENDANCE_COUNT_MANAGERS_CONFIG_ID,
  ATTENDANCE_SHOW_MANAGERS_CONFIG_ID,
  DATABASE_AUTO_ADD_NEW_GROUPS_TO_DEFAULT_INCLUDED_GROUPS_CONFIG_ID,
  DATABASE_DEFAULT_EXCLUDED_GROUPS_CONFIG_ID,
  DATABASE_DEFAULT_INCLUDED_GROUPS_CONFIG_ID,
  DATABASE_FEATURED_GROUPS_CONFIG_ID,
  ENABLE_CMS_GAMES_CONFIG_ID,
  ENABLE_GUEST_SELF_JOIN_FROM_WORKSPACE_USER_EMAIL_CONFIG_ID,
  FINANCE_DEFAULT_RECONCILIATION_CATEGORY_CONFIG_ID,
  WORKSPACE_USER_PROFILE_LINK_DEFAULT_CONFIG_IDS,
  WORKSPACE_USER_PROFILE_LINK_DEFAULT_EXPIRATION_CONFIG_ID,
  WORKSPACE_USER_PROFILE_LINK_DEFAULT_FIELDS_CONFIG_ID,
  WORKSPACE_USER_PROFILE_LINK_DEFAULT_MAX_USES_CONFIG_ID,
  WORKSPACE_USER_PROFILE_LINK_DEFAULT_PREFILL_EXISTING_VALUES_CONFIG_ID,
  WORKSPACE_USER_PROFILE_LINK_DEFAULT_REQUIRE_AUTH_CONFIG_ID,
} from './workspace-config-ids';

type WorkspaceConfigResponse = {
  value: string | null;
};

export type WorkspaceConfigsResponse = Record<string, string | null>;

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

export async function getWorkspaceConfigs(
  workspaceId: string,
  configIds: readonly string[],
  options?: InternalApiClientOptions
) {
  const ids = [...new Set(configIds.map((id) => id.trim()).filter(Boolean))];

  if (ids.length === 0) {
    return {};
  }

  const client = getInternalApiClient(options);
  return client.json<WorkspaceConfigsResponse>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/settings/configs`,
    {
      cache: 'no-store',
      query: {
        ids: ids.join(','),
      },
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
    let message: string;

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

export async function getWorkspaceUserProfileLinkDefaultConfigs(
  workspaceId: string,
  options?: InternalApiClientOptions
) {
  return getWorkspaceConfigs(
    workspaceId,
    WORKSPACE_USER_PROFILE_LINK_DEFAULT_CONFIG_IDS,
    options
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
