'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bot, CircleAlert, RefreshCw } from '@tuturuuu/icons';
import {
  getMindBoardSnapshot,
  listMindBoards,
  type SaveMindGraphPayload,
  saveMindGraph,
} from '@tuturuuu/internal-api/mind';
import { Button } from '@tuturuuu/ui/button';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { MindAiPanel } from './mind-ai-panel';
import { MindCanvas } from './mind-canvas';
import { MindDashboardHeader } from './mind-dashboard-header';
import { MindEmptyState } from './mind-empty-state';
import { MindTagFilter } from './mind-tag-filter';
import { getNodeMetadata } from './model';

type Props = {
  initialBoardId?: string;
  wsId: string;
};

export function MindDashboard({ initialBoardId, wsId }: Props) {
  const t = useTranslations('mind');
  const queryClient = useQueryClient();
  const selectedBoardId = initialBoardId ?? null;
  const [aiOpen, setAiOpen] = useState(false);
  const [horizon, setHorizon] = useState('all');
  const [queuedAiPrompt, setQueuedAiPrompt] = useState<{
    id: string;
    prompt: string;
  } | null>(null);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const boardsQuery = useQuery({
    queryFn: () => listMindBoards({ workspaceId: wsId }),
    queryKey: ['mind', 'boards', wsId],
  });
  const boards = boardsQuery.data?.boards ?? [];
  const boardLoadFailed = boardsQuery.isError;
  const hasNoBoards =
    !boardLoadFailed && !boardsQuery.isLoading && boards.length === 0;
  const activeBoardId = selectedBoardId ?? boards[0]?.id ?? null;
  const activeBoard = activeBoardId
    ? boards.find((board) => board.id === activeBoardId)
    : null;
  const snapshotQuery = useQuery({
    enabled: !!activeBoardId,
    queryFn: () => getMindBoardSnapshot(wsId, activeBoardId ?? ''),
    queryKey: ['mind', 'snapshot', wsId, activeBoardId],
  });
  const saveGraphMutation = useMutation({
    mutationFn: (payload: SaveMindGraphPayload) =>
      saveMindGraph(wsId, activeBoardId ?? '', payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mind', 'boards', wsId] });
      queryClient.invalidateQueries({
        queryKey: ['mind', 'snapshot', wsId, activeBoardId],
      });
    },
  });
  const snapshot = snapshotQuery.data;
  const snapshotLoadFailed = snapshotQuery.isError;
  const tags = useMemo(() => {
    const values = new Set<string>();
    for (const node of snapshot?.nodes ?? []) {
      for (const tag of getNodeMetadata(node).tags) values.add(tag);
    }
    return [...values].sort((a, b) => a.localeCompare(b));
  }, [snapshot?.nodes]);

  return (
    <main className="relative -mx-2 -mb-2 flex h-[calc(100dvh-4.25rem)] min-h-0 w-[calc(100%+1rem)] flex-col overflow-hidden bg-root-background text-foreground md:-m-4 md:h-dvh md:w-[calc(100%+2rem)]">
      <MindDashboardHeader
        boardTitle={
          boardLoadFailed
            ? t('boardLoadErrorTitle')
            : hasNoBoards
              ? t('emptyState.headerTitle')
              : snapshotLoadFailed
                ? (activeBoard?.title ?? t('snapshotLoadErrorTitle'))
                : (snapshot?.board.title ??
                  activeBoard?.title ??
                  t('loadingBoard'))
        }
        edgeCount={snapshot?.board.edgeCount ?? 0}
        nodeCount={snapshot?.board.nodeCount ?? 0}
        tagCount={tags.length}
      />
      <div className="pointer-events-none absolute top-3 right-3 z-40 flex items-start gap-2">
        <div className="pointer-events-auto isolate rounded-xl border border-border bg-background/90 p-1 shadow-foreground/5 shadow-xl backdrop-blur">
          <MindTagFilter
            onSelectedTagsChange={setSelectedTags}
            selectedTags={selectedTags}
            tags={tags}
          />
        </div>
        <div className="pointer-events-auto isolate rounded-xl border border-border bg-background/90 p-1 shadow-foreground/5 shadow-xl backdrop-blur">
          <Button
            aria-label={t('actions.openAi')}
            className="h-9 w-9 touch-manipulation"
            onClick={() => setAiOpen((value) => !value)}
            size="icon"
            type="button"
            variant={aiOpen ? 'secondary' : 'ghost'}
          >
            <Bot className="h-4 w-4" />
          </Button>
        </div>
      </div>
      {boardLoadFailed ? (
        <CanvasErrorState
          description={t('boardLoadErrorDescription')}
          onRetry={() => void boardsQuery.refetch()}
          retryLabel={t('actions.retry')}
          title={t('boardLoadErrorTitle')}
        />
      ) : hasNoBoards ? (
        <MindEmptyState />
      ) : snapshotLoadFailed ? (
        <CanvasErrorState
          description={t('snapshotLoadErrorDescription')}
          onRetry={() => void snapshotQuery.refetch()}
          retryLabel={t('actions.retry')}
          title={t('snapshotLoadErrorTitle')}
        />
      ) : snapshot ? (
        <MindCanvas
          key={snapshot.board.id}
          disabled={saveGraphMutation.isPending}
          horizon={horizon}
          onHorizonChange={setHorizon}
          onSave={(payload) => saveGraphMutation.mutate(payload)}
          onSmartPrompt={(prompt) => {
            setAiOpen(true);
            setQueuedAiPrompt({ id: crypto.randomUUID(), prompt });
          }}
          saving={saveGraphMutation.isPending}
          selectedTags={selectedTags}
          snapshot={snapshot}
        />
      ) : (
        <CanvasLoadingState />
      )}
      <MindAiPanel
        boardId={activeBoardId}
        collapsed={!aiOpen}
        onToggleCollapsed={() => setAiOpen((value) => !value)}
        patches={snapshot?.patches}
        queuedPrompt={queuedAiPrompt}
        wsId={wsId}
      />
    </main>
  );
}

function CanvasLoadingState() {
  return (
    <div className="min-h-0 flex-1 space-y-4 p-6">
      <Skeleton className="h-16 w-80 max-w-full" />
      <Skeleton className="h-[calc(100dvh-12rem)] w-full" />
    </div>
  );
}

function CanvasErrorState({
  description,
  onRetry,
  retryLabel,
  title,
}: {
  description: string;
  onRetry: () => void;
  retryLabel: string;
  title: string;
}) {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center p-6">
      <div className="max-w-md rounded-lg border border-dynamic-red/30 bg-dynamic-red/5 p-5 text-center">
        <CircleAlert className="mx-auto h-6 w-6 text-dynamic-red" />
        <h2 className="mt-3 font-semibold text-base">{title}</h2>
        <p className="mt-2 text-muted-foreground text-sm">{description}</p>
        <Button
          className="mt-4 gap-2"
          onClick={onRetry}
          size="sm"
          type="button"
          variant="outline"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          <span>{retryLabel}</span>
        </Button>
      </div>
    </div>
  );
}
