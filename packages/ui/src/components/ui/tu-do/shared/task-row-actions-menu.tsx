'use client';

import {
  Archive,
  CalendarDays,
  ExternalLink,
  MoreHorizontal,
  Pencil,
  Timer,
  Trash2,
} from '@tuturuuu/icons';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { useTaskActions } from '@tuturuuu/ui/hooks/use-task-actions';
import { isTaskBoardResolvedStatus } from '@tuturuuu/utils/task-list-status';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import {
  TaskDueDateMenu,
  TaskMoveMenu,
  TaskPriorityMenu,
  TaskSchedulingMenu,
} from '../boards/boardId/menus';
import { useTaskDialog } from '../hooks/useTaskDialog';
import type { TaskAssigneeMemberSource } from '../providers/task-dialog-provider';
import { useTasksHref } from '../tasks-route-context';

interface TaskRowActionsMenuProps {
  task: Task;
  boardId: string;
  workspaceId: string;
  lists: TaskList[];
  isPersonalWorkspace?: boolean;
  canUseBoardAssignees?: boolean;
  assigneeMemberSource?: TaskAssigneeMemberSource;
  onUpdate: () => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  trigger?: ReactNode;
  extraTopItems?: ReactNode;
  contextMenuPoint?: { x: number; y: number } | null;
  align?: 'center' | 'end' | 'start';
}

function getCompletionList(lists: TaskList[]) {
  return (
    lists.find((list) => list.status === 'done' && !list.deleted) ??
    lists.find((list) => list.status === 'closed' && !list.deleted) ??
    null
  );
}

function getClosedList(lists: TaskList[]) {
  return (
    lists.find((list) => list.status === 'closed' && !list.deleted) ?? null
  );
}

