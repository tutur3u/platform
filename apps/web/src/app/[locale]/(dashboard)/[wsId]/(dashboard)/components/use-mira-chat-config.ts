'use client';

import { useQuery } from '@tanstack/react-query';
import { DefaultChatTransport } from '@tuturuuu/ai/core';
import {
  matchesAllowedModel,
  normalizeStableModelId,
} from '@tuturuuu/ai/credits/model-mapping';
import { getWorkspace } from '@tuturuuu/internal-api/workspaces';
import type { AIModelUI } from '@tuturuuu/types';
import { useAiCredits } from '@tuturuuu/ui/hooks/use-ai-credits';
import { resolveTimezone } from '@tuturuuu/utils/calendar-settings-resolver';
import { normalizeWorkspaceContextId } from '@tuturuuu/utils/constants';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CREDIT_SOURCE_STORAGE_KEY_PREFIX,
  type CreditSource,
  INITIAL_MODEL,
  MODEL_STORAGE_KEY_PREFIX,
  THINKING_MODE_STORAGE_KEY_PREFIX,
  type ThinkingMode,
  WORKSPACE_CONTEXT_EVENT,
  WORKSPACE_CONTEXT_STORAGE_KEY_PREFIX,
} from './mira-chat-constants';
import {
  fetchGatewayModels,
  type GatewayModelUi,
  MIRA_GATEWAY_MODELS_QUERY_KEY,
  modelSupportsFileInput,
} from './mira-gateway-models';
import { getMiraTempAuthHeaders } from './mira-temp-auth-client';

interface UseMiraChatConfigParams {
  wsId: string;
  taskBoardContext?: MiraTaskBoardContext;
}

export interface MiraTaskBoardContext {
  workspaceId?: string;
  workspaceName?: string;
  boardId: string;
  boardName?: string;
  selectedList?: {
    id: string;
    name?: string | null;
    status?: string | null;
    position?: number | null;
  } | null;
  lists: Array<{
    id: string;
    name?: string | null;
    status?: string | null;
    position?: number | null;
  }>;
}

export function getEffectiveMiraWorkspaceContextId({
  taskBoardContext,
  workspaceContextId,
}: {
  taskBoardContext?: Pick<MiraTaskBoardContext, 'workspaceId'>;
  workspaceContextId: string;
}) {
  return normalizeWorkspaceContextId(
    taskBoardContext?.workspaceId ?? workspaceContextId
  );
}

function toModelUi(modelId: string): AIModelUI {
  const stableModelId = normalizeStableModelId(modelId);
  const provider = stableModelId.includes('/')
    ? (stableModelId.split('/')[0] ?? 'google')
    : 'google';
  const label = stableModelId.includes('/')
    ? stableModelId.split('/').slice(1).join('/')
    : stableModelId;

  return {
    value: stableModelId,
    provider,
    label,
  };
}

export function resolveInitialThinkingMode(
  stored: string | null
): ThinkingMode {
  void stored;
  return 'fast';
}

export function resolveAvailableMiraModel({
  allowedModels,
  defaultLanguageModelId,
  gatewayModels,
  selectedModel,
}: {
  allowedModels: string[];
  defaultLanguageModelId: string;
  gatewayModels: GatewayModelUi[] | undefined;
  selectedModel: AIModelUI;
}): AIModelUI {
  if (!gatewayModels) return selectedModel;

  const findSelectableModel = (modelId: string) => {
    const stableModelId = normalizeStableModelId(modelId);
    return gatewayModels.find(
      (gatewayModel) =>
        !gatewayModel.disabled &&
        normalizeStableModelId(gatewayModel.value) === stableModelId &&
        matchesAllowedModel(gatewayModel.value, allowedModels)
    );
  };

  return (
    findSelectableModel(selectedModel.value) ??
    findSelectableModel(defaultLanguageModelId) ??
    gatewayModels.find(
      (gatewayModel) =>
        !gatewayModel.disabled &&
        matchesAllowedModel(gatewayModel.value, allowedModels)
    ) ??
    toModelUi(defaultLanguageModelId)
  );
}

