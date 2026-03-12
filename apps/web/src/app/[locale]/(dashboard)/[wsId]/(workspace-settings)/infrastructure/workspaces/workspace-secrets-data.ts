'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { WorkspaceSecret } from '@tuturuuu/types/primitives/WorkspaceSecret';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';

export function workspaceSecretsQueryKey(workspaceId: string) {
  return ['workspace-secrets', workspaceId];
}

export function useWorkspaceSecrets(workspaceId: string) {
  const t = useTranslations('ws-overview');

  return useQuery({
    queryKey: workspaceSecretsQueryKey(workspaceId),
    queryFn: async () => {
      const res = await fetch(`/api/workspaces/${workspaceId}/secrets`, {
        cache: 'no-store',
      });

      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as {
          message?: string;
        } | null;
        throw new Error(payload?.message || t('secret_manager_load_error'));
      }

      return (await res.json()) as WorkspaceSecret[];
    },
  });
}

export function useDeleteWorkspaceSecret(workspaceId: string) {
  const t = useTranslations('ws-overview');
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (secret: WorkspaceSecret) => {
      const res = await fetch(
        `/api/workspaces/${workspaceId}/secrets/${secret.id}`,
        {
          method: 'DELETE',
        }
      );

      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as {
          message?: string;
        } | null;
        throw new Error(payload?.message || t('secret_manager_delete_error'));
      }
    },
    onSuccess: async (_, secret) => {
      await queryClient.invalidateQueries({
        queryKey: workspaceSecretsQueryKey(workspaceId),
      });
      toast.success(
        secret.name
          ? t('secret_manager_deleted_named', { name: secret.name })
          : t('secret_manager_deleted')
      );
    },
    onError: (err) => {
      toast.error(
        err instanceof Error ? err.message : t('secret_manager_delete_error')
      );
    },
  });
}

export function useUpsertWorkspaceSecret(workspaceId: string) {
  const t = useTranslations('ws-overview');
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      name,
      value,
    }: {
      id?: string;
      name: string;
      value: string;
    }) => {
      const res = await fetch(
        id
          ? `/api/workspaces/${workspaceId}/secrets/${id}`
          : `/api/workspaces/${workspaceId}/secrets`,
        {
          method: id ? 'PUT' : 'POST',
          body: JSON.stringify(
            id
              ? {
                  id,
                  name,
                  value,
                }
              : {
                  name,
                  value,
                }
          ),
        }
      );

      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as {
          message?: string;
        } | null;
        throw new Error(payload?.message || t('secret_manager_save_error'));
      }
    },
    onSuccess: async (_, payload) => {
      await queryClient.invalidateQueries({
        queryKey: workspaceSecretsQueryKey(workspaceId),
      });
      toast.success(
        payload.id
          ? t('secret_manager_saved_named', { name: payload.name })
          : t('secret_manager_created_named', { name: payload.name })
      );
    },
    onError: (err) => {
      toast.error(
        err instanceof Error ? err.message : t('secret_manager_save_error')
      );
    },
  });
}