export function TaskRowActionsMenu({
  task,
  boardId,
  workspaceId,
  lists,
  isPersonalWorkspace = false,
  canUseBoardAssignees,
  assigneeMemberSource,
  onUpdate,
  open,
  onOpenChange,
  trigger,
  extraTopItems,
  contextMenuPoint,
  align = 'end',
}: TaskRowActionsMenuProps) {
  const t = useTranslations('common');
  const tTasks = useTranslations('ws-tasks');
  const taskBoardT = useTranslations();
  const tasksHref = useTasksHref();
  const { openTask } = useTaskDialog();
  const [internalOpen, setInternalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const menuOpen = open ?? internalOpen;
  const setMenuOpen = onOpenChange ?? setInternalOpen;
  const taskList = lists.find((list) => list.id === task.list_id);
  const targetCompletionList = useMemo(() => getCompletionList(lists), [lists]);
  const targetClosedList = useMemo(() => getClosedList(lists), [lists]);
  const isDocumentList = taskList?.status === 'documents';
  const sourceWorkspaceId = task.source_workspace_id ?? workspaceId;
  const sourceBoardId = task.source_board_id ?? boardId;
  const isCrossWorkspaceExternal =
    Boolean(task.source_workspace_id) &&
    task.source_workspace_id !== workspaceId;
  const canUseCurrentBoardLists = !isCrossWorkspaceExternal;
  const sourceBoardUrl =
    task.source_workspace_id && task.source_board_id
      ? `/${task.source_workspace_id}${tasksHref(`/boards/${task.source_board_id}`)}`
      : null;
  const isContextAnchored = menuOpen && Boolean(contextMenuPoint);
  const menuTrigger =
    isContextAnchored && contextMenuPoint ? (
      <button
        type="button"
        aria-hidden="true"
        tabIndex={-1}
        className="fixed z-50 h-px w-px opacity-0"
        style={{
          left: contextMenuPoint.x,
          top: contextMenuPoint.y,
        }}
      />
    ) : (
      (trigger ?? (
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 opacity-0 transition-opacity group-hover:opacity-100 data-[state=open]:opacity-100"
        >
          <MoreHorizontal className="h-3 w-3" />
          <span className="sr-only">{t('open')}</span>
        </Button>
      ))
    );

  const {
    handleMoveToCompletion,
    handleMoveToClose,
    handleDelete,
    handleMoveToList,
    handleDueDateChange,
    handlePriorityChange,
  } = useTaskActions({
    task,
    boardId,
    workspaceId: sourceWorkspaceId,
    targetCompletionList,
    targetClosedList,
    availableLists: lists,
    onUpdate,
    setIsLoading,
    setMenuOpen,
    setDeleteDialogOpen,
  });

  const handleMenuItemSelect = (event: Event, action: () => void) => {
    event.preventDefault();
    action();
  };

  const handleOpenTask = () => {
    openTask(
      task,
      sourceBoardId,
      task.source_board_id ? undefined : lists,
      false,
      {
        taskWsId: sourceWorkspaceId,
        taskWorkspacePersonal: task.source_workspace_id
          ? false
          : isPersonalWorkspace,
        canUseBoardAssignees:
          canUseBoardAssignees ??
          (task.source_workspace_id ? true : !isPersonalWorkspace),
        assigneeMemberSource: task.source_workspace_id
          ? 'board'
          : assigneeMemberSource,
      }
    );
    setMenuOpen(false);
  };

  return (
    <>
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen} modal={false}>
        <DropdownMenuTrigger asChild>{menuTrigger}</DropdownMenuTrigger>
        <DropdownMenuContent
          align={isContextAnchored ? 'start' : align}
          side={isContextAnchored ? 'right' : 'bottom'}
          sideOffset={isContextAnchored ? 2 : 4}
          className="w-58"
          onClick={(event) => event.stopPropagation()}
        >
          {extraTopItems}
          {extraTopItems && <DropdownMenuSeparator />}
          <DropdownMenuItem onClick={handleOpenTask} className="cursor-pointer">
            <Pencil className="h-4 w-4" />
            {t('edit')}
          </DropdownMenuItem>
          {!isDocumentList && (
            <DropdownMenuItem asChild>
              <Link
                href={`/${sourceWorkspaceId}/time-tracker/timer?taskSelect=${task.id}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Timer className="h-4 w-4 text-dynamic-blue" />
                {t('start_tracking_time')}
              </Link>
            </DropdownMenuItem>
          )}
          {sourceBoardUrl && (
            <DropdownMenuItem asChild>
              <Link href={sourceBoardUrl}>
                <ExternalLink className="h-4 w-4" />
                {tTasks('open_source_board')}
              </Link>
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          {!isDocumentList &&
            canUseCurrentBoardLists &&
            targetCompletionList &&
            targetCompletionList.id !== task.list_id && (
              <DropdownMenuItem
                onSelect={(event) =>
                  handleMenuItemSelect(
                    event as unknown as Event,
                    handleMoveToCompletion
                  )
                }
                className="cursor-pointer"
                disabled={isLoading}
              >
                <CalendarDays className="h-4 w-4 text-dynamic-green" />
                {targetCompletionList.status === 'done'
                  ? t('mark_as_done')
                  : t('mark_as_closed')}
              </DropdownMenuItem>
            )}
          {canUseCurrentBoardLists &&
            targetClosedList &&
            targetClosedList.id !== task.list_id &&
            (isDocumentList ||
              targetClosedList.id !== targetCompletionList?.id) && (
              <DropdownMenuItem
                onSelect={(event) =>
                  handleMenuItemSelect(
                    event as unknown as Event,
                    handleMoveToClose
                  )
                }
                className="cursor-pointer"
                disabled={isLoading}
              >
                {isDocumentList ? (
                  <Archive className="h-4 w-4 text-dynamic-purple" />
                ) : (
                  <CalendarDays className="h-4 w-4 text-dynamic-purple" />
                )}
                {isDocumentList ? t('archive') : t('mark_as_closed')}
              </DropdownMenuItem>
            )}
          <TaskPriorityMenu
            currentPriority={task.priority ?? null}
            isLoading={isLoading}
            onPriorityChange={handlePriorityChange}
            onMenuItemSelect={handleMenuItemSelect}
            onClose={() => setMenuOpen(false)}
            translations={{
              priority: t('priority'),
              none: t('none'),
              urgent: t('priority_urgent'),
              high: t('priority_high'),
              medium: t('priority_medium'),
              low: t('priority_low'),
            }}
          />
          {!isDocumentList && (
            <TaskDueDateMenu
              endDate={task.end_date}
              isLoading={isLoading}
              onDueDateChange={handleDueDateChange}
              onCustomDateClick={() => undefined}
              onMenuItemSelect={handleMenuItemSelect}
              onClose={() => setMenuOpen(false)}
              translations={{
                dueDate: t('due_date'),
                none: t('none'),
                today: t('today'),
                tomorrow: t('tomorrow'),
                yesterday: t('yesterday'),
                thisWeek: t('this_week'),
                nextWeek: t('next_week'),
                customDate: t('custom_date'),
                removeDueDate: t('remove_due_date'),
              }}
            />
          )}
          {!isDocumentList && (
            <TaskSchedulingMenu
              task={task}
              boardId={boardId}
              isLoading={isLoading}
              onUpdate={onUpdate}
              onClose={() => setMenuOpen(false)}
              translations={{
                schedule: taskBoardT('ws-task-boards.dialog.schedule'),
                estimatedDuration: taskBoardT(
                  'ws-task-boards.dialog.estimated_duration'
                ),
                h: taskBoardT('ws-task-boards.dialog.h'),
                m: taskBoardT('ws-task-boards.dialog.m'),
                splittable: taskBoardT('ws-task-boards.dialog.splittable'),
                minSplit: taskBoardT('ws-task-boards.dialog.min_split'),
                maxSplit: taskBoardT('ws-task-boards.dialog.max_split'),
                hourType: taskBoardT('ws-task-boards.dialog.hour_type'),
                workHours: taskBoardT('ws-task-boards.dialog.work_hours'),
                meetingHours: taskBoardT('ws-task-boards.dialog.meeting_hours'),
                personalHours: taskBoardT(
                  'ws-task-boards.dialog.personal_hours'
                ),
                autoSchedule: taskBoardT('ws-task-boards.dialog.auto_schedule'),
                save: t('save'),
                clear: t('clear'),
                saved: t('saved'),
                error: t('error'),
              }}
            />
          )}
          {canUseCurrentBoardLists && (
            <TaskMoveMenu
              currentListId={task.list_id}
              availableLists={lists.filter((list) => !list.deleted)}
              isLoading={isLoading}
              onMoveToList={handleMoveToList}
              onMenuItemSelect={handleMenuItemSelect}
              onRequestOpenCreateDialog={() => undefined}
              translations={{ move: t('move') }}
            />
          )}
          {!isCrossWorkspaceExternal &&
            !isTaskBoardResolvedStatus(taskList?.status) && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={(event) =>
                    handleMenuItemSelect(event as unknown as Event, () => {
                      setDeleteDialogOpen(true);
                      setMenuOpen(false);
                    })
                  }
                  className="cursor-pointer text-dynamic-red focus:text-dynamic-red"
                  disabled={isLoading}
                >
                  <Trash2 className="h-4 w-4" />
                  {t('delete_task')}
                </DropdownMenuItem>
              </>
            )}
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('delete_task')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('delete_task_confirmation', { name: task.name ?? '' })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel asChild>
              <Button variant="outline">{t('cancel')}</Button>
            </AlertDialogCancel>
            <AlertDialogAction asChild>
              <Button
                variant="destructive"
                disabled={isLoading}
                onClick={(event) => {
                  event.preventDefault();
                  void handleDelete();
                }}
              >
                {t('delete')}
              </Button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
