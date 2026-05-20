'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { UIMessage } from '@tuturuuu/ai/types';
import {
  applyMindAiPatch,
  getMindBoardSnapshot,
  type MindBoardSnapshotResponse,
  saveMindGraph,
} from '@tuturuuu/internal-api/mind';
import { useEffect, useMemo, useRef, useState } from 'react';
import { MindAiInput } from './mind-ai-input';
import { MindAiPanelContent } from './mind-ai-panel-content';
import { MindAiPanelHeader } from './mind-ai-panel-header';
import {
  getLatestMindAiProposal,
  type MindAiProposal,
  MindAiProposalIsland,
} from './mind-ai-proposal-island';
import type { MindAiArtifactItem } from './mind-ai-tool-activity';
import {
  organizeMindLayout,
  toFlowEdges,
  toFlowNodes,
  toSaveMindGraphPayload,
} from './mind-flow';
import { useMindAiPanelState } from './use-mind-ai-panel-state';

type Props = {
  boardId?: string | null;
  collapsed?: boolean;
  onToggleCollapsed: () => void;
  patches?: MindBoardSnapshotResponse['patches'];
  queuedPrompt?: { id: string; prompt: string } | null;
  wsId: string;
};

export function MindAiPanel({
  boardId,
  collapsed,
  onToggleCollapsed,
  patches = [],
  queuedPrompt,
  wsId,
}: Props) {
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
  const previousProposalIdRef = useRef<string | null>(null);
  const state = useMindAiPanelState({ boardId, threadId, wsId });
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
    mutationFn: async (patchId: string) => {
      const response = await applyMindAiPatch(wsId, patchId);
      const targetBoardId = response.patch.boardId || boardId;

      if (targetBoardId) {
        await organizeAndSaveBoard(wsId, targetBoardId);
      }

      return response;
    },
    onSuccess: () => {
      if (visibleProposal?.id) setDismissedProposalId(visibleProposal.id);
      setOpenedArtifact(null);
      queryClient.invalidateQueries({ queryKey: ['mind', 'boards', wsId] });
      queryClient.invalidateQueries({ queryKey: ['mind', 'snapshot', wsId] });
      queryClient.invalidateQueries({
        queryKey: ['mind', 'snapshot', wsId, boardId],
      });
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
    setOpenedArtifact(
      artifact.type === 'plan'
        ? { id: artifact.id, visual: artifact.visual }
        : { id: artifact.id, patch: artifact.patch }
    );
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
      <aside
        className={
          fullscreen
            ? 'fixed inset-3 z-50 flex min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-background/95 shadow-2xl shadow-foreground/20 backdrop-blur md:inset-4'
            : 'absolute top-20 right-5 bottom-5 z-30 flex min-h-0 w-[min(28rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-xl border border-border bg-background/95 shadow-2xl shadow-foreground/10 backdrop-blur'
        }
      >
        <MindAiPanelHeader
          chatJson={chatJson}
          chatMarkdown={chatMarkdown}
          creditSource={activeCreditSource}
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
          thinkingMode={thinkingMode}
          workspaceCreditLocked={workspaceCreditLocked}
          wsId={wsId}
        />

        <div
          className="@container min-h-0 flex-1 overflow-y-auto p-2.5"
          ref={scrollRef}
        >
          <MindAiPanelContent
            applyingPatch={applyPatchMutation.isPending}
            debugContext={debugContext}
            fullscreen={fullscreen}
            latestMessage={latestMessage}
            messages={messages}
            onApplyPatch={(patchId) => applyPatchMutation.mutate(patchId)}
            onOpenArtifact={handleOpenArtifact}
            onPickPrompt={submit}
            patches={patches}
            status={status}
            statusLabel={statusLabel}
            visibleError={visibleError}
          />
        </div>

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
      </aside>
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

async function organizeAndSaveBoard(wsId: string, boardId: string) {
  const snapshot = await getMindBoardSnapshot(wsId, boardId);
  const edges = toFlowEdges(snapshot.edges);
  const nodes = organizeMindLayout({
    edges,
    nodes: toFlowNodes(snapshot.nodes),
  });

  await saveMindGraph(
    wsId,
    boardId,
    toSaveMindGraphPayload({
      deletedEdgeIds: [],
      deletedNodeIds: [],
      edges,
      nodes,
    })
  );
}

function formatChatAsMarkdown(messages: UIMessage[]) {
  return messages
    .map((message) => {
      const text = getMessageText(message);
      if (!text.trim()) return null;
      const role = message.role === 'user' ? 'User' : 'Mind';
      return `### ${role}\n\n${text.trim()}`;
    })
    .filter(Boolean)
    .join('\n\n');
}

function getMessageText(message: UIMessage) {
  return message.parts
    .map((part) => (part.type === 'text' ? part.text : ''))
    .filter(Boolean)
    .join('\n\n');
}
