'use client';

import { createClient } from '@tuturuuu/supabase/next/client';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useTaskDialogContext } from '../providers/task-dialog-provider';
import { TaskEditDialog } from './task-edit-dialog';

/**
 * Manager component that renders the centralized task dialog
 * This component should be placed once at the workspace layout level
 *
 * NOTE: TaskEditDialog is directly imported (not lazy-loaded) to ensure
 * instant dialog opening when clicking tasks. This is a core interaction
 * that benefits from immediate availability over bundle size optimization.
 */
export function TaskDialogManager({ wsId }: { wsId: string }) {
  const {
    state,
    isPersonalWorkspace,
    triggerClose,
    triggerUpdate,
    closeDialog,
  } = useTaskDialogContext();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const previousUrlRef = useRef<string | null>(null);

  // Fetch current user immediately on mount (persists across dialog open/close)
  const [currentUser, setCurrentUser] = useState<{
    id: string;
    display_name?: string;
    email?: string;
    avatar_url?: string;
  } | null>(null);

  useEffect(() => {
    const supabase = createClient();

    const fetchUser = async () => {
      // Get session immediately (cached in localStorage)
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (session?.user) {
        // Set basic user info immediately
        setCurrentUser({
          id: session.user.id,
          email: session.user.email,
        });

        // Fetch full user details in background
        const { data: userData } = await supabase
          .from('users')
          .select('id, display_name, avatar_url')
          .eq('id', session.user.id)
          .single();

        if (userData) {
          setCurrentUser({
            id: userData.id,
            display_name: userData.display_name || undefined,
            email: session.user.email,
            avatar_url: userData.avatar_url || undefined,
          });
        }
      }
    };

    fetchUser();
  }, []);

  useEffect(() => {
    if (state.isOpen && state.mode === 'edit' && state.task?.id) {
      const taskUrl = `/${wsId}/tasks/${state.task.id}`;
      const isBoardDetailsView = pathname.includes('/tasks/boards/');

      if (previousUrlRef.current === null && pathname !== taskUrl) {
        // First time opening from a different page
        previousUrlRef.current =
          pathname +
          (searchParams.toString() ? `?${searchParams.toString()}` : '');

        // Only navigate to task URL if NOT coming from board details view
        // This preserves scroll state and avoids unnecessary navigation
        if (!isBoardDetailsView) {
          router.push(taskUrl);
        }
      } else if (previousUrlRef.current !== null && pathname !== taskUrl) {
        // Dialog is open and user navigated away (e.g. browser back)
        closeDialog();
      }
    }
  }, [
    state.isOpen,
    state.mode,
    state.task?.id,
    pathname,
    router,
    wsId,
    closeDialog,
    searchParams,
  ]);

  const handleClose = () => {
    if (previousUrlRef.current) {
      // Check if we're returning to a board details view
      const isBoardDetailsView =
        previousUrlRef.current.includes('/tasks/boards/');

      // For board details view, just close without navigation
      // This preserves scroll state and avoids full page reload
      if (isBoardDetailsView) {
        closeDialog();
      } else {
        // For other views, navigate back to restore URL
        router.push(previousUrlRef.current);
        closeDialog();
      }
    } else {
      triggerClose();
    }
  };

  if (!state.isOpen || !state.task) {
    if (previousUrlRef.current) {
      previousUrlRef.current = null;
    }
    return null;
  }

  return (
    <TaskEditDialog
      wsId={wsId}
      task={state.task}
      boardId={state.boardId || ''}
      isOpen={state.isOpen}
      availableLists={state.availableLists}
      filters={state.filters}
      mode={state.mode}
      collaborationMode={state.collaborationMode}
      isPersonalWorkspace={isPersonalWorkspace}
      currentUser={currentUser || undefined}
      onClose={handleClose}
      onUpdate={triggerUpdate}
    />
  );
}
