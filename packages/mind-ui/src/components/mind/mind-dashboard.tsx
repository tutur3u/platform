'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bot, CircleAlert, RefreshCw } from '@tuturuuu/icons';
import {
  archiveMindBoard,
  getMindBoardGraphSnapshot,
  listMindAiPatches,
  listMindBoards,
  type SaveMindGraphPayload,
  saveMindGraph,
  updateMindBoard,
} from '@tuturuuu/internal-api/mind';
import { Button } from '@tuturuuu/ui/button';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { buildMindWorkspaceHref } from '../../routes';
import { MindAiPanel } from './mind-ai-panel';
import { MindBoardSelectPrompt } from './mind-board-select-prompt';
import { MindCanvas } from './mind-canvas';
import { MindEmptyState } from './mind-empty-state';
import { MindHiveLauncher } from './mind-hive-launcher';
import { MindShell } from './mind-shell';

type Props = {
  hiveHref?: string;
  initialBoardId?: string;
  mindPrefix?: string;
  workspaceSlug?: string;
  wsId: string;
};

export function MindDashboard({
  hiveHref,
  initialBoardId,
  mindPrefix,
  workspaceSlug,
  wsId,
}: Props) {
  const t = useTranslations('mind');
  const router = useRouter();
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
  const activeBoardId = selectedBoardId ?? null;
  const workspaceHref = buildMindWorkspaceHref({
    mindPrefix,
    workspaceSlug: workspaceSlug ?? wsId,
  });
  const snapshotQuery = useQuery({
    enabled: !!activeBoardId,
    queryFn: () => getMindBoardGraphSnapshot(wsId, activeBoardId ?? ''),
    queryKey: ['mind', 'graph', wsId, activeBoardId],
  });
  const patchesQuery = useQuery({
    enabled: !!activeBoardId,
    queryFn: () => listMindAiPatches(wsId, activeBoardId ?? ''),
    queryKey: ['mind', 'patches', wsId, activeBoardId],
  });
  const snapshot = snapshotQuery.data;
  const patches = patchesQuery.data?.patches ?? [];
  const saveGraphMutation = useMutation({
    mutationFn: (payload: SaveMindGraphPayload) =>
      saveMindGraph(wsId, activeBoardId ?? '', payload),
    onSuccess: (nextSnapshot) => {
      queryClient.setQueryData(
        ['mind', 'graph', wsId, activeBoardId],
        nextSnapshot
      );
      queryClient.invalidateQueries({ queryKey: ['mind', 'boards', wsId] });
    },
  });
  const updateBoardMutation = useMutation({
    mutationFn: (title: string) =>
      updateMindBoard(wsId, activeBoardId ?? '', { title }),
    onSuccess: (response) => {
      queryClient.setQueryData(
        ['mind', 'graph', wsId, activeBoardId],
        (current: typeof snapshot | undefined) =>
          current
            ? {
                ...current,
                board: {
                  ...current.board,
                  ...response.board,
                },
              }
            : current
      );
      queryClient.invalidateQueries({ queryKey: ['mind', 'boards', wsId] });
    },
  });
  const deleteBoardMutation = useMutation({
    mutationFn: () => archiveMindBoard(wsId, activeBoardId ?? ''),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mind', 'boards', wsId] });
      queryClient.removeQueries({
        queryKey: ['mind', 'graph', wsId, activeBoardId],
      });
      router.push(workspaceHref);
    },
  });
  const snapshotLoadFailed = snapshotQuery.isError;

  if (
    !activeBoardId &&
    !boardsQuery.isLoading &&
    !boardLoadFailed &&
    boards.length > 0 &&
    workspaceSlug
  ) {
    return (
      <MindShell>
        <MindBoardSelectPrompt
          mindPrefix={mindPrefix}
          workspaceSlug={workspaceSlug}
        />
      </MindShell>
    );
  }

  if (hasNoBoards) {
    return (
      <MindShell>
        <MindEmptyState />
      </MindShell>
    );
  }

  return (
    <MindShell>
      <div className="pointer-events-none absolute top-3 right-3 z-40 flex items-start gap-2">
        <div className="pointer-events-auto isolate flex items-center gap-1 rounded-xl border border-border bg-background/90 p-1 shadow-foreground/5 shadow-xl backdrop-blur">
          {hiveHref ? (
            <MindHiveLauncher
              boardId={activeBoardId}
              disabled={!snapshot}
              hiveHref={hiveHref}
              workspaceId={wsId}
            />
          ) : null}
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
          horizon={horizon}
          onHorizonChange={setHorizon}
          onDeleteBoard={() => deleteBoardMutation.mutateAsync()}
          onRenameBoard={(title) => updateBoardMutation.mutateAsync(title)}
          onSave={(payload) => saveGraphMutation.mutateAsync(payload)}
          onSelectedTagsChange={setSelectedTags}
          onSmartPrompt={(prompt) => {
            setAiOpen(true);
            setQueuedAiPrompt({ id: crypto.randomUUID(), prompt });
          }}
          boardActionPending={
            updateBoardMutation.isPending || deleteBoardMutation.isPending
          }
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
        onRetryPatches={() => void patchesQuery.refetch()}
        patches={patches}
        patchesError={patchesQuery.isError ? t('ai.patchLoadError') : null}
        queuedPrompt={queuedAiPrompt}
        retryingPatches={patchesQuery.isFetching}
        wsId={wsId}
      />
    </MindShell>
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
