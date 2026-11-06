'use client';

import { useQuery } from '@tanstack/react-query';
import { Loader2 } from '@tuturuuu/icons';
import {
  getWorkspaceTaskBoard,
  listWorkspaceLabels,
  listWorkspaceTaskBoards,
  listWorkspaceTaskInitiatives,
  listWorkspaceTaskProjectDetails,
  type WorkspaceTaskBoardDetail,
} from '@tuturuuu/internal-api/tasks';
import { listWorkspaceTemplates } from '@tuturuuu/internal-api/templates';
import { BoardShareSettingsPanel } from '@tuturuuu/tasks-ui/tu-do/boards/board-share-settings-panel';
import { BoardSprintSettings } from '@tuturuuu/tasks-ui/tu-do/boards/board-sprint-settings';
import { CapacityRulesSettings } from '@tuturuuu/tasks-ui/tu-do/boards/capacity-rules-settings';
import { DraftsPage } from '@tuturuuu/tasks-ui/tu-do/drafts/drafts-page';
import TaskEstimatesClient from '@tuturuuu/tasks-ui/tu-do/estimates/client';
import HabitsClientPage from '@tuturuuu/tasks-ui/tu-do/habits/client';
import { TaskInitiativesClient } from '@tuturuuu/tasks-ui/tu-do/initiatives/task-initiatives-client';
import TaskLabelsClient from '@tuturuuu/tasks-ui/tu-do/labels/client';
import type { TaskLabel } from '@tuturuuu/tasks-ui/tu-do/labels/types';
import LogsClient from '@tuturuuu/tasks-ui/tu-do/logs/logs-client';
import NotesContent from '@tuturuuu/tasks-ui/tu-do/notes/notes-content';
import { TaskProjectsClient } from '@tuturuuu/tasks-ui/tu-do/projects/task-projects-client';
import type { TaskProject } from '@tuturuuu/tasks-ui/tu-do/projects/types';
import { BoardLayoutSettingsContent } from '@tuturuuu/tasks-ui/tu-do/shared/board-layout-settings';
import { SettingsGroup } from '@tuturuuu/tasks-ui/tu-do/shared/settings-group';
import MarketplaceClient from '@tuturuuu/tasks-ui/tu-do/templates/marketplace/client';
import { TaskTemplatesHub } from '@tuturuuu/tasks-ui/tu-do/templates/task-templates-hub';
import TaskTemplateDetailPageClient from '@tuturuuu/tasks-ui/tu-do/templates/templateId/task-template-detail-page-client';
import type { BoardTemplate } from '@tuturuuu/tasks-ui/tu-do/templates/types';
import type { Workspace } from '@tuturuuu/types';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { BoardDetailsSettings } from './board-details-settings';
import { BoardSettingsNavigation } from './board-settings-navigation';
import { TaskBoardBehaviorSettings } from './task-board-behavior-settings';
import { TaskBoardLifecycleSettings } from './task-board-lifecycle-settings';
import { listPublicBoardTemplates } from './template-marketplace-actions';

function getBrowserInternalApiOptions() {
  return typeof window !== 'undefined'
    ? { baseUrl: window.location.origin }
    : undefined;
}

