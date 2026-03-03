'use client';

import { useQuery } from '@tanstack/react-query';
import { DefaultChatTransport } from '@tuturuuu/ai/core';
import { createClient } from '@tuturuuu/supabase/next/client';
import type { AIModelUI } from '@tuturuuu/types';
import { useAiCredits } from '@tuturuuu/ui/hooks/use-ai-credits';
import { normalizeWorkspaceContextId } from '@tuturuuu/utils/constants';
import { useEffect, useMemo, useRef, useState } from 'react';
import { resolveTimezone } from '@/lib/calendar-settings-resolver';
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

interface UseMiraChatConfigParams {
  wsId: string;
}

async function fetchGatewayModelCapabilities(): Promise<AIModelUI[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('ai_gateway_models')
    .select('id, name, provider, description, context_window, tags, is_enabled')
    .eq('type', 'language');

  if (error || !data) return [];

  return data.map((model) => ({
    value: model.id,
    label: model.name,
    provider: model.provider,
    description: model.description ?? undefined,
    context: model.context_window ?? undefined,
    tags: model.tags ?? undefined,
    disabled: !model.is_enabled,
  }));
}

export function useMiraChatConfig({ wsId }: UseMiraChatConfigParams) {
  const [model, setModel] = useState<AIModelUI>(INITIAL_MODEL);
  const [thinkingMode, setThinkingMode] = useState<ThinkingMode>('fast');
  const [creditSource, setCreditSource] = useState<CreditSource>('workspace');
  const [workspaceContextId, setWorkspaceContextId] =
    useState<string>('personal');

  const { data: gatewayModels } = useQuery({
    queryKey: ['ai-gateway-models', 'capabilities'],
    queryFn: fetchGatewayModelCapabilities,
    staleTime: 5 * 60 * 1000,
  });

  const resolvedModel = useMemo(
    () =>
      gatewayModels?.find((candidate) => candidate.value === model.value) ??
      model,
    [gatewayModels, model]
  );

  const supportsFileInput = useMemo(() => {
    const tags = resolvedModel.tags;
    return Array.isArray(tags) && tags.includes('file-input');
  }, [resolvedModel]);

  // model.value is already the gateway ID (e.g. "google/gemini-2.5-flash")
  const gatewayModelId = model.value;

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

  const { data: contextCredits } = useAiCredits(wsId);

  const { data: personalWorkspaceId } = useQuery<string | null>({
    queryKey: ['personal-workspace-id'],
    queryFn: async () => {
      const res = await fetch('/api/v1/infrastructure/resolve-workspace-id', {
        method: 'POST',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wsId: 'personal' }),
      });

      if (!res.ok) return null;
      const payload = (await res.json()) as { workspaceId?: string };
      return payload.workspaceId ?? null;
    },
    staleTime: 5 * 60 * 1000,
  });

  const isPersonalDashboardWorkspace =
    !!personalWorkspaceId && personalWorkspaceId === wsId;
  const workspaceCreditLocked =
    isPersonalDashboardWorkspace || contextCredits?.tier === 'FREE';

  const activeCreditSource: CreditSource = workspaceCreditLocked
    ? 'personal'
    : creditSource;
  const creditWsId =
    activeCreditSource === 'personal'
      ? (personalWorkspaceId ?? undefined)
      : wsId;

  const chatRequestBody = useMemo(
    () => ({
      wsId,
      workspaceContextId,
      model: gatewayModelId,
      isMiraMode: true,
      timezone: timezoneForChat,
      thinkingMode,
      creditSource: activeCreditSource,
      ...(creditWsId ? { creditWsId } : {}),
    }),
    [
      activeCreditSource,
      creditWsId,
      gatewayModelId,
      thinkingMode,
      timezoneForChat,
      workspaceContextId,
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
        body: () => chatRequestBodyRef.current,
      }),
    []
  );

  // Restore model from localStorage on mount
  useEffect(() => {
    const key = `${MODEL_STORAGE_KEY_PREFIX}${wsId}`;
    const stored = localStorage.getItem(key);
    if (!stored) {
      setModel(INITIAL_MODEL);
      skipNextPersistenceRef.current = true;
      return;
    }
    try {
      const parsed = JSON.parse(stored) as {
        value: string;
        provider: string;
        label?: string;
        tags?: string[];
      };
      if (parsed.value && parsed.provider) {
        setModel({
          value: parsed.value,
          provider: parsed.provider,
          label: parsed.label ?? parsed.value.split('/').pop() ?? parsed.value,
          tags: Array.isArray(parsed.tags) ? parsed.tags : undefined,
        });
      } else {
        setModel(INITIAL_MODEL);
      }
      skipNextPersistenceRef.current = true;
    } catch {
      // Corrupt data — ignore and use default
      setModel(INITIAL_MODEL);
      skipNextPersistenceRef.current = true;
    }
  }, [wsId]);

  // Persist model to localStorage on change
  useEffect(() => {
    if (skipNextPersistenceRef.current) {
      skipNextPersistenceRef.current = false;
      return;
    }
    localStorage.setItem(
      `${MODEL_STORAGE_KEY_PREFIX}${wsId}`,
      JSON.stringify({
        value: model.value,
        provider: model.provider,
        label: model.label,
        tags: model.tags,
      })
    );
  }, [model, wsId]);

  useEffect(() => {
    const key = `${THINKING_MODE_STORAGE_KEY_PREFIX}${wsId}`;
    const stored = localStorage.getItem(key);
    if (stored === 'fast' || stored === 'thinking') {
      setThinkingMode(stored);
      return;
    }
    setThinkingMode('fast');
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
    setModel,
    supportsFileInput,
    thinkingMode,
    setThinkingMode,
    workspaceContextId,
    setWorkspaceContextId,
    transport,
    workspaceCreditLocked,
  };
}
