'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { DefaultChatTransport } from '@tuturuuu/ai/core';
import { matchesAllowedModel } from '@tuturuuu/ai/credits/model-mapping';
import { useChat } from '@tuturuuu/ai/react';
import { resolveInfrastructureWorkspaceId } from '@tuturuuu/internal-api/infrastructure';
import { useAiCredits } from '@tuturuuu/ui/hooks/use-ai-credits';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useMindAiAttachments } from './use-mind-ai-attachments';
import { useMindAiPreferences } from './use-mind-ai-preferences';

type Params = {
  boardId?: string | null;
  enabled?: boolean;
  threadId: string;
  wsId: string;
};

type MindAiRunDebug = {
  id: string;
  startedAt: string;
};

type MindAiTransportState = {
  boardId?: string | null;
  creditSource: 'personal' | 'workspace';
  creditWsId: string;
  directWrite: boolean;
  modelId: string;
  thinkingMode: 'fast' | 'thinking';
  threadId: string;
  wsId: string;
};

function getClientErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (typeof error === 'string' && error.trim()) return error;
  return 'Mind AI could not finish this request.';
}

function modelFromId(modelId: string) {
  const provider = modelId.includes('/')
    ? (modelId.split('/')[0] ?? 'google')
    : 'google';

  return {
    label: modelId.split('/').slice(1).join('/') || modelId,
    provider,
    value: modelId,
  };
}

