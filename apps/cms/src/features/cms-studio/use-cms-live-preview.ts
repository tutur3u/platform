'use client';

import { useQuery } from '@tanstack/react-query';
import {
  getWorkspaceExternalProjectDelivery,
  type InternalApiClientOptions,
} from '@tuturuuu/internal-api';

type UseExternalProjectLivePreviewOptions = {
  enabled: boolean;
  refreshToken: number;
  selectedEntryId: string | null;
  workspaceId: string;
} & Pick<InternalApiClientOptions, 'fetch'>;

export function useCmsLivePreview({
  enabled,
  fetch,
  refreshToken,
  selectedEntryId,
  workspaceId,
}: UseExternalProjectLivePreviewOptions) {
  return useQuery({
    enabled,
    queryFn: async () =>
      getWorkspaceExternalProjectDelivery(workspaceId, true, { fetch }),
    queryKey: [
      'external-project-live-preview',
      workspaceId,
      selectedEntryId ?? 'none',
      refreshToken,
    ],
    retry: false,
    staleTime: 0,
  });
}
