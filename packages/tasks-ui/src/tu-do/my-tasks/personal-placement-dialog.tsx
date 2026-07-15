'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Loader2 } from '@tuturuuu/icons';
import {
  listWorkspaces,
  listWorkspaceTaskBoards,
  upsertCurrentUserTaskPersonalPlacement,
} from '@tuturuuu/internal-api';
import type { TaskWithRelations } from '@tuturuuu/types';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { toast } from '@tuturuuu/ui/sonner';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';

interface PersonalPlacementDialogProps {
  task: TaskWithRelations | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPlaced?: () => void;
}

interface PersonalBoardOption {
  id: string;
  name: string | null;
  workspaceId: string;
  workspaceName: string | null;
}

export function PersonalPlacementDialog({
  task,
  open,
  onOpenChange,
  onPlaced,
}: PersonalPlacementDialogProps) {
  const t = useTranslations('ws-tasks');
  const tCommon = useTranslations('common');
  const queryClient = useQueryClient();
  const [selectedBoardId, setSelectedBoardId] = useState<string | null>(null);

  const { data: personalBoards = [], isLoading } = useQuery({
    queryKey: ['personal-placement-boards'],
    queryFn: async () => {
      const workspaces = await listWorkspaces();
      const personalWorkspaces = workspaces.filter(
        (workspace) => workspace.personal
      );

      const boardGroups = await Promise.all(
        personalWorkspaces.map(async (workspace) => {
          const payload = await listWorkspaceTaskBoards(workspace.id, {
            page: 1,
            pageSize: 200,
            status: 'active',
          });

          return (payload.boards ?? []).map(
            (board): PersonalBoardOption => ({
              id: board.id,
              name: board.name,
              workspaceId: workspace.id,
              workspaceName: workspace.name,
            })
          );
        })
      );

      return boardGroups.flat();
    },
    enabled: open,
  });

  const selectedBoard = useMemo(
    () => personalBoards.find((board) => board.id === selectedBoardId) ?? null,
    [personalBoards, selectedBoardId]
  );

  const placeMutation = useMutation({
    mutationFn: async () => {
      if (!task || !selectedBoardId) {
        throw new Error('Missing task or board');
      }

      await upsertCurrentUserTaskPersonalPlacement(task.id, {
        personal_board_id: selectedBoardId,
        personal_list_id: null,
        personal_sort_key: null,
      });
    },
    onSuccess: () => {
      toast.success(t('placed_on_personal_board'));
      queryClient.invalidateQueries({
        queryKey: ['personal-placement-boards'],
      });
      onPlaced?.();
      onOpenChange(false);
      setSelectedBoardId(null);
    },
    onError: () => {
      toast.error(t('failed_update_personal_placement'));
    },
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        onOpenChange(nextOpen);
        if (!nextOpen) setSelectedBoardId(null);
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('place_on_personal_board')}</DialogTitle>
          <DialogDescription>
            {t('place_on_personal_board_description')}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-72 space-y-2 overflow-y-auto">
          {isLoading ? (
            <div className="flex h-28 items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : personalBoards.length === 0 ? (
            <div className="rounded-lg border border-dashed p-4 text-center text-muted-foreground text-sm">
              {t('no_personal_boards_available')}
            </div>
          ) : (
            personalBoards.map((board) => (
              <button
                key={board.id}
                type="button"
                onClick={() => setSelectedBoardId(board.id)}
                className={cn(
                  'flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left transition-colors',
                  selectedBoardId === board.id
                    ? 'border-primary bg-primary/8'
                    : 'border-border hover:bg-muted/50'
                )}
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium text-sm">
                    {board.name || t('untitled_board')}
                  </span>
                  <span className="block truncate text-muted-foreground text-xs">
                    {board.workspaceName || t('personal_workspace')}
                  </span>
                </span>
                {selectedBoardId === board.id && (
                  <Check className="h-4 w-4 shrink-0 text-primary" />
                )}
              </button>
            ))
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={placeMutation.isPending}
          >
            {tCommon('cancel')}
          </Button>
          <Button
            onClick={() => placeMutation.mutate()}
            disabled={!task || !selectedBoard || placeMutation.isPending}
          >
            {placeMutation.isPending && (
              <Loader2 className="h-4 w-4 animate-spin" />
            )}
            {t('place_on_personal_board')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
