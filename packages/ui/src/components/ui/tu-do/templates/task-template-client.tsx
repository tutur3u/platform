'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileText, Plus, Save, Search } from '@tuturuuu/icons';
import {
  listWorkspaceTaskBoards,
  listWorkspaceTaskLists,
  type WorkspaceTaskListSummary,
} from '@tuturuuu/internal-api/tasks';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent } from '@tuturuuu/ui/card';
import { Input } from '@tuturuuu/ui/input';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import {
  createWorkspaceTaskTemplate,
  deleteWorkspaceTaskTemplate,
  instantiateWorkspaceTaskTemplate,
  listWorkspaceTaskTemplates,
  saveWorkspaceTaskTemplateFromTask,
  type WorkspaceTaskTemplate,
  type WorkspaceTaskTemplatePayload,
} from './task-template-api';
import { TaskTemplateCard } from './task-template-card';
import {
  CreateTaskTemplateDialog,
  SaveTaskTemplateFromTaskDialog,
  UseTaskTemplateDialog,
} from './task-template-dialogs';

interface TaskTemplateClientProps {
  initialTemplates?: WorkspaceTaskTemplate[];
  wsId: string;
}

export function TaskTemplateClient({
  initialTemplates = [],
  wsId,
}: TaskTemplateClientProps) {
  const t = useTranslations('ws-task-templates');
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [saveFromTaskOpen, setSaveFromTaskOpen] = useState(false);
  const [useOpen, setUseOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] =
    useState<WorkspaceTaskTemplate | null>(null);
  const [selectedBoardId, setSelectedBoardId] = useState('');
  const [selectedListId, setSelectedListId] = useState('');

  const templatesQueryKey = ['task-templates', wsId] as const;

  const { data: templates = initialTemplates } = useQuery({
    queryKey: templatesQueryKey,
    queryFn: async () => {
      const payload = await listWorkspaceTaskTemplates(wsId);
      return payload.templates;
    },
    initialData: initialTemplates,
  });

  const { data: boards = [] } = useQuery({
    queryKey: ['task-template-boards', wsId],
    queryFn: async () => {
      const payload = await listWorkspaceTaskBoards(wsId);
      return payload.boards.filter(
        (board) => !board.archived_at && !board.deleted_at
      );
    },
    enabled: useOpen,
  });

  const { data: lists = [], isLoading: loadingLists } = useQuery({
    queryKey: ['task-template-lists', wsId, selectedBoardId],
    queryFn: async (): Promise<WorkspaceTaskListSummary[]> => {
      if (!selectedBoardId) return [];
      const payload = await listWorkspaceTaskLists(wsId, selectedBoardId);
      return payload.lists.filter((list) => !list.deleted);
    },
    enabled: useOpen && Boolean(selectedBoardId),
  });

  const filteredTemplates = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return templates;

    return templates.filter((template) =>
      [template.name, template.slug, template.task_name, template.description]
        .filter(Boolean)
        .some((value) => value?.toLowerCase().includes(query))
    );
  }, [search, templates]);

  const createMutation = useMutation({
    mutationFn: (payload: WorkspaceTaskTemplatePayload) =>
      createWorkspaceTaskTemplate(wsId, payload),
    onSuccess: async () => {
      toast.success(t('toast.created'));
      setCreateOpen(false);
      await queryClient.invalidateQueries({ queryKey: templatesQueryKey });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : t('toast.failed'));
    },
  });

  const saveFromTaskMutation = useMutation({
    mutationFn: (payload: {
      name?: string;
      taskId: string;
      visibility: 'private' | 'workspace';
    }) =>
      saveWorkspaceTaskTemplateFromTask(wsId, {
        name: payload.name,
        taskId: payload.taskId,
        visibility: payload.visibility,
      }),
    onSuccess: async () => {
      toast.success(t('toast.saved_from_task'));
      setSaveFromTaskOpen(false);
      await queryClient.invalidateQueries({ queryKey: templatesQueryKey });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : t('toast.failed'));
    },
  });

  const useMutationForTemplate = useMutation({
    mutationFn: (payload: { listId: string; name?: string }) => {
      if (!selectedTemplate) {
        throw new Error(t('toast.no_template_selected'));
      }
      return instantiateWorkspaceTaskTemplate(wsId, selectedTemplate.slug, {
        listId: payload.listId,
        name: payload.name,
      });
    },
    onSuccess: async () => {
      toast.success(t('toast.task_created'));
      setUseOpen(false);
      setSelectedTemplate(null);
      setSelectedBoardId('');
      setSelectedListId('');
      await queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : t('toast.failed'));
    },
  });

  const archiveMutation = useMutation({
    mutationFn: (template: WorkspaceTaskTemplate) =>
      deleteWorkspaceTaskTemplate(wsId, template.id),
    onSuccess: async () => {
      toast.success(t('toast.archived'));
      await queryClient.invalidateQueries({ queryKey: templatesQueryKey });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : t('toast.failed'));
    },
  });

  const openUseDialog = (template: WorkspaceTaskTemplate) => {
    setSelectedTemplate(template);
    setSelectedBoardId(template.default_board_id ?? '');
    setSelectedListId(template.default_list_id ?? '');
    setUseOpen(true);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-2">
            <p className="font-medium text-sm leading-none">
              {t('fields.search')}
            </p>
            <div className="relative w-full sm:w-80">
              <Input
                className="pl-9"
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t('fields.search_placeholder')}
                value={search}
              />
              <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              className="gap-2"
              onClick={() => setSaveFromTaskOpen(true)}
              variant="outline"
            >
              <Save className="h-4 w-4" />
              {t('actions.save_from_task')}
            </Button>
            <Button className="gap-2" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" />
              {t('actions.new_template')}
            </Button>
          </div>
        </CardContent>
      </Card>

      {filteredTemplates.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
          <FileText className="mb-4 h-10 w-10 text-muted-foreground/50" />
          <h3 className="font-semibold text-lg">{t('empty.title')}</h3>
          <p className="mt-2 max-w-sm text-muted-foreground text-sm">
            {search ? t('empty.no_results') : t('empty.description')}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredTemplates.map((template) => (
            <TaskTemplateCard
              key={template.id}
              onArchive={(item) => archiveMutation.mutate(item)}
              onUse={openUseDialog}
              template={template}
            />
          ))}
        </div>
      )}

      <CreateTaskTemplateDialog
        onCreate={(payload) => createMutation.mutate(payload)}
        onOpenChange={setCreateOpen}
        open={createOpen}
        pending={createMutation.isPending}
      />
      <SaveTaskTemplateFromTaskDialog
        onOpenChange={setSaveFromTaskOpen}
        onSave={(payload) => saveFromTaskMutation.mutate(payload)}
        open={saveFromTaskOpen}
        pending={saveFromTaskMutation.isPending}
      />
      <UseTaskTemplateDialog
        boards={boards}
        lists={lists}
        loadingLists={loadingLists}
        onBoardChange={(boardId) => {
          setSelectedBoardId(boardId);
          setSelectedListId('');
        }}
        onListChange={setSelectedListId}
        onOpenChange={setUseOpen}
        onUse={(payload) => useMutationForTemplate.mutate(payload)}
        open={useOpen}
        pending={useMutationForTemplate.isPending}
        selectedBoardId={selectedBoardId}
        selectedListId={selectedListId}
        template={selectedTemplate}
      />
    </div>
  );
}
