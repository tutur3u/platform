'use client';

import {
  Copy,
  ExternalLink,
  ListTodo,
  MoreVertical,
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
import { useToast } from '@tuturuuu/ui/hooks/use-toast';
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

  // Callbacks
  onClose: () => void;
  onShowDeleteDialog: () => void;
  onClearDraft: () => void;
}

export function TaskDialogActions({
  isCreateMode,
  hasDraft,
  taskId,
  wsId,
  boardId,
  pathname,
  onClose,
  onShowDeleteDialog,
  onClearDraft,
}: TaskDialogActionsProps) {
  const { toast } = useToast();
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);

  return (
    <>
      {/* More options menu - only in edit mode */}
      {!isCreateMode && taskId && (
        <DropdownMenu open={isMoreMenuOpen} onOpenChange={setIsMoreMenuOpen}>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-foreground"
              title="More options"
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
              View Board
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => {
                navigator.clipboard.writeText(taskId);
                toast({
                  title: 'Task ID copied',
                  description: 'Task ID has been copied to clipboard',
                });
                setIsMoreMenuOpen(false);
              }}
            >
              <Copy className="mr-2 h-4 w-4" />
              Copy ID
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                const url = `${window.location.origin}${pathname?.split('/tasks/')[0]}/tasks/${taskId}`;
                navigator.clipboard.writeText(url);
                toast({
                  title: 'Link copied',
                  description: 'Task link has been copied to clipboard',
                });
                setIsMoreMenuOpen(false);
              }}
            >
              <ExternalLink className="mr-2 h-4 w-4" />
              Copy Link
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
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {/* Close button */}
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 text-muted-foreground hover:text-foreground"
        onClick={onClose}
        title="Close"
      >
        <X className="h-4 w-4" />
      </Button>

      {/* Discard draft button - only in create mode with draft */}
      {isCreateMode && hasDraft && (
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground hover:text-dynamic-red"
          onClick={onClearDraft}
          title="Discard draft"
        >
          <Trash className="h-4 w-4" />
        </Button>
      )}
    </>
  );
}
