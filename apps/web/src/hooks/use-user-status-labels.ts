import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';

export interface UserStatusLabels {
  archived: string;
  archived_until: string;
  permanently_archived: string;
}

export function useUserStatusLabels(wsId: string) {
  const t = useTranslations('ws-users');

  const defaults: UserStatusLabels = {
    archived: t('status_archived'),
    archived_until: t('status_archived_until'),
    permanently_archived: t('archived_user'),
  };

  const { data: labels } = useQuery({
    queryKey: ['workspace-config', wsId, 'user_status_labels'],
    queryFn: async () => {
      const res = await fetch(
        `/api/v1/workspaces/${wsId}/settings/user_status_labels`
      );
      if (!res.ok) return null;
      const data = await res.json();
      try {
        // The API returns { id, ws_id, value, ... }
        // value is a stringified JSON
        if (data.value) {
          return JSON.parse(data.value) as Partial<UserStatusLabels>;
        }
      } catch (e) {
        console.error('Failed to parse user status labels config', e);
      }
      return null;
    },
    staleTime: 5 * 60 * 1000,
  });

  return { ...defaults, ...labels };
}