export function useMindAiPanelState({
  boardId,
  enabled = true,
  threadId,
  wsId,
}: Params) {
  const t = useTranslations('mind');
  const queryClient = useQueryClient();
  const [input, setInput] = useState('');
  const [directWrite, setDirectWrite] = useState(false);
  const [runDebug, setRunDebug] = useState<MindAiRunDebug | null>(null);
  const [streamError, setStreamError] = useState<string | null>(null);
  const runDebugRef = useRef<MindAiRunDebug | null>(null);
  const attachments = useMindAiAttachments({
    getUploadFailedMessage: (name) => t('ai.uploadFailedMessage', { name }),
    threadId,
    wsId,
  });
  const preferences = useMindAiPreferences(wsId);
  const {
    creditSource,
    model,
    setCreditSource,
    setModel,
    setThinkingMode,
    thinkingMode,
  } = preferences;
  const personalWorkspaceQuery = useQuery({
    enabled,
    queryFn: () =>
      resolveInfrastructureWorkspaceId('personal').then(
        (response) => response.workspaceId
      ),
    queryKey: ['mind', 'personal-workspace-id'],
    staleTime: 5 * 60 * 1000,
  });
  const { data: workspaceCredits } = useAiCredits(enabled ? wsId : undefined);
  const workspaceCreditLocked =
    workspaceCredits?.tier === 'FREE' ||
    (!!personalWorkspaceQuery.data && personalWorkspaceQuery.data === wsId);
  const activeCreditSource = workspaceCreditLocked ? 'personal' : creditSource;
  const creditWsId =
    activeCreditSource === 'personal'
      ? (personalWorkspaceQuery.data ?? 'personal')
      : wsId;
  const { data: creditCredits } = useAiCredits(
    enabled ? creditWsId : undefined
  );
  const transportStateRef = useRef<MindAiTransportState>({
    boardId,
    creditSource: activeCreditSource,
    creditWsId,
    directWrite,
    modelId: model.value,
    thinkingMode,
    threadId,
    wsId,
  });
  transportStateRef.current = {
    boardId,
    creditSource: activeCreditSource,
    creditWsId,
    directWrite,
    modelId: model.value,
    thinkingMode,
    threadId,
    wsId,
  };

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: '/api/ai/mind',
        body: () => {
          const state = transportStateRef.current;

          return {
            ...(state.boardId ? { boardId: state.boardId } : {}),
            clientRunId: runDebugRef.current?.id,
            creditSource: state.creditSource,
            creditWsId: state.creditWsId,
            model: state.modelId,
            thinkingMode: state.thinkingMode,
            threadId: state.threadId,
            wsId: state.wsId,
            writeMode: state.directWrite ? 'direct' : 'review',
          };
        },
        credentials: 'include',
      }),
    []
  );
  const { error, messages, sendMessage, setMessages, status, stop } = useChat({
    id: `mind-${threadId}`,
    onError: (nextError) => {
      setStreamError(getClientErrorMessage(nextError));
    },
    onFinish: () => {
      queryClient.invalidateQueries({
        queryKey: ['mind', 'snapshot', wsId, boardId],
      });
    },
    transport,
  });
  const isBusy = status === 'streaming' || status === 'submitted';

  const submit = async (value: string) => {
    const prompt = value.trim();
    const uploadedFiles = attachments.files.filter(
      (file) => file.status === 'uploaded'
    );
    if ((!prompt && !uploadedFiles.length) || isBusy) return;

    setInput('');
    setStreamError(null);
    const nextRunDebug = {
      id: crypto.randomUUID(),
      startedAt: new Date().toISOString(),
    };
    runDebugRef.current = nextRunDebug;
    setRunDebug(nextRunDebug);
    const attachmentSummary = uploadedFiles.length
      ? `\n\n${t('ai.attachmentsForContext')}: ${uploadedFiles
          .map((file) => file.file.name)
          .join(', ')}`
      : '';
    const text = `${prompt || t('ai.attachmentOnlyPrompt')}${attachmentSummary}`;

    try {
      await sendMessage({
        role: 'user',
        parts: [{ text, type: 'text' }],
      });
      attachments.clearFiles();
    } catch (nextError) {
      setStreamError(getClientErrorMessage(nextError));
    }
  };

  useEffect(() => {
    if (!workspaceCreditLocked || creditSource === 'personal') {
      return;
    }
    setCreditSource('personal');
  }, [creditSource, setCreditSource, workspaceCreditLocked]);

  useEffect(() => {
    if (!creditCredits) return;
    if (matchesAllowedModel(model.value, creditCredits.allowedModels)) {
      return;
    }
    const defaultModel = creditCredits.defaultLanguageModel;
    if (defaultModel) setModel(modelFromId(defaultModel));
  }, [creditCredits, model.value, setModel]);

  const updateModel = (nextModel: typeof model) => {
    setModel(nextModel);
    setStreamError(null);
  };

  const updateThinkingMode = (nextMode: typeof thinkingMode) => {
    setThinkingMode(nextMode);
    setStreamError(null);
  };

  const updateCreditSource = (nextSource: typeof creditSource) => {
    setCreditSource(nextSource);
    setStreamError(null);
  };

  const startNewChat = () => {
    stop();
    setMessages([]);
    setDirectWrite(false);
    setInput('');
    setRunDebug(null);
    runDebugRef.current = null;
    setStreamError(null);
  };

  return {
    activeCreditSource,
    attachedFiles: attachments.files,
    directWrite,
    input,
    isBusy,
    messages,
    model,
    personalWsId: personalWorkspaceQuery.data ?? undefined,
    setDirectWrite,
    setInput,
    status,
    statusLabel:
      status === 'submitted'
        ? t('ai.connecting')
        : status === 'streaming'
          ? t('ai.working')
          : null,
    thinkingMode,
    debugContext: {
      boardId: boardId ?? null,
      creditSource: activeCreditSource,
      creditWsId,
      modelId: model.value,
      runId: runDebug?.id ?? null,
      runStartedAt: runDebug?.startedAt ?? null,
      status,
      threadId,
      thinkingMode,
      writeMode: directWrite ? 'direct' : 'review',
      wsId,
    },
    visibleError: streamError ?? error?.message ?? null,
    workspaceCreditLocked,
    addFiles: attachments.addFiles,
    removeFile: attachments.removeFile,
    submit,
    startNewChat,
    updateCreditSource,
    updateModel,
    updateThinkingMode,
    stop,
  };
}