function LoadingPanel() {
  return (
    <div className="flex justify-center py-8">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
}

function EmptyPanel({
  description,
  title,
}: {
  description: string;
  title: string;
}) {
  return (
    <div className="rounded-lg border border-dashed bg-muted/20 p-6">
      <h3 className="font-medium text-sm">{title}</h3>
      <p className="mt-1 text-muted-foreground text-sm">{description}</p>
    </div>
  );
}

function toTaskList(
  list: NonNullable<WorkspaceTaskBoardDetail['task_lists']>[number],
  boardId: string
): TaskList {
  return {
    archived: false,
    board_id: boardId,
    color: (list.color ?? 'GRAY') as TaskList['color'],
    created_at: '',
    creator_id: '',
    deleted: list.deleted ?? false,
    id: list.id,
    name: list.name ?? '',
    position: list.position ?? 0,
    status: (list.status ?? 'not_started') as TaskList['status'],
  };
}

export function TaskBoardSettingsPanel({
  boardId,
  wsId,
}: {
  boardId?: string;
  wsId?: string;
}) {
  const t = useTranslations();

  const {
    data: board,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ['task-board-settings', wsId, boardId],
    queryFn: async () => {
      if (!wsId || !boardId) throw new Error('Missing board context');
      const payload = await getWorkspaceTaskBoard(
        wsId,
        boardId,
        getBrowserInternalApiOptions()
      );
      return payload.board;
    },
    enabled: Boolean(wsId && boardId),
    staleTime: 30_000,
  });

  if (!wsId || !boardId) {
    return (
      <EmptyPanel
        title={t('settings.tasks.board')}
        description={t('settings.tasks.board_no_board_description')}
      />
    );
  }

  if (isLoading || !board) return <LoadingPanel />;

  const lists = (board.task_lists ?? []).map((list) =>
    toTaskList(list, board.id)
  );

  return (
    <BoardSettingsNavigation
      boardDetailsLabel={t('settings.tasks.board_details')}
      boardLayoutLabel={t('settings.tasks.board_layout')}
      listCount={lists.length}
    >
      <TabsContent className="space-y-4" value="setup">
        <BoardDetailsSettings
          board={board}
          onRefresh={() => void refetch()}
          wsId={wsId}
        />
        <BoardSprintSettings boardId={board.id} wsId={wsId} />
        <TaskBoardBehaviorSettings />
        <CapacityRulesSettings boardId={board.id} lists={lists} wsId={wsId} />
        <TaskBoardLifecycleSettings board={board} wsId={wsId} />
      </TabsContent>

      <TabsContent value="layout">
        <SettingsGroup
          description={t('settings.tasks.board_layout_description')}
          title={t('settings.tasks.board_layout')}
        >
          <div className="p-4">
            <BoardLayoutSettingsContent
              boardId={board.id}
              disableScrollArea
              lists={lists}
              onUpdate={async () => {
                await refetch();
              }}
              translations={{
                failedToReorderLists: t(
                  'ws-task-boards.layout_settings.failed_to_reorder'
                ),
                listsReordered: t(
                  'ws-task-boards.layout_settings.lists_reordered'
                ),
                // The list fills in {status} itself, so keep it literal.
                movedToStatus: t(
                  'ws-task-boards.layout_settings.moved_to_status',
                  { status: '{status}' }
                ),
              }}
              wsId={wsId}
            />
          </div>
        </SettingsGroup>
      </TabsContent>
    </BoardSettingsNavigation>
  );
}

export function TaskShareSettingsPanel({
  boardId,
  wsId,
}: {
  boardId?: string;
  wsId?: string;
}) {
  const t = useTranslations();
  const { data: board, isLoading } = useQuery({
    queryKey: ['task-share-settings-board', wsId, boardId],
    queryFn: async () => {
      if (!wsId || !boardId) throw new Error('Missing board context');
      const payload = await getWorkspaceTaskBoard(
        wsId,
        boardId,
        getBrowserInternalApiOptions()
      );
      return payload.board;
    },
    enabled: Boolean(wsId && boardId),
    staleTime: 30_000,
  });

  if (!wsId || !boardId) {
    return (
      <EmptyPanel
        title={t('settings.tasks.share')}
        description={t('settings.tasks.share_no_board_description')}
      />
    );
  }

  if (isLoading || !board) return <LoadingPanel />;

  return (
    <BoardShareSettingsPanel
      board={{ id: board.id, name: board.name ?? t('common.untitled') }}
      wsId={wsId}
    />
  );
}

export function TaskLabelsSettings({ wsId }: { wsId: string }) {
  const { data: labels = [], isLoading } = useQuery({
    queryKey: ['task-labels-settings', wsId],
    queryFn: () => listWorkspaceLabels(wsId, getBrowserInternalApiOptions()),
    enabled: !!wsId,
  });

  if (isLoading) return <LoadingPanel />;

  return <TaskLabelsClient initialLabels={labels as TaskLabel[]} wsId={wsId} />;
}

export function TaskProjectsSettings({
  currentUserId,
  workspace,
  wsId,
}: {
  currentUserId?: string;
  workspace?: Workspace | null;
  wsId: string;
}) {
  const { data: projects = [], isLoading } = useQuery({
    queryKey: ['task-projects-settings', wsId],
    queryFn: () =>
      listWorkspaceTaskProjectDetails(wsId, getBrowserInternalApiOptions()),
    enabled: !!wsId,
  });

  if (isLoading) return <LoadingPanel />;

  return (
    <TaskProjectsClient
      currentUserId={currentUserId}
      detailMode="dialog"
      initialProjects={projects as TaskProject[]}
      workspace={workspace}
      wsId={wsId}
    />
  );
}

