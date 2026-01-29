import { useQuery } from '@tanstack/react-query';

export const useWorkspaceConfig = <T>(
  wsId: string,
  configId: string,
  defaultValue?: T
) => {
  return useQuery({
    queryKey: ['workspace-config', wsId, configId],
    queryFn: async () => {
      const res = await fetch(
        `/api/v1/workspaces/${wsId}/settings/${configId}`
      );
      if (!res.ok) {
        if (res.status === 404) {
          return defaultValue;
        }
        throw new Error('Failed to fetch workspace config');
      }
      const data = await res.json();
      // The API returns { value: ... }
      return (data.value as T) ?? defaultValue;
    },
    enabled: !!wsId && !!configId,
    staleTime: 30_000,
    placeholderData: (previousData) => previousData,
  });
};

export const useWorkspaceConfigs = (wsId: string, configIds: string[]) => {
  return useQuery({
    queryKey: ['workspace-configs', wsId, configIds],
    queryFn: async () => {
      const res = await fetch(
        `/api/v1/workspaces/${wsId}/settings/configs?ids=${configIds.join(',')}`
      );
      if (!res.ok) {
        throw new Error('Failed to fetch workspace configs');
      }
      return res.json() as Promise<Record<string, string | null>>;
    },
    enabled: !!wsId && configIds.length > 0,
    staleTime: 30_000,
    placeholderData: (previousData) => previousData,
  });
};
