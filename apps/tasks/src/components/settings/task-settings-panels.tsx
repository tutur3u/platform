'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Save } from '@tuturuuu/icons';
import {
  getWorkspaceTaskBoard,
  listWorkspaceLabels,
  listWorkspaceTaskBoards,
  listWorkspaceTaskInitiatives,
  listWorkspaceTaskProjectDetails,
  updateWorkspaceTaskBoard,
  type WorkspaceTaskBoardDetail,
} from '@tuturuuu/internal-api/tasks';
import { listWorkspaceTemplates } from '@tuturuuu/internal-api/templates';
import type { Workspace } from '@tuturuuu/types';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import { Button } from '@tuturuuu/ui/button';
import { Combobox } from '@tuturuuu/ui/custom/combobox';
import IconPicker from '@tuturuuu/ui/custom/icon-picker';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { toast } from '@tuturuuu/ui/sonner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { BoardShareSettingsPanel } from '@tuturuuu/ui/tu-do/boards/board-share-settings-panel';
import { DraftsPage } from '@tuturuuu/ui/tu-do/drafts/drafts-page';
import TaskEstimatesClient from '@tuturuuu/ui/tu-do/estimates/client';
import HabitsClientPage from '@tuturuuu/ui/tu-do/habits/client';
import { TaskInitiativesClient } from '@tuturuuu/ui/tu-do/initiatives/task-initiatives-client';
import TaskLabelsClient from '@tuturuuu/ui/tu-do/labels/client';
import type { TaskLabel } from '@tuturuuu/ui/tu-do/labels/types';
import LogsClient from '@tuturuuu/ui/tu-do/logs/logs-client';
import NotesContent from '@tuturuuu/ui/tu-do/notes/notes-content';
import { TaskProjectsClient } from '@tuturuuu/ui/tu-do/projects/task-projects-client';
import type { TaskProject } from '@tuturuuu/ui/tu-do/projects/types';
import { BoardLayoutSettingsContent } from '@tuturuuu/ui/tu-do/shared/board-layout-settings';
import MarketplaceClient from '@tuturuuu/ui/tu-do/templates/marketplace/client';
import { TaskTemplatesHub } from '@tuturuuu/ui/tu-do/templates/task-templates-hub';
import TaskTemplateDetailPageClient from '@tuturuuu/ui/tu-do/templates/templateId/task-template-detail-page-client';
import type { BoardTemplate } from '@tuturuuu/ui/tu-do/templates/types';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';
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
    <div className="space-y-6">
      <BoardDetailsSettings
        board={board}
        onRefresh={() => void refetch()}
        wsId={wsId}
      />
      <div className="space-y-4 rounded-lg border bg-background p-4">
        <div className="space-y-1">
          <h3 className="font-medium">{t('settings.tasks.board_layout')}</h3>
          <p className="text-muted-foreground text-sm">
            {t('settings.tasks.board_layout_description')}
          </p>
        </div>
        <BoardLayoutSettingsContent
          boardId={board.id}
          disableScrollArea
          lists={lists}
          onUpdate={() => void refetch()}
          wsId={wsId}
        />
      </div>
    </div>
  );
}

