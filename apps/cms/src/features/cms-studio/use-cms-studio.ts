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

export type CmsStudioQueryData = {
  binding: WorkspaceExternalProjectBinding;
} & ExternalProjectStudioData;

export function getCmsStudioQueryKey(workspaceId: string) {
  return ['cms-studio', workspaceId] as const;
}

export function useCmsStudio({
  fetch,
  initialData,
  workspaceId,
}: {
  initialData?: CmsStudioQueryData;
  workspaceId: string;
} & Pick<InternalApiClientOptions, 'fetch'>) {
  return useQuery({
    gcTime: 10 * 60_000,
    initialData,
    queryFn: async () =>
      getWorkspaceExternalProjectStudio(workspaceId, { fetch }),
    queryKey: getCmsStudioQueryKey(workspaceId),
    refetchOnWindowFocus: false,
    retry: false,
    staleTime: 60_000,
  });
}
