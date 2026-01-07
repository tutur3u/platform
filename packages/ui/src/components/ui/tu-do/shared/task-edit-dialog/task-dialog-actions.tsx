'use client';

import {
  ArrowLeft,
  Copy,
  ExternalLink,
  ListTodo,
  MoreVertical,
  Share2,
  Trash,
  X,
} from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { toast } from '@tuturuuu/ui/sonner';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

interface TaskDialogActionsProps {
  // Mode
  isCreateMode: boolean;
  hasDraft: boolean;

  // Task info (only in edit mode)
  taskId?: string;
  wsId: string;
  boardId: string;
  pathname?: string | null;

  // Navigate back info (for create mode with pending relationship)
  navigateBackTaskName?: string | null;

  // Callbacks
  onClose: () => void;
  onShowDeleteDialog: () => void;
  onClearDraft: () => void;
  onNavigateBack?: () => void;
  onOpenShareDialog?: () => void;
  disabled?: boolean;
}

export function TaskDialogActions({
  isCreateMode,
  hasDraft,
  taskId,
  wsId,
  boardId,
  pathname,
  navigateBackTaskName,
  onClose,
  onShowDeleteDialog,
  onClearDraft,
  onNavigateBack,
  onOpenShareDialog,
  disabled = false,
}: TaskDialogActionsProps) {
  const t = useTranslations();
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);

  // Determine if we should show the back button (create mode with a pending relationship)
  const showBackButton = isCreateMode && onNavigateBack && navigateBackTaskName;

  return (
    <>
      {/* Share button - only in edit mode */}
      {!isCreateMode && taskId && onOpenShareDialog && !disabled && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-foreground"
              onClick={onOpenShareDialog}
              title={t('common.task_sharing.share_task')}
            >
              <Share2 className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            {t('common.task_sharing.share_task')}
          </TooltipContent>
        </Tooltip>
      )}

      {/* More options menu - only in edit mode */}
      {!isCreateMode && taskId && !disabled && (
        <DropdownMenu open={isMoreMenuOpen} onOpenChange={setIsMoreMenuOpen}>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-foreground"
              title={t('common.more_options')}
            >
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onClick={() => {
                // Navigate to board view
                const boardUrl = `/${wsId}/tasks/boards/${boardId}`;
                window.location.href = boardUrl;
                setIsMoreMenuOpen(false);
              }}
            >
              <ListTodo className="mr-2 h-4 w-4" />
              {t('ws-task-boards.actions.view_board')}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => {
                navigator.clipboard.writeText(taskId);
                toast.success(t('ws-task-boards.messages.task_id_copied'));
                setIsMoreMenuOpen(false);
              }}
            >
              <Copy className="mr-2 h-4 w-4" />
              {t('common.copy_id')}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                const url = `${window.location.origin}${pathname?.split('/tasks/')[0]}/tasks/${taskId}`;
                navigator.clipboard.writeText(url);
                toast.success(t('ws-task-boards.messages.task_link_copied'));
                setIsMoreMenuOpen(false);
              }}
            >
              <ExternalLink className="mr-2 h-4 w-4" />
              {t('common.copy_link')}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => {
                onShowDeleteDialog();
                setIsMoreMenuOpen(false);
              }}
              className="text-dynamic-red focus:text-dynamic-red"
            >
              <Trash className="mr-2 h-4 w-4" />
              {t('common.delete')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {/* Back to related task button - only in create mode with pending relationship */}
      {showBackButton && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-foreground"
              onClick={onNavigateBack}
              title={t('common.back_to', { name: navigateBackTaskName })}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            {t('common.back_to', { name: navigateBackTaskName })}
          </TooltipContent>
        </Tooltip>
      )}

      {/* Close button */}
      {!disabled && (
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground hover:text-foreground"
          onClick={onClose}
          title={t('common.close')}
        >
          <X className="h-4 w-4" />
        </Button>
      )}

      {/* Discard draft button - only in create mode with draft */}
      {isCreateMode && hasDraft && (
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground hover:text-dynamic-red"
          onClick={onClearDraft}
          title={t('common.discard_draft')}
        >
          <Trash className="h-4 w-4" />
        </Button>
      )}
    </>
  );
}
