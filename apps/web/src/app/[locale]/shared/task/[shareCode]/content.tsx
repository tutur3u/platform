'use client';

import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import {
  type SharedTaskContext,
  TaskEditDialog,
} from '@tuturuuu/ui/tu-do/shared/task-edit-dialog';
import { useRouter } from 'next/navigation';
import { useCallback, useMemo, useRef, useState } from 'react';

interface WorkspaceMember {
  id: string;
  user_id: string;
  display_name: string;
  avatar_url?: string | null;
}

interface WorkspaceLabel {
  id: string;
  name: string;
  color: string;
  created_at: string;
}

interface WorkspaceProject {
  id: string;
  name: string;
  status: string;
}

interface BoardConfig {
  id: string;
  name?: string;
  ws_id?: string;
  ticket_prefix?: string;
  estimation_type?: string;
  extended_estimation?: boolean;
  allow_zero_estimates?: boolean;
}

interface SharedTaskContentProps {
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

export default function SharedTaskContent({
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
    router.push('/');
  }, [router]);

  const handleUpdate = useCallback(() => {
    // If the dialog is closed or closing, don't refresh as we're navigating away
    if (isClosingRef.current || !isOpen) return;
    // Refresh the page data
    router.refresh();
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
