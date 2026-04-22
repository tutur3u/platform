'use client';

import { Loader2 } from '@tuturuuu/icons';
import type { Task } from '@tuturuuu/types/primitives/Task';
import { useOptionalWorkspacePresenceContext } from '@tuturuuu/ui/tu-do/providers/workspace-presence-provider';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { dispatchRecentSidebarVisit } from './recent-sidebar-events';
import { TaskEditDialog } from './task-edit-dialog';
import { buildWorkspaceTaskUrl } from './task-url';

type TaskWithLocation = Task & {
  list?: {
    board?: {
      name?: string | null;
    } | null;
    name?: string | null;
  } | null;
};

interface TaskDetailPageProps {
  task: TaskWithLocation;
  boardId: string;
  wsId: string;
  isPersonalWorkspace: boolean;
  currentUser?: {
    id: string;
    display_name?: string;
    email?: string;
    avatar_url?: string;
  };
}

export default function TaskDetailPage({
  task,
  boardId,
  wsId,
  isPersonalWorkspace,
  currentUser,
}: TaskDetailPageProps) {
  const wsPresence = useOptionalWorkspacePresenceContext();
  const router = useRouter();
  const hasRedirectedRef = useRef(false);
  const [isNavigating, setIsNavigating] = useState(false);

  // Handle navigation back to board view
  const navigateToBoard = useCallback(() => {
    if (hasRedirectedRef.current) {
      return;
    }

    hasRedirectedRef.current = true;
    setIsNavigating(true);
    const boardUrl = buildWorkspaceTaskUrl({
      boardId,
      currentPathname: window.location.pathname,
      taskId: task.id,
      workspaceId: wsId,
      isPersonalWorkspace,
    }).replace(/\?task=.*$/u, '');

    if (window.history.length > 1) {
      router.back();
    } else {
      router.push(boardUrl);
    }
  }, [boardId, isPersonalWorkspace, router, task.id, wsId]);

  const handleUpdate = useCallback(() => {
    router.refresh();
  }, [router]);

  const handleClose = useCallback(() => {
    navigateToBoard();
  }, [navigateToBoard]);

  const handleNavigateToTask = useCallback(
    async (nextTaskId: string) => {
      if (nextTaskId === task.id) return;
      router.push(
        buildWorkspaceTaskUrl({
          boardId,
          currentPathname: window.location.pathname,
          taskId: nextTaskId,
          workspaceId: wsId,
          isPersonalWorkspace,
        })
      );
    },
    [boardId, isPersonalWorkspace, router, task.id, wsId]
  );

  // Track presence for avatar display — on the kanban board page,
  // BoardUserPresenceAvatarsComponent handles this, but on the dedicated
  // task detail page we need to call updateLocation ourselves so the
  // lazy presence channel is initialized and other users can see us.
  const wsUpdateLocation = wsPresence?.updateLocation;
  useEffect(() => {
    if (!wsUpdateLocation || !task.id || !boardId) return;
    wsUpdateLocation({ type: 'board', boardId, taskId: task.id });

    return () => {
      // Clear task-level presence when leaving the page
      wsUpdateLocation({ type: 'other' });
    };
  }, [wsUpdateLocation, boardId, task.id]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const boardName = task.list?.board?.name || '';
    const listName = task.list?.name || '';
    const badges = [];

    if (boardName) {
      badges.push({ kind: 'board' as const, value: boardName });
    }
    if (listName) {
      badges.push({ kind: 'list' as const, value: listName });
    }

    dispatchRecentSidebarVisit({
      href: buildWorkspaceTaskUrl({
        boardId,
        currentPathname: window.location.pathname,
        taskId: task.id,
        workspaceId: wsId,
        isPersonalWorkspace,
      }),
      scopeWsId: wsId,
      snapshot: {
        badges,
        iconKey: 'task',
        title: task.name || '',
      },
    });
  }, [
    boardId,
    isPersonalWorkspace,
    task.id,
    task.list?.board?.name,
    task.list?.name,
    task.name,
    wsId,
  ]);

  // Show loading state during navigation to prevent blank screen
  if (isNavigating) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <p className="text-muted-foreground text-sm">Redirecting...</p>
        </div>
      </div>
    );
  }

  return (
    <TaskEditDialog
      wsId={wsId}
      task={task}
      boardId={boardId}
      isOpen={true}
      collaborationMode={!isPersonalWorkspace && !!wsPresence?.cursorsEnabled}
      isPersonalWorkspace={isPersonalWorkspace}
      mode="edit"
      currentUser={currentUser}
      onClose={handleClose}
      onUpdate={handleUpdate}
      onNavigateToTask={handleNavigateToTask}
      realtimeEnabled={true}
    />
  );
}
