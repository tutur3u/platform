'use client';

import { matchesAllowedModel } from '@tuturuuu/ai/credits/model-mapping';
import type {
  HiveAiCreditStatus,
  HiveCreditSource,
} from '@tuturuuu/internal-api/hive';
import type { AIModelUI, InternalApiWorkspaceSummary } from '@tuturuuu/types';
import { useEffect, useMemo } from 'react';
import {
  useHiveAiCredits,
  useHiveAiModels,
  useHiveWorkspaces,
} from '@/hooks/use-hive-data';
import {
  isNullableString,
  useHivePersistedState,
} from './use-hive-persisted-state';

const FALLBACK_MODEL_ID = 'google/gemini-2.5-flash-lite';

function isCreditSource(value: unknown): value is HiveCreditSource {
  return value === 'personal' || value === 'workspace';
}

function toModelUi(modelId: string): AIModelUI {
  const provider = modelId.includes('/')
    ? (modelId.split('/')[0] ?? 'google')
    : 'google';

  return {
    label: modelId.includes('/')
      ? modelId.split('/').slice(1).join('/')
      : modelId,
    provider,
    value: modelId,
  };
}

function resolveDefaultWorkspace(input: {
  personalWorkspaceId?: string | null;
  workspaces: InternalApiWorkspaceSummary[];
}) {
  return (
    input.personalWorkspaceId ??
    input.workspaces.find((workspace) => workspace.personal)?.id ??
    input.workspaces[0]?.id ??
    null
  );
}

export type HiveAiRunContext = {
  creditSource: HiveCreditSource;
  creditWsId: string;
  model: string;
};

export type HiveAiContextState = {
  activeCreditSource: HiveCreditSource;
  aiRunContext: HiveAiRunContext | null;
  creditWsId: string | null;
  credits: HiveAiCreditStatus | null;
  isLoading: boolean;
  model: AIModelUI;
  models: AIModelUI[];
  personalWorkspaceId: string | null;
  selectedWorkspace: InternalApiWorkspaceSummary | null;
  selectedWorkspaceCredits: HiveAiCreditStatus | null;
  setCreditSource: (source: HiveCreditSource) => void;
  setModelId: (modelId: string) => void;
  setWorkspaceId: (workspaceId: string | null) => void;
  workspaceCreditLocked: boolean;
  workspaceId: string | null;
  workspaces: InternalApiWorkspaceSummary[];
};

export function useHiveAiContext(): HiveAiContextState {
  const workspacesQuery = useHiveWorkspaces();
  const modelsQuery = useHiveAiModels();
  const workspaces = workspacesQuery.data?.workspaces ?? [];
  const personalWorkspaceId = workspacesQuery.data?.personalWorkspaceId ?? null;
  const defaultWorkspaceId = resolveDefaultWorkspace({
    personalWorkspaceId,
    workspaces,
  });
  const [workspaceId, setWorkspaceId] = useHivePersistedState<string | null>(
    'hive.ai.workspaceId',
    defaultWorkspaceId,
    { validate: isNullableString }
  );
  const [creditSource, setCreditSource] =
    useHivePersistedState<HiveCreditSource>(
      'hive.ai.creditSource',
      'workspace',
      { validate: isCreditSource }
    );
  const [modelId, setModelId] = useHivePersistedState<string | null>(
    'hive.ai.modelId',
    FALLBACK_MODEL_ID,
    { validate: isNullableString }
  );

  useEffect(() => {
    if (!defaultWorkspaceId) return;
    const hasWorkspace = workspaces.some(
      (workspace) => workspace.id === workspaceId
    );
    if (!workspaceId || !hasWorkspace) {
      setWorkspaceId(defaultWorkspaceId);
    }
  }, [defaultWorkspaceId, setWorkspaceId, workspaceId, workspaces]);

  const selectedWorkspace =
    workspaces.find((workspace) => workspace.id === workspaceId) ?? null;
  const selectedWorkspaceCreditsQuery = useHiveAiCredits(workspaceId);
  const workspaceCreditLocked =
    selectedWorkspace?.personal === true ||
    selectedWorkspaceCreditsQuery.data?.tier === 'FREE';
  const activeCreditSource = workspaceCreditLocked ? 'personal' : creditSource;
  const creditWsId =
    activeCreditSource === 'personal' ? personalWorkspaceId : workspaceId;
  const creditsQuery = useHiveAiCredits(creditWsId);
  const defaultLanguageModelId =
    creditsQuery.data?.defaultLanguageModel ?? FALLBACK_MODEL_ID;
  const models = modelsQuery.data?.models ?? [];

  useEffect(() => {
    if (!creditsQuery.data) return;
    const currentModel = modelId ?? defaultLanguageModelId;
    const isAllowed = matchesAllowedModel(
      currentModel,
      creditsQuery.data.allowedModels
    );

    if (!isAllowed || !currentModel) {
      setModelId(defaultLanguageModelId);
    }
  }, [creditsQuery.data, defaultLanguageModelId, modelId, setModelId]);

  const model = useMemo(() => {
    const selectedModelId = modelId ?? defaultLanguageModelId;
    return (
      models.find((candidate) => candidate.value === selectedModelId) ??
      toModelUi(selectedModelId)
    );
  }, [defaultLanguageModelId, modelId, models]);

  return {
    activeCreditSource,
    aiRunContext:
      creditWsId && model.value
        ? {
            creditSource: activeCreditSource,
            creditWsId,
            model: model.value,
          }
        : null,
    creditWsId,
    credits: creditsQuery.data ?? null,
    isLoading:
      workspacesQuery.isLoading ||
      modelsQuery.isLoading ||
      creditsQuery.isLoading,
    model,
    models,
    personalWorkspaceId,
    selectedWorkspace,
    selectedWorkspaceCredits: selectedWorkspaceCreditsQuery.data ?? null,
    setCreditSource,
    setModelId,
    setWorkspaceId,
    workspaceCreditLocked,
    workspaceId,
    workspaces,
  };
}
