'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { KanbanSquare, Loader2, Plus } from '@tuturuuu/icons';
import { checkWorkspacePermission } from '@tuturuuu/internal-api/settings';
import { createWorkspaceTaskBoard } from '@tuturuuu/internal-api/tasks';
import { listWorkspaces } from '@tuturuuu/internal-api/workspaces';
import { Button } from '@tuturuuu/ui/button';
import { Combobox } from '@tuturuuu/ui/custom/combobox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@tuturuuu/ui/dialog';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { toast } from '@tuturuuu/ui/sonner';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { type ReactNode, useMemo, useState } from 'react';
import { useTasksHref } from '../tasks-route-context';

interface CreateBoardAnywhereDialogProps {
  children?: ReactNode;
  currentWorkspaceId?: string;
}

export function CreateBoardAnywhereDialog({
  children,
  currentWorkspaceId,
}: CreateBoardAnywhereDialogProps) {
  const t = useTranslations('ws-task-boards.create_anywhere');
  const router = useRouter();
  const tasksHref = useTasksHref();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [workspaceId, setWorkspaceId] = useState(currentWorkspaceId ?? '');

  const workspacesQuery = useQuery({
    queryKey: ['task-board-create-workspaces'],
    queryFn: async () => {
      const workspaces = await listWorkspaces({ limit: 200 });
      const permissions = await Promise.all(
        workspaces.map(async (workspace) => {
          try {
            const result = await checkWorkspacePermission(
              workspace.id,
              'manage_projects'
            );
            return result.hasPermission ? workspace : null;
          } catch {
            return null;
          }
        })
      );
      return permissions.filter((workspace) => workspace !== null);
    },
    enabled: open,
    staleTime: 5 * 60 * 1000,
  });

  const workspaceOptions = useMemo(
    () =>
      (workspacesQuery.data ?? []).map((workspace) => ({
        value: workspace.id,
        label: workspace.name || t('untitled_workspace'),
        description: workspace.personal ? t('personal_workspace') : undefined,
        icon: <KanbanSquare className="size-4" />,
      })),
    [t, workspacesQuery.data]
  );

  const effectiveWorkspaceId = workspaceOptions.some(
    (option) => option.value === workspaceId
  )
    ? workspaceId
    : (workspaceOptions[0]?.value ?? '');

  const createMutation = useMutation({
    mutationFn: async () => {
      const boardName = name.trim();
      if (!effectiveWorkspaceId || !boardName) {
        throw new Error('Missing board details');
      }
      const payload = await createWorkspaceTaskBoard(effectiveWorkspaceId, {
        name: boardName,
      });
      return { payload, workspaceId: effectiveWorkspaceId };
    },
    onSuccess: async ({ payload, workspaceId: createdWorkspaceId }) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['accessible-task-boards'] }),
        queryClient.invalidateQueries({
          queryKey: ['boards', createdWorkspaceId],
        }),
        queryClient.invalidateQueries({
          queryKey: ['task-settings-board-picker', createdWorkspaceId],
        }),
        queryClient.invalidateQueries({
          queryKey: ['task-settings-default-board', createdWorkspaceId],
        }),
      ]);
      setOpen(false);
      setName('');
      toast.success(t('created'));
      router.push(
        `/${createdWorkspaceId}${tasksHref(`/boards/${payload.board.id}`)}`
      );
    },
    onError: () => toast.error(t('create_failed')),
  });

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (nextOpen && !workspaceId && currentWorkspaceId) {
      setWorkspaceId(currentWorkspaceId);
    }
  };

  const hasWorkspaceOptions = workspaceOptions.length > 0;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {children ?? (
          <Button type="button" size="sm" className="gap-2">
            <Plus className="size-4" />
            {t('action')}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-5 py-2">
          <div className="grid gap-2">
            <Label>{t('workspace')}</Label>
            <Combobox
              ariaLabel={t('workspace')}
              disabled={workspacesQuery.isLoading || !hasWorkspaceOptions}
              emptyText={
                workspacesQuery.isError
                  ? t('workspace_error')
                  : t('workspace_empty')
              }
              onChange={(value) =>
                setWorkspaceId(typeof value === 'string' ? value : '')
              }
              options={workspaceOptions}
              placeholder={
                workspacesQuery.isLoading
                  ? t('workspace_loading')
                  : t('workspace_placeholder')
              }
              searchPlaceholder={t('workspace_search')}
              selected={effectiveWorkspaceId}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="create-board-anywhere-name">{t('name')}</Label>
            <Input
              id="create-board-anywhere-name"
              autoComplete="off"
              autoFocus
              maxLength={120}
              onChange={(event) => setName(event.target.value)}
              placeholder={t('name_placeholder')}
              value={name}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={createMutation.isPending}
          >
            {t('cancel')}
          </Button>
          <Button
            type="button"
            onClick={() => createMutation.mutate()}
            disabled={
              !effectiveWorkspaceId || !name.trim() || createMutation.isPending
            }
          >
            {createMutation.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Plus className="size-4" />
            )}
            {createMutation.isPending ? t('creating') : t('create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
