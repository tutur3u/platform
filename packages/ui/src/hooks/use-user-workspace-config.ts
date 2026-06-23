'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getUserWorkspaceConfig,
  updateUserWorkspaceConfig,
} from '@tuturuuu/internal-api/users';

export function getUserWorkspaceConfigQueryKey(
  workspaceId: string,
  configId: string
) {
  return ['user-workspace-config', workspaceId, configId] as const;
}

export function useUserWorkspaceConfig(
  workspaceId: string,
  configId: string,
  defaultValue: string | null = null,
  options?: {
    enabled?: boolean;
    staleTime?: number;
  }
) {
  return useQuery({
    queryKey: getUserWorkspaceConfigQueryKey(workspaceId, configId),
    queryFn: async () => {
      const data = await getUserWorkspaceConfig(workspaceId, configId);
      return data.value ?? defaultValue;
    },
    enabled: options?.enabled !== false && Boolean(workspaceId && configId),
    staleTime: options?.staleTime ?? 5 * 60 * 1000,
  });
}

export function useUpdateUserWorkspaceConfig() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      configId,
      value,
      workspaceId,
    }: {
      configId: string;
      value: string | null;
      workspaceId: string;
    }) => updateUserWorkspaceConfig(workspaceId, configId, value),
    onMutate: async ({ configId, value, workspaceId }) => {
      const queryKey = getUserWorkspaceConfigQueryKey(workspaceId, configId);
      await queryClient.cancelQueries({ queryKey });

      const previousValue = queryClient.getQueryData<string | null>(queryKey);
      queryClient.setQueryData(queryKey, value);

      return { configId, previousValue, workspaceId };
    },
    onError: (_error, _variables, context) => {
      if (!context) return;

      queryClient.setQueryData(
        getUserWorkspaceConfigQueryKey(context.workspaceId, context.configId),
        context.previousValue ?? null
      );
    },
    onSettled: (_data, _error, variables) => {
      queryClient.invalidateQueries({
        queryKey: getUserWorkspaceConfigQueryKey(
          variables.workspaceId,
          variables.configId
        ),
      });
    },
  });
}