export function useMiraChatConfig({
  wsId,
  taskBoardContext,
}: UseMiraChatConfigParams) {
  const [selectedModel, setSelectedModel] = useState<AIModelUI>(INITIAL_MODEL);
  const [thinkingMode, setThinkingMode] = useState<ThinkingMode>('fast');
  const [creditSource, setCreditSource] = useState<CreditSource>('workspace');
  const [workspaceContextId, setWorkspaceContextId] =
    useState<string>('personal');

  const { data: userCalendarSettings } = useQuery({
    queryKey: ['users', 'calendar-settings'],
    queryFn: async () => {
      const res = await fetch('/api/v1/users/calendar-settings', {
        cache: 'no-store',
      });
      if (!res.ok) return null;
      return (await res.json()) as { timezone?: string | null };
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: workspaceCalendarSettings } = useQuery({
    queryKey: ['workspace-calendar-settings', wsId],
    queryFn: async () => {
      const res = await fetch(`/api/v1/workspaces/${wsId}/calendar-settings`, {
        cache: 'no-store',
      });
      if (!res.ok) return null;
      return (await res.json()) as { timezone?: string | null };
    },
    enabled: !!wsId,
    staleTime: 5 * 60 * 1000,
  });

  const timezoneForChat = useMemo(
    () =>
      resolveTimezone(
        userCalendarSettings ?? null,
        workspaceCalendarSettings ?? null
      ),
    [userCalendarSettings, workspaceCalendarSettings]
  );

  const { data: workspaceCredits } = useAiCredits(wsId);

  const { data: personalWorkspaceId } = useQuery<string | null>({
    queryKey: ['personal-workspace-id'],
    queryFn: async () => {
      try {
        const workspace = await getWorkspace('personal');
        return workspace.id ?? null;
      } catch {
        return null;
      }
    },
    staleTime: 5 * 60 * 1000,
  });

  const isPersonalDashboardWorkspace =
    !!personalWorkspaceId && personalWorkspaceId === wsId;
  const workspaceCreditLocked =
    isPersonalDashboardWorkspace || workspaceCredits?.tier === 'FREE';

  const activeCreditSource: CreditSource = workspaceCreditLocked
    ? 'personal'
    : creditSource;
  const creditWsId =
    activeCreditSource === 'personal'
      ? (personalWorkspaceId ?? undefined)
      : wsId;

  const { data: creditCredits } = useAiCredits(creditWsId);
  const defaultLanguageModelId =
    creditCredits?.defaultLanguageModel ?? INITIAL_MODEL.value;

  const { data: gatewayModels } = useQuery({
    queryKey: MIRA_GATEWAY_MODELS_QUERY_KEY,
    queryFn: fetchGatewayModels,
    staleTime: 5 * 60 * 1000,
  });

  const model = useMemo(() => {
    return resolveAvailableMiraModel({
      allowedModels: creditCredits?.allowedModels ?? [],
      defaultLanguageModelId,
      gatewayModels,
      selectedModel,
    });
  }, [
    creditCredits?.allowedModels,
    defaultLanguageModelId,
    gatewayModels,
    selectedModel,
  ]);

  const supportsFileInput = useMemo(
    () => modelSupportsFileInput(model),
    [model]
  );

  // model.value is already the gateway ID (e.g. "google/gemini-2.5-flash")
  const gatewayModelId = model.value;
  const effectiveWorkspaceContextId = getEffectiveMiraWorkspaceContextId({
    taskBoardContext,
    workspaceContextId,
  });

  const chatRequestBody = useMemo(
    () => ({
      wsId,
      workspaceContextId: effectiveWorkspaceContextId,
      model: gatewayModelId,
      isMiraMode: true,
      timezone: timezoneForChat,
      thinkingMode,
      creditSource: activeCreditSource,
      ...(creditWsId ? { creditWsId } : {}),
      ...(taskBoardContext ? { taskBoardContext } : {}),
    }),
    [
      activeCreditSource,
      creditWsId,
      effectiveWorkspaceContextId,
      gatewayModelId,
      taskBoardContext,
      thinkingMode,
      timezoneForChat,
      wsId,
    ]
  );
  const chatRequestBodyRef = useRef(chatRequestBody);
  chatRequestBodyRef.current = chatRequestBody;
  const skipNextPersistenceRef = useRef(false);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: '/api/ai/chat',
        credentials: 'include',
        headers: () => getMiraTempAuthHeaders(chatRequestBodyRef.current),
        body: () => chatRequestBodyRef.current,
      }),
    []
  );

  // Restore model from localStorage on mount
  useEffect(() => {
    const key = `${MODEL_STORAGE_KEY_PREFIX}${wsId}`;
    const stored = localStorage.getItem(key);
    if (!stored) {
      setSelectedModel(toModelUi(defaultLanguageModelId));
      skipNextPersistenceRef.current = true;
      return;
    }
    try {
      const parsed = JSON.parse(stored) as {
        value: string;
        provider: string;
        label?: string;
      };
      if (parsed.value && parsed.provider) {
        const stableValue = normalizeStableModelId(parsed.value);
        setSelectedModel({
          value: stableValue,
          provider: parsed.provider,
          label:
            parsed.label?.replace(
              'gemini-3.1-flash-lite-preview',
              'gemini-3.1-flash-lite'
            ) ??
            stableValue.split('/').pop() ??
            stableValue,
        });
      } else {
        setSelectedModel(toModelUi(defaultLanguageModelId));
      }
      skipNextPersistenceRef.current = true;
    } catch {
      // Corrupt data — ignore and use default
      setSelectedModel(toModelUi(defaultLanguageModelId));
      skipNextPersistenceRef.current = true;
    }
  }, [defaultLanguageModelId, wsId]);

  useEffect(() => {
    if (!creditCredits) return;

    const nextDefaultModel = toModelUi(defaultLanguageModelId);
    const isCurrentModelAllowed = matchesAllowedModel(
      model.value,
      creditCredits.allowedModels
    );

    if (!model.value || !isCurrentModelAllowed) {
      setSelectedModel(nextDefaultModel);
      return;
    }

    if (
      creditCredits.allowedModels.length === 0 &&
      model.value === INITIAL_MODEL.value &&
      defaultLanguageModelId !== INITIAL_MODEL.value
    ) {
      setSelectedModel(nextDefaultModel);
    }
  }, [creditCredits, defaultLanguageModelId, model.value]);

  // Persist model to localStorage on change
  useEffect(() => {
    if (skipNextPersistenceRef.current) {
      skipNextPersistenceRef.current = false;
      return;
    }
    localStorage.setItem(
      `${MODEL_STORAGE_KEY_PREFIX}${wsId}`,
      JSON.stringify({ value: model.value, provider: model.provider })
    );
  }, [model.provider, model.value, wsId]);

  useEffect(() => {
    const key = `${THINKING_MODE_STORAGE_KEY_PREFIX}${wsId}`;
    const stored = localStorage.getItem(key);
    setThinkingMode(resolveInitialThinkingMode(stored));
  }, [wsId]);

  useEffect(() => {
    localStorage.setItem(
      `${THINKING_MODE_STORAGE_KEY_PREFIX}${wsId}`,
      thinkingMode
    );
  }, [thinkingMode, wsId]);

  useEffect(() => {
    const key = `${CREDIT_SOURCE_STORAGE_KEY_PREFIX}${wsId}`;
    const stored = localStorage.getItem(key);
    if (stored === 'workspace' || stored === 'personal') {
      setCreditSource(stored);
      return;
    }
    setCreditSource('workspace');
  }, [wsId]);

  useEffect(() => {
    localStorage.setItem(
      `${CREDIT_SOURCE_STORAGE_KEY_PREFIX}${wsId}`,
      creditSource
    );
  }, [creditSource, wsId]);

  useEffect(() => {
    if (!workspaceCreditLocked) return;
    setCreditSource((prev) => (prev === 'personal' ? prev : 'personal'));
  }, [workspaceCreditLocked]);

  useEffect(() => {
    const key = `${WORKSPACE_CONTEXT_STORAGE_KEY_PREFIX}${wsId}`;
    const stored = localStorage.getItem(key);
    setWorkspaceContextId(normalizeWorkspaceContextId(stored));

    // Listen for external workspace context changes (e.g. from the selector badge)
    const handleWorkspaceContextChange = (event: Event) => {
      const detail = (
        event as CustomEvent<{
          wsId?: string;
          workspaceContextId?: string;
        }>
      ).detail;
      if (detail?.wsId !== wsId) return;
      const next = normalizeWorkspaceContextId(detail.workspaceContextId);
      setWorkspaceContextId(next);
    };

    window.addEventListener(
      WORKSPACE_CONTEXT_EVENT,
      handleWorkspaceContextChange
    );
    return () => {
      window.removeEventListener(
        WORKSPACE_CONTEXT_EVENT,
        handleWorkspaceContextChange
      );
    };
  }, [wsId]);

  useEffect(() => {
    const nextWorkspaceContextId =
      normalizeWorkspaceContextId(workspaceContextId);
    localStorage.setItem(
      `${WORKSPACE_CONTEXT_STORAGE_KEY_PREFIX}${wsId}`,
      nextWorkspaceContextId
    );
    window.dispatchEvent(
      new CustomEvent(WORKSPACE_CONTEXT_EVENT, {
        detail: { wsId, workspaceContextId: nextWorkspaceContextId },
      })
    );
  }, [workspaceContextId, wsId]);

  return {
    activeCreditSource,
    chatRequestBody,
    creditWsId,
    gatewayModelId,
    isPersonalDashboardWorkspace,
    model,
    personalWorkspaceId,
    setCreditSource,
    setModel: setSelectedModel,
    supportsFileInput,
    thinkingMode,
    setThinkingMode,
    workspaceContextId,
    setWorkspaceContextId,
    transport,
    workspaceCreditLocked,
  };
}
