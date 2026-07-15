import { useRouter } from '@tanstack/react-router';
import {
  type SharedTaskContext,
  TaskEditDialog,
} from '@tuturuuu/tasks-ui/tu-do/shared/task-edit-dialog';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import { useCallback, useMemo, useRef, useState } from 'react';

type BoardConfig = NonNullable<SharedTaskContext['boardConfig']>;
type WorkspaceLabel = NonNullable<SharedTaskContext['workspaceLabels']>[number];
type WorkspaceProject = NonNullable<
  SharedTaskContext['workspaceProjects']
>[number];
type WorkspaceMember = NonNullable<
  SharedTaskContext['workspaceMembers']
>[number];

export interface SharedTaskContentProps {
  task: Task;
  permission: 'view' | 'edit';
  workspace: {
    id: string;
    name: string;
  };
  board: {
    id: string;
    name: string;
  };
  list: {
    id: string;
    name: string;
  };
  shareCode: string;
  currentUser?: {
    id: string;
    display_name?: string;
    email?: string;
    avatar_url?: string;
  };
  boardConfig: BoardConfig;
  availableLists: TaskList[];
  workspaceLabels: WorkspaceLabel[];
  workspaceProjects: WorkspaceProject[];
  workspaceMembers: WorkspaceMember[];
}

/**
 * Client component for the shared-task viewer/editor. Ported faithfully from
 * the legacy apps/web `content.tsx`. The only platform swap is navigation:
 * Next.js `useRouter().push('/')` / `.refresh()` become TanStack Router's
 * `router.navigate({ to: '/' })` / `router.invalidate()`.
 */
export function SharedTaskContent({
  task,
  permission,
  workspace,
  board,
  list,
  currentUser,
  boardConfig,
  availableLists,
  workspaceLabels,
  workspaceProjects,
  workspaceMembers,
  shareCode,
}: SharedTaskContentProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(true);
  const isClosingRef = useRef(false);

  const handleClose = useCallback(() => {
    if (isClosingRef.current) return;
    isClosingRef.current = true;
    setIsOpen(false);
    // Navigate to home since shared users don't have workspace access
    router.navigate({ to: '/' });
  }, [router]);

  const handleUpdate = useCallback(() => {
    // If the dialog is closed or closing, don't refresh as we're navigating away
    if (isClosingRef.current || !isOpen) return;
    // Refresh the loader data
    router.invalidate();
  }, [router, isOpen]);

  // Ensure the task has the list_id set
  const taskWithList = useMemo(
    () => ({
      ...task,
      list_id: task.list_id || list.id,
    }),
    [task, list.id]
  );

  // Build shared context to bypass internal workspace fetches
  // Use availableLists from API if available, otherwise create minimal list entry
  const listsForContext = useMemo(
    () =>
      availableLists.length > 0
        ? availableLists
        : [{ id: list.id, name: list.name } as TaskList],
    [availableLists, list.id, list.name]
  );

  const sharedContext: SharedTaskContext = useMemo(
    () => ({
      boardConfig,
      availableLists: listsForContext,
      workspaceLabels,
      workspaceMembers,
      workspaceProjects,
    }),
    [
      boardConfig,
      listsForContext,
      workspaceLabels,
      workspaceMembers,
      workspaceProjects,
    ]
  );

  const memoizedCurrentUser = useMemo(
    () =>
      currentUser
        ? {
            id: currentUser.id,
            display_name: currentUser.display_name,
            avatar_url: currentUser.avatar_url,
            email: currentUser.email,
          }
        : undefined,
    [currentUser]
  );

  return (
    <TaskEditDialog
      wsId={workspace.id}
      task={taskWithList}
      boardId={board.id}
      isOpen={isOpen}
      mode="edit"
      collaborationMode={false}
      isPersonalWorkspace={false}
      shareCode={shareCode}
      sharedPermission={permission}
      currentUser={memoizedCurrentUser}
      sharedContext={sharedContext}
      onClose={handleClose}
      onUpdate={handleUpdate}
      availableLists={listsForContext}
    />
  );
}
