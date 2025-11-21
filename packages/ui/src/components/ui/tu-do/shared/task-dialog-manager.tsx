'use client';

import { createClient } from '@tuturuuu/supabase/next/client';
import { useEffect, useState } from 'react';
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
  const { state, isPersonalWorkspace, triggerClose, triggerUpdate } =
    useTaskDialogContext();

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

  const handleClose = () => {
    triggerClose();
  };

  if (!state.isOpen || !state.task) {
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
