import { useQuery } from '@tanstack/react-query';
import { getOptionalWorkspaceConfig } from '@tuturuuu/internal-api/workspace-configs';
import { useTranslations } from 'next-intl';

export const USER_STATUS_LABELS_CONFIG_ID = 'user_status_labels';

export interface UserStatusLabels {
  archived: string;
  archived_until: string;
  permanently_archived: string;
}

export const USER_STATUS_LABEL_KEYS = [
  'archived',
  'archived_until',
  'permanently_archived',
] as const satisfies readonly (keyof UserStatusLabels)[];

export function userStatusLabelsQueryKey(wsId: string) {
  return ['workspace-config', wsId, USER_STATUS_LABELS_CONFIG_ID] as const;
}

/** Parses the stored config value, keeping only non-empty string labels. */
export function parseUserStatusLabels(
  value: string | null | undefined
): Partial<UserStatusLabels> {
  if (!value) return {};

  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object') return {};

    const labels: Partial<UserStatusLabels> = {};
    for (const key of USER_STATUS_LABEL_KEYS) {
      const label = (parsed as Record<string, unknown>)[key];
      if (typeof label === 'string' && label.trim()) labels[key] = label;
    }
    return labels;
  } catch (error) {
    console.error('Failed to parse user status labels config', error);
    return {};
  }
}

export function useDefaultUserStatusLabels(): UserStatusLabels {
  const t = useTranslations('ws-users');

  return {
    archived: t('status_archived'),
    archived_until: t('status_archived_until'),
    permanently_archived: t('archived_user'),
  };
}

/** The workspace's saved label overrides, without defaults applied. */
export function useUserStatusLabelOverrides(wsId: string) {
  return useQuery({
    queryKey: userStatusLabelsQueryKey(wsId),
    queryFn: async () => {
      const config = await getOptionalWorkspaceConfig(
        wsId,
        USER_STATUS_LABELS_CONFIG_ID
      );
      return parseUserStatusLabels(config?.value);
    },
    enabled: Boolean(wsId),
    staleTime: 5 * 60 * 1000,
  });
}

export function useUserStatusLabels(wsId: string): UserStatusLabels {
  const defaults = useDefaultUserStatusLabels();
  const { data: overrides } = useUserStatusLabelOverrides(wsId);

  return { ...defaults, ...overrides };
}