function BoardDetailsSettings({
  board,
  onRefresh,
  wsId,
}: {
  board: WorkspaceTaskBoardDetail;
  onRefresh: () => void;
  wsId: string;
}) {
  const t = useTranslations();
  const queryClient = useQueryClient();
  const [boardName, setBoardName] = useState(board.name ?? '');
  const [boardIcon, setBoardIcon] = useState<string | null>(board.icon ?? null);
  const [ticketPrefix, setTicketPrefix] = useState(board.ticket_prefix ?? '');
  const [defaultListId, setDefaultListId] = useState(
    board.default_list_id ?? '__none__'
  );

  useEffect(() => {
    setBoardName(board.name ?? '');
    setBoardIcon(board.icon ?? null);
    setTicketPrefix(board.ticket_prefix ?? '');
    setDefaultListId(board.default_list_id ?? '__none__');
  }, [board.default_list_id, board.icon, board.name, board.ticket_prefix]);

  const listOptions = useMemo(
    () => [
      {
        label: t('settings.tasks.no_default_list'),
        value: '__none__',
      },
      ...(board.task_lists ?? [])
        .filter((list) => !list.deleted)
        .map((list) => ({
          label: list.name || t('settings.tasks.untitled_list'),
          value: list.id,
        })),
    ],
    [board.task_lists, t]
  );

  const normalizedBoardName =
    boardName.trim() || t('ws-task-boards.unnamed_board');
  const normalizedTicketPrefix = ticketPrefix.trim().toUpperCase() || null;
  const normalizedDefaultListId =
    defaultListId === '__none__' ? null : defaultListId;
  const isDirty =
    normalizedBoardName !== (board.name || t('ws-task-boards.unnamed_board')) ||
    (boardIcon ?? null) !== (board.icon ?? null) ||
    normalizedTicketPrefix !== (board.ticket_prefix ?? null) ||
    normalizedDefaultListId !== (board.default_list_id ?? null);

  const updateBoardMutation = useMutation({
    mutationFn: () =>
      updateWorkspaceTaskBoard(
        wsId,
        board.id,
        {
          default_list_id: normalizedDefaultListId,
          icon: boardIcon as WorkspaceTaskBoardDetail['icon'],
          name: normalizedBoardName,
          ticket_prefix: normalizedTicketPrefix,
        },
        getBrowserInternalApiOptions()
      ),
    onSuccess: async () => {
      toast.success(t('ws-task-boards.toast.update_success'));
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ['task-board-settings', wsId, board.id],
        }),
        queryClient.invalidateQueries({
          queryKey: ['task-board', wsId, board.id],
        }),
        queryClient.invalidateQueries({
          queryKey: ['boards', wsId],
        }),
      ]);
      onRefresh();
    },
    onError: (error) => {
      toast.error(t('ws-task-boards.errors.unexpected'), {
        description: error instanceof Error ? error.message : undefined,
      });
    },
  });

  return (
    <div className="space-y-5 rounded-lg border bg-background p-4">
      <div className="space-y-1">
        <h3 className="font-medium">{t('settings.tasks.board_details')}</h3>
        <p className="text-muted-foreground text-sm">
          {t('settings.tasks.board_details_description')}
        </p>
      </div>

      <div className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-end">
          <div className="w-fit space-y-2">
            <Label className="font-semibold text-muted-foreground text-xs uppercase tracking-wider">
              {t('ws-task-boards.icon_label')}
            </Label>
            <IconPicker
              ariaLabel={t('ws-task-boards.icon_picker.title')}
              clearLabel={t('ws-task-boards.icon_picker.clear')}
              description={t('ws-task-boards.icon_picker.description')}
              onValueChange={setBoardIcon}
              searchPlaceholder={t(
                'ws-task-boards.icon_picker.search_placeholder'
              )}
              title={t('ws-task-boards.icon_picker.title')}
              value={boardIcon}
            />
          </div>

          <div className="min-w-0 space-y-2">
            <Label htmlFor="board-name">{t('ws-task-boards.name')}</Label>
            <Input
              autoComplete="off"
              id="board-name"
              onChange={(event) => setBoardName(event.target.value)}
              placeholder={t('ws-task-boards.unnamed_board')}
              value={boardName}
            />
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="board-ticket-prefix">
              {t('ws-task-boards.settings.ticket_prefix')}
            </Label>
            <Input
              id="board-ticket-prefix"
              maxLength={12}
              onChange={(event) => setTicketPrefix(event.target.value)}
              placeholder={t(
                'ws-task-boards.settings.ticket_prefix_placeholder'
              )}
              value={ticketPrefix}
            />
          </div>

          <div className="space-y-2">
            <Label>{t('settings.tasks.default_list')}</Label>
            <Combobox
              contentWidth="md"
              mode="single"
              onChange={(value) => {
                if (typeof value === 'string') setDefaultListId(value);
              }}
              options={listOptions}
              placeholder={t('settings.tasks.no_default_list')}
              searchPlaceholder={t('common.search_tasks')}
              selected={defaultListId}
            />
          </div>
        </div>

        <div className="flex justify-end">
          <Button
            disabled={updateBoardMutation.isPending || !isDirty}
            onClick={() => updateBoardMutation.mutate()}
            type="button"
          >
            {updateBoardMutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            {t('common.save_changes')}
          </Button>
        </div>
      </div>
    </div>
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
