'use client';

import type {
  WorkspaceTaskRecurrenceState,
  WorkspaceTaskRecurrenceStatusAction,
} from '@tuturuuu/internal-api/task-recurrence';
import {
  CircleStop,
  MoreHorizontal,
  Pause,
  Pencil,
  Play,
} from '@tuturuuu/icons';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@tuturuuu/ui/alert-dialog';
import { Button } from '@tuturuuu/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

interface TaskRecurrenceStatusMenuProps {
  state: WorkspaceTaskRecurrenceState;
  disabled?: boolean;
  onEdit: () => void;
  onStatus: (action: WorkspaceTaskRecurrenceStatusAction) => void;
}

/** Series actions: edit, pause or resume, and end after confirmation. */
export function TaskRecurrenceStatusMenu({
  state,
  disabled = false,
  onEdit,
  onStatus,
}: TaskRecurrenceStatusMenuProps) {
  const t = useTranslations('ws-task-boards.recurrence');
  const [confirmEnd, setConfirmEnd] = useState(false);
  if (state === 'ended') return null;
  const paused = state === 'paused';

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8"
            disabled={disabled}
            aria-label={t('actions')}
          >
            <MoreHorizontal aria-hidden="true" className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        {/* Focus stays put so the edit popover this opens does not close. */}
        <DropdownMenuContent
          align="end"
          onCloseAutoFocus={(event) => event.preventDefault()}
        >
          <DropdownMenuItem onSelect={onEdit}>
            <Pencil aria-hidden="true" className="size-4" />
            {t('edit')}
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => onStatus(paused ? 'resume' : 'pause')}
          >
            {paused ? (
              <Play aria-hidden="true" className="size-4" />
            ) : (
              <Pause aria-hidden="true" className="size-4" />
            )}
            {t(paused ? 'resume' : 'pause')}
          </DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            onSelect={() => setConfirmEnd(true)}
          >
            <CircleStop aria-hidden="true" className="size-4" />
            {t('end')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <AlertDialog open={confirmEnd} onOpenChange={setConfirmEnd}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('end_confirm_title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('end_confirm_description')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={() => onStatus('end')}>
              {t('end')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
