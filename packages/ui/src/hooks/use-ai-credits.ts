'use client';

import { useQuery } from '@tanstack/react-query';
import type { AiCreditStatus, AiFeature } from '@tuturuuu/ai/credits/types';
import { useMemo } from 'react';

const AI_CREDITS_QUERY_KEY = 'ai-credits';
const STALE_TIME = 30_000; // 30 seconds

function matchesAllowedModel(modelName: string, allowedModels: string[]) {
  if (allowedModels.length === 0) return true;

  return allowedModels.some((allowedModel) =>
    allowedModel.includes('/')
      ? allowedModel === modelName
      : modelName === allowedModel || modelName.endsWith(`/${allowedModel}`)
  );
}

/**
 * Fetches AI credit status for a workspace.
 * Uses TanStack Query with 30s staleTime to avoid excessive re-fetching.
 */
export function useAiCredits(wsId: string | undefined) {
  return useQuery<AiCreditStatus | null>({
    queryKey: [AI_CREDITS_QUERY_KEY, wsId],
    queryFn: async () => {
      if (!wsId) return null;
      const response = await fetch(`/api/v1/workspaces/${wsId}/ai/credits`, {
        cache: 'no-store',
      });
      if (!response.ok) return null;
      return response.json();
    },
    staleTime: STALE_TIME,
    enabled: !!wsId,
  });
}

/**
 * Returns whether a specific AI feature can be used by the workspace.
 * Checks remaining credits, overflow status, and feature access.
 */
export function useCanUseAiFeature(
  wsId: string | undefined,
  feature: AiFeature,
  modelId?: string
) {
  const { data: credits, isLoading } = useAiCredits(wsId);

  const isOverdrawn = useMemo(
    () => (credits ? credits.remaining < 0 : false),
    [credits]
  );

  const canUse = useMemo(() => {
    if (!credits) return null; // null = loading/unknown, let consumer decide
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
      !matchesAllowedModel(modelId, credits.allowedModels)
    ) {
      return false;
    }
    return true;
  }, [credits, feature, modelId]);

  return { canUse, isLoading, credits, isOverdrawn };
}

export { AI_CREDITS_QUERY_KEY };
