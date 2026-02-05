import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Workspace } from '@tuturuuu/types';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { supabase } from '../supabase/client';
import { STORAGE_KEYS } from '../supabase/secure-storage';

type WorkspaceState = {
  currentWorkspace: Workspace | null;
};

type WorkspaceActions = {
  // Selection
  selectWorkspace: (workspace: Workspace) => void;
  selectWorkspaceById: (wsId: string) => Promise<boolean>;

  // State management
  setCurrentWorkspace: (workspace: Workspace | null) => void;
  clearWorkspaces: () => void;
};

export type WorkspaceStore = WorkspaceState & WorkspaceActions;

/**
 * Workspace store for managing workspace selection
 *
 * Persists the current workspace selection to AsyncStorage so users
 * don't need to re-select their workspace on app restart.
 */
export const useWorkspaceStore = create<WorkspaceStore>()(
  persist(
    (set, get) => ({
      // Initial state
      currentWorkspace: null,

      // Select a workspace
      selectWorkspace: (workspace) => {
        set({ currentWorkspace: workspace });
      },

      // Select by ID (useful for deep linking)
      selectWorkspaceById: async (wsId) => {
        const { currentWorkspace } = get();

        // Already selected
        if (currentWorkspace?.id === wsId) {
          return true;
        }

        // Fetch workspace details if not already selected
        const { data: workspace, error } = await supabase
          .from('workspaces')
          .select('*')
          .eq('id', wsId)
          .single();

        if (error || !workspace) {
          return false;
        }

        set({ currentWorkspace: workspace });
        return true;
      },

      // Direct state setters
      setCurrentWorkspace: (workspace) => set({ currentWorkspace: workspace }),

      // Clear on logout
      clearWorkspaces: () =>
        set({
          currentWorkspace: null,
        }),
    }),
    {
      name: STORAGE_KEYS.SELECTED_WORKSPACE,
      storage: createJSONStorage(() => AsyncStorage),
      // Persist the full current workspace object
      partialize: (state) => ({
        currentWorkspace: state.currentWorkspace,
      }),
    }
  )
);

/**
 * Selector hooks for common workspace state
 */
export const useCurrentWorkspace = () =>
  useWorkspaceStore((state) => state.currentWorkspace);
export const useWorkspaceId = () =>
  useWorkspaceStore((state) => state.currentWorkspace?.id);
