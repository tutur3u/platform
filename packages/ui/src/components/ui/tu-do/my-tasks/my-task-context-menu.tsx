'use client';

import {
  CheckCircle2,
  ExternalLink,
  RotateCcw,
  Trash2,
  UserCheck,
  UserMinus,
  UserX,
} from '@tuturuuu/icons';
import type { TaskWithRelations } from '@tuturuuu/types';
import type { TaskPriority } from '@tuturuuu/types/primitives/Priority';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { TaskDueDateMenu } from '@tuturuuu/ui/tu-do/boards/boardId/menus/task-due-date-menu';
import { TaskLabelsMenu } from '@tuturuuu/ui/tu-do/boards/boardId/menus/task-labels-menu';
import { TaskPriorityMenu } from '@tuturuuu/ui/tu-do/boards/boardId/menus/task-priority-menu';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useCallback } from 'react';
import { useTaskContextActions } from './use-task-context-actions';

interface MyTaskContextMenuProps {
  task: TaskWithRelations;
  userId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  menuGuardUntil: number;
  isPersonal: boolean;
  availableLabels: Array<{ id: string; name: string; color: string }>;
  onTaskUpdate: () => void;
  onCreateNewLabel?: () => void;
  children: React.ReactNode;
}

export function MyTaskContextMenu({
  task,
  userId,
  open,
  onOpenChange,
  menuGuardUntil,
  isPersonal,
  availableLabels,
  onTaskUpdate,
  onCreateNewLabel,
  children,
}: MyTaskContextMenuProps) {
  const t = useTranslations('ws-tasks');

  const {
    isLoading,
    handlePriorityChange,
    handleDueDateChange,
    handleToggleLabel,
    handleComplete,
    handleUndoComplete,
    handleDoneWithMyPart,
    handleUndoDoneWithMyPart,
    handleUnassignMe,
    handleDelete,
  } = useTaskContextActions({
    task,
    userId,
    onTaskUpdate,
    onClose: () => onOpenChange(false),
  });

  const isListDone = task.list?.status === 'done';
  const isPersonallyCompleted = !!task.overrides?.completed_at;
  const isPersonallyUnassigned = !!task.overrides?.personally_unassigned;

  const handleMenuItemSelect = useCallback(
    (e: Event, action: () => void) => {
      if (Date.now() < menuGuardUntil) {
        e?.preventDefault?.();
        return;
      }
      action();
    },
    [menuGuardUntil]
  );

  const taskLabels = (task.labels ?? [])
    .map((l) => l.label)
    .filter((l): l is NonNullable<typeof l> => l != null)
    .map(({ id, name, color }) => ({ id, name, color }));

  const isFromPersonalWorkspace =
    (task.list?.board as Record<string, unknown> | undefined)?.workspaces !=
      null &&
    (
      (task.list?.board as Record<string, unknown>)?.workspaces as Record<
        string,
        unknown
      >
    )?.personal === true;

  const boardUrl =
    task.list?.board?.ws_id && task.list?.board?.id
      ? `/${task.list.board.ws_id}/tasks/boards/${task.list.board.id}`
      : null;

  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange} modal={false}>
      <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
      <DropdownMenuContent
        className="w-56"
        align="start"
        side="right"
        sideOffset={5}
      >
        <TaskPriorityMenu
          currentPriority={(task.priority as TaskPriority) ?? null}
          isLoading={isLoading}
          onPriorityChange={handlePriorityChange}
          onMenuItemSelect={handleMenuItemSelect}
          onClose={() => onOpenChange(false)}
          translations={{
            priority: t('cmd_priority'),
            none: t('ctx_none'),
            urgent: t('preview_priority_urgent'),
            high: t('preview_priority_high'),
            medium: t('preview_priority_medium'),
            low: t('preview_priority_low'),
          }}
        />

        <TaskDueDateMenu
          endDate={task.end_date}
          isLoading={isLoading}
          onDueDateChange={handleDueDateChange}
          onCustomDateClick={() => onOpenChange(false)}
          onMenuItemSelect={handleMenuItemSelect}
          onClose={() => onOpenChange(false)}
          translations={{
            dueDate: t('cmd_due_date'),
            none: t('ctx_none'),
            today: t('cmd_today'),
            tomorrow: t('cmd_tomorrow'),
            yesterday: t('date_yesterday'),
            thisWeek: t('ctx_this_week'),
            nextWeek: t('cmd_next_week'),
            customDate: t('ctx_custom_date'),
            removeDueDate: t('ctx_remove_due_date'),
          }}
        />

        {isPersonal && (
          <TaskLabelsMenu
            taskLabels={taskLabels}
            availableLabels={availableLabels}
            isLoading={isLoading}
            onToggleLabel={handleToggleLabel}
            onCreateNewLabel={onCreateNewLabel ?? (() => {})}
            onMenuItemSelect={handleMenuItemSelect}
            translations={{
              labels: t('cmd_labels'),
              searchLabels: t('ctx_search_labels'),
              loading: t('loading'),
              noLabelsFound: t('ctx_no_labels_found'),
              noLabelsAvailable: t('ctx_no_labels_available'),
              applied: t('ctx_applied'),
              createNewLabel: t('ctx_create_new_label'),
            }}
          />
        )}

        <DropdownMenuSeparator />

        {/* Completion: move task to done list / undo */}
        {isListDone ? (
          <DropdownMenuItem
            onSelect={(e) =>
              handleMenuItemSelect(e, () => void handleUndoComplete())
            }
            disabled={isLoading}
          >
            <RotateCcw className="mr-2 h-4 w-4 text-dynamic-orange" />
            {t('undo_complete')}
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem
            onSelect={(e) =>
              handleMenuItemSelect(e, () => void handleComplete())
            }
            disabled={isLoading}
          >
            <CheckCircle2 className="mr-2 h-4 w-4 text-dynamic-green" />
            {t('completed')}
          </DropdownMenuItem>
        )}

        {/* Done with my part: hide when task is already in a done list, unless it was explicitly flagged */}
        {isListDone ? (
          isPersonallyUnassigned && (
            <DropdownMenuItem
              onSelect={(e) =>
                handleMenuItemSelect(e, () => void handleUndoDoneWithMyPart())
              }
              disabled={isLoading}
            >
              <UserCheck className="mr-2 h-4 w-4 text-dynamic-blue" />
              {t('undo_done_with_my_part')}
            </DropdownMenuItem>
          )
        ) : isPersonallyCompleted || isPersonallyUnassigned ? (
          <DropdownMenuItem
            onSelect={(e) =>
              handleMenuItemSelect(e, () => void handleUndoDoneWithMyPart())
            }
            disabled={isLoading}
          >
            <UserCheck className="mr-2 h-4 w-4 text-dynamic-blue" />
            {t('undo_done_with_my_part')}
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem
            onSelect={(e) =>
              handleMenuItemSelect(e, () => void handleDoneWithMyPart())
            }
            disabled={isLoading}
          >
            <UserMinus className="mr-2 h-4 w-4 text-dynamic-orange" />
            {t('done_with_my_part')}
          </DropdownMenuItem>
        )}

        {!isFromPersonalWorkspace && (
          <DropdownMenuItem
            onSelect={(e) =>
              handleMenuItemSelect(e, () => void handleUnassignMe())
            }
            disabled={isLoading}
            className="text-dynamic-red focus:text-dynamic-red"
          >
            <UserX className="mr-2 h-4 w-4" />
            {t('unassign_me')}
          </DropdownMenuItem>
        )}

        {boardUrl && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href={boardUrl}>
                <ExternalLink className="mr-2 h-4 w-4" />
                {t('open_in_board')}
              </Link>
            </DropdownMenuItem>
          </>
        )}

        <DropdownMenuSeparator />

        <DropdownMenuItem
          onSelect={(e) => handleMenuItemSelect(e, () => void handleDelete())}
          disabled={isLoading}
          className="text-dynamic-red focus:text-dynamic-red"
        >
          <Trash2 className="mr-2 h-4 w-4" />
          {t('delete')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
