'use client';

import { useQuery } from '@tanstack/react-query';
import {
  getWorkspaceExternalProjectStudio,
  type InternalApiClientOptions,
} from '@tuturuuu/internal-api';
import type {
  ExternalProjectStudioData,
  WorkspaceExternalProjectBinding,
} from '@tuturuuu/types';

export type EpmStudioQueryData = {
  binding: WorkspaceExternalProjectBinding;
} & ExternalProjectStudioData;

export function getEpmStudioQueryKey(workspaceId: string) {
  return ['epm-studio', workspaceId] as const;
}

export function useEpmStudio({
  fetch,
  initialData,
  workspaceId,
}: {
  initialData?: EpmStudioQueryData;
  workspaceId: string;
} & Pick<InternalApiClientOptions, 'fetch'>) {
  return useQuery({
    gcTime: 10 * 60_000,
    initialData,
    queryFn: async () =>
      getWorkspaceExternalProjectStudio(workspaceId, { fetch }),
    queryKey: getEpmStudioQueryKey(workspaceId),
    refetchOnWindowFocus: false,
    retry: false,
    staleTime: 60_000,
  });
}