export function TaskInitiativesSettings({ wsId }: { wsId: string }) {
  const { data: initiatives = [], isLoading } = useQuery({
    queryKey: ['task-initiatives-settings', wsId],
    queryFn: () =>
      listWorkspaceTaskInitiatives(wsId, getBrowserInternalApiOptions()),
    enabled: !!wsId,
  });

  if (isLoading) return <LoadingPanel />;

  return <TaskInitiativesClient initialInitiatives={initiatives} wsId={wsId} />;
}

export function TaskTemplatesSettings({ wsId }: { wsId: string }) {
  const t = useTranslations();
  const [selectedTemplate, setSelectedTemplate] =
    useState<BoardTemplate | null>(null);
  const { data: templates = [], isLoading } = useQuery({
    queryKey: ['task-templates-settings', wsId],
    queryFn: () => listWorkspaceTemplates(wsId, getBrowserInternalApiOptions()),
    enabled: !!wsId,
  });
  const { data: publicTemplates = [], isLoading: isMarketplaceLoading } =
    useQuery({
      queryKey: ['task-template-marketplace-settings'],
      queryFn: listPublicBoardTemplates,
      staleTime: 5 * 60 * 1000,
    });

  if (isLoading) return <LoadingPanel />;

  const boardTemplates: BoardTemplate[] = templates.map((template) => ({
    id: template.id,
    wsId: template.wsId,
    createdBy: template.createdBy,
    sourceBoardId: template.sourceBoardId,
    name: template.name,
    description: template.description,
    visibility: template.visibility,
    backgroundUrl: template.backgroundUrl ?? null,
    createdAt: template.createdAt,
    updatedAt: template.updatedAt,
    isOwner: template.isOwner,
    stats: template.stats,
  }));

  return (
    <>
      <Tabs defaultValue="workspace" className="space-y-4">
        <TabsList>
          <TabsTrigger value="workspace">
            {t('ws-board-templates.gallery.header')}
          </TabsTrigger>
          <TabsTrigger value="marketplace">
            {t('ws-board-templates.marketplace.header')}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="workspace">
          <TaskTemplatesHub
            boardTemplates={boardTemplates}
            onOpenBoardTemplate={setSelectedTemplate}
            templatesBasePath="templates"
            wsId={wsId}
          />
        </TabsContent>
        <TabsContent value="marketplace">
          {isMarketplaceLoading ? (
            <LoadingPanel />
          ) : (
            <MarketplaceClient
              onOpenTemplate={setSelectedTemplate}
              templates={publicTemplates}
              templatesBasePath="templates"
              wsId={wsId}
            />
          )}
        </TabsContent>
      </Tabs>
      <Dialog
        open={Boolean(selectedTemplate)}
        onOpenChange={(open) => {
          if (!open) setSelectedTemplate(null);
        }}
      >
        <DialogContent className="max-h-[90vh] max-w-6xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="sr-only">
              {selectedTemplate?.name ?? ''}
            </DialogTitle>
          </DialogHeader>
          {selectedTemplate && (
            <TaskTemplateDetailPageClient
              embedded
              initialBackgroundUrl={selectedTemplate.backgroundUrl ?? null}
              onClose={() => setSelectedTemplate(null)}
              templateId={selectedTemplate.id}
              templatesBasePath="templates"
              wsId={wsId}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

export function TaskLogsSettings({ wsId }: { wsId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['task-logs-settings-boards', wsId],
    queryFn: () =>
      listWorkspaceTaskBoards(
        wsId,
        { pageSize: 100, status: 'all' },
        getBrowserInternalApiOptions()
      ),
    enabled: !!wsId,
  });

  if (isLoading) return <LoadingPanel />;

  const boards = (data?.boards ?? []).filter((board) => !board.deleted_at);
  const boardList = boards.map((board) => ({
    id: board.id,
    name: board.name,
  }));
  const estimationTypes: Record<string, string | null> = {};
  for (const board of boards) {
    estimationTypes[board.id] = board.estimation_type ?? null;
  }

  return (
    <LogsClient
      boards={boardList}
      estimationTypes={estimationTypes}
      wsId={wsId}
    />
  );
}

export function TaskHabitsSettings({ wsId }: { wsId: string }) {
  return <HabitsClientPage wsId={wsId} />;
}

export function TaskNotesSettings({ wsId }: { wsId: string }) {
  return <NotesContent wsId={wsId} />;
}

export function TaskDraftsSettings({ wsId }: { wsId: string }) {
  return <DraftsPage wsId={wsId} />;
}

export function TaskEstimatesSettings({ wsId }: { wsId: string }) {
  return <TaskEstimatesClient wsId={wsId} />;
}
