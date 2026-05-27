'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { applyMindAiPatch } from '@tuturuuu/internal-api/mind';
import type { MindAiPatchRecord } from '@tuturuuu/types/db';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useRef, useState } from 'react';
import { MindAiInput } from './mind-ai-input';
import { applyMindPatchWithLayoutRefresh } from './mind-ai-panel-actions';
import { MindAiPanelContent } from './mind-ai-panel-content';
import { MindAiPanelHeader } from './mind-ai-panel-header';
import { MindAiPanelShell } from './mind-ai-panel-shell';
import {
  formatChatAsMarkdown,
  organizeAndSaveBoard,
  updateMindPatchCaches,
} from './mind-ai-panel-utils';
import {
  getLatestMindAiProposal,
  type MindAiProposal,
  MindAiProposalIsland,
} from './mind-ai-proposal-island';
import type { MindAiArtifactItem } from './mind-ai-tool-activity';
import { useMindAiPanelState } from './use-mind-ai-panel-state';

type Props = {
  boardId?: string | null;
  collapsed?: boolean;
  onToggleCollapsed: () => void;
  onRetryPatches?: () => void;
  patches?: MindAiPatchRecord[];
  patchesError?: string | null;
  queuedPrompt?: { id: string; prompt: string } | null;
  retryingPatches?: boolean;
  wsId: string;
};

