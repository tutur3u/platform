'use client';

import { useQuery } from '@tanstack/react-query';
import { AlertCircle, Loader2 } from '@tuturuuu/icons';
import { getWorkspaceTaskBoard } from '@tuturuuu/internal-api/tasks';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { useTranslations } from 'next-intl';
import { BoardActivitySettings } from './board-activity-settings';
import { BoardCriticalActionsSettings } from './board-critical-actions-settings';
import { BoardDetailsSettings } from './board-details-settings';
import { BoardEstimationSettings } from './board-estimation-settings';
import { BoardLayoutSettingsSection } from './board-layout-settings-section';

function getBrowserInternalApiOptions() {
  return typeof window !== 'undefined'
    ? { baseUrl: window.location.origin }
    : undefined;
}

export function BoardSettingsPanel({
  boardId,
  wsId,
}: {
  boardId: string;
  wsId: string;
}) {
  const t = useTranslations();

  const {
    data: board,
    error,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ['task-board-settings', wsId, boardId],
    queryFn: async () => {
      const payload = await getWorkspaceTaskBoard(
        wsId,
        boardId,
        getBrowserInternalApiOptions()
      );
      return payload.board;
    },
    enabled: Boolean(wsId && boardId),
  });

  if (isLoading) {
    return (
      <div className="flex h-48 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !board) {
    return (
      <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm">
        <AlertCircle className="mt-0.5 h-4 w-4 text-destructive" />
        <div>
          <p className="font-medium text-destructive">
            {t('settings.tasks.board_load_failed')}
          </p>
          <p className="text-muted-foreground">
            {error instanceof Error
              ? error.message
              : t('settings.tasks.board_load_failed_description')}
          </p>
        </div>
      </div>
    );
  }

  const refreshBoard = () => {
    void refetch();
  };

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h2 className="font-semibold text-lg">{t('settings.tasks.board')}</h2>
        <p className="text-muted-foreground text-sm">
          {board.name || t('common.untitled')}
        </p>
      </div>

      <Tabs defaultValue="details" className="space-y-4">
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-5">
          <TabsTrigger value="details">
            {t('settings.tasks.board_details')}
          </TabsTrigger>
          <TabsTrigger value="layout">
            {t('settings.tasks.board_layout')}
          </TabsTrigger>
          <TabsTrigger value="estimation">
            {t('settings.tasks.estimates')}
          </TabsTrigger>
          <TabsTrigger value="activity">
            {t('settings.tasks.board_activity')}
          </TabsTrigger>
          <TabsTrigger value="actions">
            {t('settings.tasks.board_actions')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="details">
          <BoardDetailsSettings
            board={board}
            onRefresh={refreshBoard}
            wsId={wsId}
          />
        </TabsContent>
        <TabsContent value="layout">
          <BoardLayoutSettingsSection
            board={board}
            onRefresh={refreshBoard}
            wsId={wsId}
          />
        </TabsContent>
        <TabsContent value="estimation">
          <BoardEstimationSettings
            board={board}
            onRefresh={refreshBoard}
            wsId={wsId}
          />
        </TabsContent>
        <TabsContent value="activity">
          <BoardActivitySettings boardId={board.id} wsId={wsId} />
        </TabsContent>
        <TabsContent value="actions">
          <BoardCriticalActionsSettings
            board={board}
            onRefresh={refreshBoard}
            wsId={wsId}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
