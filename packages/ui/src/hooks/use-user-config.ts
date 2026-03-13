'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getUserConfig, updateUserConfig } from '@tuturuuu/internal-api/users';

/**
 * Hook to fetch and manage a user config value.
 * Uses TanStack Query for caching and optimistic updates.
 *
 * @param configId - The configuration key to fetch
 * @param defaultValue - Default value if config doesn't exist
 * @returns Query result with the config value
 */
export function useUserConfig(configId: string, defaultValue: string = '') {
  return useQuery({
    queryKey: ['user-config', configId],
    queryFn: async () => {
      const data = await getUserConfig(configId);
      return (data.value as string) ?? defaultValue;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Hook to update a user config value.
 * Uses optimistic updates for immediate UI feedback.
 *
 * @returns Mutation function and state
 */
export function useUpdateUserConfig() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      configId,
      value,
    }: {
      configId: string;
      value: string;
    }) => {
      return updateUserConfig(configId, value);
    },
    onMutate: async ({ configId, value }) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['user-config', configId] });

      // Snapshot previous value
      const previousValue = queryClient.getQueryData(['user-config', configId]);

      // Optimistically update
      queryClient.setQueryData(['user-config', configId], value);

      return { previousValue, configId };
    },
    onError: (_error, _variables, context) => {
      // Rollback on error
      if (context?.previousValue !== undefined) {
        queryClient.setQueryData(
          ['user-config', context.configId],
          context.previousValue
        );
      }
    },
    onSettled: (_data, _error, variables) => {
      // Invalidate to refetch
      queryClient.invalidateQueries({
        queryKey: ['user-config', variables.configId],
      });
    },
  });
}

/**
 * Convenience hook for boolean user configs.
 * Parses "true"/"false" strings to boolean values.
 *
 * @param configId - The configuration key
 * @param defaultValue - Default boolean value (defaults to false)
 * @returns Object with boolean value and toggle function
 */
export function useUserBooleanConfig(
  configId: string,
  defaultValue: boolean = false
) {
  const { data: rawValue, isLoading } = useUserConfig(
    configId,
    defaultValue ? 'true' : 'false'
  );
  const updateConfig = useUpdateUserConfig();

  const value = rawValue === 'true';

  const setValue = (newValue: boolean) => {
    updateConfig.mutate({ configId, value: newValue ? 'true' : 'false' });
  };

  const toggle = () => {
    setValue(!value);
  };

  return {
    value,
    setValue,
    toggle,
    isLoading,
    isPending: updateConfig.isPending,
  };
}