export function MindAiPanel({
  boardId,
  collapsed,
  onToggleCollapsed,
  onRetryPatches,
  patches = [],
  patchesError,
  queuedPrompt,
  retryingPatches,
  wsId,
}: Props) {
  const t = useTranslations('mind');
  const queryClient = useQueryClient();
  const scrollRef = useRef<HTMLDivElement>(null);
  const queuedPromptIdRef = useRef<string | null>(null);
  const [threadId, setThreadId] = useState(() => crypto.randomUUID());
  const [fullscreen, setFullscreen] = useState(false);
  const [dismissedProposalId, setDismissedProposalId] = useState<string | null>(
    null
  );
  const [openedArtifact, setOpenedArtifact] = useState<MindAiProposal | null>(
    null
  );
  const [layoutRefreshBoardId, setLayoutRefreshBoardId] = useState<
    string | null
  >(null);
  const previousProposalIdRef = useRef<string | null>(null);
  const latestProposalRef = useRef<MindAiProposal | null>(null);
  const state = useMindAiPanelState({
    boardId,
    enabled: !collapsed,
    threadId,
    wsId,
  });
  const {
    activeCreditSource,
    addFiles,
    attachedFiles,
    directWrite,
    debugContext,
    input,
    isBusy,
    messages,
    model,
    personalWsId,
    removeFile,
    setDirectWrite,
    setInput,
    status,
    statusLabel,
    startNewChat,
    thinkingMode,
    visibleError,
    workspaceCreditLocked,
    submit,
    updateCreditSource,
    updateModel,
    updateThinkingMode,
    stop,
  } = state;
  const applyPatchMutation = useMutation({
    mutationFn: (patchId: string) => {
      setLayoutRefreshBoardId(null);
      return applyMindPatchWithLayoutRefresh({
        applyPatch: (targetPatchId) => applyMindAiPatch(wsId, targetPatchId),
        boardId,
        onPatchApplied: (patch) => {
          updateMindPatchCaches({
            boardId,
            patch,
            queryClient,
            wsId,
          });
          setOpenedArtifact((current) =>
            current?.patch?.id === patch.id ? { ...current, patch } : current
          );
        },
        organizeAndSaveBoard: (targetBoardId) =>
          organizeAndSaveBoard(wsId, targetBoardId),
        patchId,
      });
    },
    onSuccess: (result) => {
      if (result.snapshot) {
        queryClient.setQueryData(
          ['mind', 'graph', wsId, result.patch.boardId || boardId],
          result.snapshot
        );
      }

      if (result.layoutError) {
        setLayoutRefreshBoardId(result.patch.boardId || boardId || null);
      }

      queryClient.invalidateQueries({ queryKey: ['mind', 'boards', wsId] });
      queryClient.invalidateQueries({
        queryKey: ['mind', 'graph', wsId, result.patch.boardId || boardId],
      });
      queryClient.invalidateQueries({
        queryKey: ['mind', 'patches', wsId, result.patch.boardId || boardId],
      });
      const appliedProposalId =
        openedArtifact?.patch?.id === result.patch.id
          ? openedArtifact.id
          : latestProposalRef.current?.patch?.id === result.patch.id
            ? latestProposalRef.current.id
            : null;
      setOpenedArtifact(null);
      if (appliedProposalId) setDismissedProposalId(appliedProposalId);
      if (!collapsed) onToggleCollapsed();
    },
  });
  const layoutRetryMutation = useMutation({
    mutationFn: async (targetBoardId: string) =>
      organizeAndSaveBoard(wsId, targetBoardId),
    onSuccess: (snapshot, targetBoardId) => {
      queryClient.setQueryData(
        ['mind', 'graph', wsId, targetBoardId],
        snapshot
      );
      queryClient.invalidateQueries({ queryKey: ['mind', 'boards', wsId] });
      queryClient.invalidateQueries({
        queryKey: ['mind', 'graph', wsId, targetBoardId],
      });
      setLayoutRefreshBoardId(null);
    },
  });
  const handleModelChange = (nextModel: typeof model) => {
    if (isBusy) stop();
    updateModel(nextModel);
  };
  const handleThinkingModeChange = (nextMode: typeof thinkingMode) => {
    if (isBusy) stop();
    updateThinkingMode(nextMode);
  };
  const handleCreditSourceChange = (nextSource: typeof activeCreditSource) => {
    if (isBusy) stop();
    updateCreditSource(nextSource);
  };
  const handleNewChat = () => {
    startNewChat();
    setThreadId(crypto.randomUUID());
    setOpenedArtifact(null);
  };
  const handleOpenArtifact = (artifact: MindAiArtifactItem) => {
    setOpenedArtifact({
      id: artifact.id,
      patch: artifact.patch,
      visual: artifact.visual,
    });
  };
  const handleDismissProposal = (proposalId: string) => {
    if (openedArtifact?.id === proposalId) {
      setOpenedArtifact(null);
      return;
    }

    setDismissedProposalId(proposalId);
  };
  const latestMessage = messages.at(-1);
  const latestProposal = useMemo(
    () => getLatestMindAiProposal(messages, patches),
    [messages, patches]
  );
  const visibleProposal =
    openedArtifact ??
    (latestProposal?.id === dismissedProposalId ? null : latestProposal);
  const chatMarkdown = useMemo(
    () => formatChatAsMarkdown(messages),
    [messages]
  );
  const chatJson = useMemo(
    () =>
      messages.length
        ? JSON.stringify(
            {
              boardId: boardId ?? null,
              debug: debugContext,
              messages,
              threadId,
              wsId,
            },
            null,
            2
          )
        : '',
    [boardId, debugContext, messages, threadId, wsId]
  );
  const scrollVersion = [
    messages.length,
    latestMessage?.parts.length ?? 0,
    patches.length,
    status,
    visibleError ?? '',
  ].join(':');

  useEffect(() => {
    latestProposalRef.current = latestProposal;
  }, [latestProposal]);

  useEffect(() => {
    if (!scrollVersion) return;
    const node = scrollRef.current;
    if (!node) return;
    node.scrollTo({ behavior: 'smooth', top: node.scrollHeight });
  }, [scrollVersion]);

  useEffect(() => {
    if (collapsed) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      if (event.shiftKey) {
        setFullscreen((value) => !value);
        return;
      }
      setFullscreen(false);
      onToggleCollapsed();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [collapsed, onToggleCollapsed]);

  useEffect(() => {
    if (!queuedPrompt || collapsed || !boardId || isBusy) return;
    if (queuedPromptIdRef.current === queuedPrompt.id) return;
    queuedPromptIdRef.current = queuedPrompt.id;
    void submit(queuedPrompt.prompt);
  }, [boardId, collapsed, isBusy, queuedPrompt, submit]);

  useEffect(() => {
    const nextProposalId = latestProposal?.id ?? null;
    if (nextProposalId === previousProposalIdRef.current) return;
    previousProposalIdRef.current = nextProposalId;
    setDismissedProposalId(null);
  }, [latestProposal?.id]);

  if (collapsed) return null;

  return (
    <>
      <MindAiPanelShell
        footer={
          <MindAiInput
            disabled={!boardId}
            files={attachedFiles}
            input={input}
            isBusy={isBusy}
            onAddFiles={addFiles}
            onInputChange={setInput}
            onRemoveFile={removeFile}
            onSubmit={() => void submit(input)}
            panelFullscreen={fullscreen}
          />
        }
        fullscreen={fullscreen}
        header={
          <MindAiPanelHeader
            chatJson={chatJson}
            chatMarkdown={chatMarkdown}
            creditSource={activeCreditSource}
            debugContext={debugContext}
            directWrite={directWrite}
            fullscreen={fullscreen}
            model={model}
            onClose={onToggleCollapsed}
            onCreditSourceChange={handleCreditSourceChange}
            onDirectWriteChange={setDirectWrite}
            onModelChange={handleModelChange}
            onNewChat={handleNewChat}
            onThinkingModeChange={handleThinkingModeChange}
            onToggleFullscreen={() => setFullscreen((value) => !value)}
            personalWsId={personalWsId}
            statusLabel={statusLabel}
            thinkingMode={thinkingMode}
            workspaceCreditLocked={workspaceCreditLocked}
            wsId={wsId}
          />
        }
        scrollRef={scrollRef}
      >
        <MindAiPanelContent
          applyingPatch={applyPatchMutation.isPending}
          fullscreen={fullscreen}
          latestMessage={latestMessage}
          layoutRefreshError={
            layoutRefreshBoardId ? t('ai.layoutRefreshError') : null
          }
          messages={messages}
          onApplyPatch={(patchId) => applyPatchMutation.mutate(patchId)}
          onOpenArtifact={handleOpenArtifact}
          onPickPrompt={submit}
          onRetryLayoutRefresh={
            layoutRefreshBoardId
              ? () => layoutRetryMutation.mutate(layoutRefreshBoardId)
              : undefined
          }
          onRetryPatches={onRetryPatches}
          patches={patches}
          patchesError={patchesError}
          retryingLayoutRefresh={layoutRetryMutation.isPending}
          retryingPatches={retryingPatches}
          status={status}
          visibleError={visibleError}
        />
      </MindAiPanelShell>
      <MindAiProposalIsland
        applying={applyPatchMutation.isPending}
        fullscreen={fullscreen}
        onApplyPatch={(patchId) => applyPatchMutation.mutate(patchId)}
        onDismiss={handleDismissProposal}
        proposal={visibleProposal}
      />
    </>
  );
}
