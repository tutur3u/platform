import { useQuery } from '@tanstack/react-query';
import type { WorkspaceDataset } from '@tutur3u/types/db';

export function useWorkspaceDatasets(wsId: string) {
  return useQuery({
    queryKey: ['workspaces', wsId, 'datasets'],
    queryFn: async () => {
      const res = await fetch(`/api/v1/workspaces/${wsId}/datasets`);
      if (!res.ok) throw new Error('Failed to fetch datasets');
      return res.json() as Promise<WorkspaceDataset[]>;
    },
  });
}
