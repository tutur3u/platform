'use client';

import { useQuery } from '@tanstack/react-query';
import type { AiCreditStatus, AiFeature } from '@tuturuuu/ai/credits/types';
import { useMemo } from 'react';

const AI_CREDITS_QUERY_KEY = 'ai-credits';
const STALE_TIME = 30_000; // 30 seconds

/**
 * Fetches AI credit status for a workspace.
 * Uses TanStack Query with 30s staleTime to avoid excessive re-fetching.
 */
export function useAiCredits(wsId: string | undefined) {
  return useQuery<AiCreditStatus | null>({
    queryKey: [AI_CREDITS_QUERY_KEY, wsId],
    queryFn: async () => {
      if (!wsId) return null;
      const response = await fetch(`/api/v1/workspaces/${wsId}/ai/credits`);
      if (!response.ok) return null;
      return response.json();
    },
    staleTime: STALE_TIME,
    enabled: !!wsId,
  });
}

/**
 * Returns whether a specific AI feature can be used by the workspace.
 * Checks remaining credits and feature access from the credit status.
 */
export function useCanUseAiFeature(
  wsId: string | undefined,
  feature: AiFeature,
  modelId?: string
) {
  const { data: credits, isLoading } = useAiCredits(wsId);

  const canUse = useMemo(() => {
    if (!credits) return true; // Fail-open while loading
    if (credits.remaining <= 0) return false;
    if (
      credits.allowedFeatures.length > 0 &&
      !credits.allowedFeatures.includes(feature)
    ) {
      return false;
    }
    if (
      modelId &&
      credits.allowedModels.length > 0 &&
      !credits.allowedModels.includes(modelId)
    ) {
      return false;
    }
    return true;
  }, [credits, feature, modelId]);

  return { canUse, isLoading, credits };
}

export { AI_CREDITS_QUERY_KEY };
