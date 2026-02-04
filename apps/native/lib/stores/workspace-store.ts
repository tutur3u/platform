import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Workspace } from '@tuturuuu/types';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { supabase } from '../supabase/client';
import { STORAGE_KEYS } from '../supabase/secure-storage';

type WorkspaceState = {
  workspaces: Workspace[];
  currentWorkspace: Workspace | null;
  isLoading: boolean;
  error: string | null;
};

type WorkspaceActions = {
  // Data fetching
  fetchWorkspaces: () => Promise<void>;

  // Selection
  selectWorkspace: (workspace: Workspace) => void;
  selectWorkspaceById: (wsId: string) => Promise<boolean>;

  // State management
  setWorkspaces: (workspaces: Workspace[]) => void;
  setCurrentWorkspace: (workspace: Workspace | null) => void;
  setError: (error: string | null) => void;
  clearWorkspaces: () => void;
};

export type WorkspaceStore = WorkspaceState & WorkspaceActions;

/**
 * Workspace store for managing workspace selection
 *
 * Persists the current workspace selection to AsyncStorage so users
 * don't need to re-select their workspace on app restart.
 *
 * @example
 * ```typescript
 * import { useWorkspaceStore } from '@/lib/stores/workspace-store';
 *
 * function WorkspaceSelector() {
 *   const { workspaces, currentWorkspace, selectWorkspace, fetchWorkspaces } = useWorkspaceStore();
 *
 *   useEffect(() => {
 *     fetchWorkspaces();
 *   }, []);
 *
 *   return (
 *     <FlatList
 *       data={workspaces}
 *       renderItem={({ item }) => (
 *         <Pressable onPress={() => selectWorkspace(item)}>
 *           <Text>{item.name}</Text>
 *         </Pressable>
 *       )}
 *     />
 *   );
 * }
 * ```
 */
export const useWorkspaceStore = create<WorkspaceStore>()(
  persist(
    (set, get) => ({
      // Initial state
      workspaces: [],
      currentWorkspace: null,
      isLoading: false,
      error: null,

      // Fetch all workspaces the user has access to
      fetchWorkspaces: async () => {
        set({ isLoading: true, error: null });

        try {
          // Get workspaces through workspace_users join
          const { data, error } = await supabase
            .from('workspace_users')
            .select(
              `
              workspace:workspaces (
                id,
                name,
                avatar_url,
                handle,
                created_at,
                personal
              )
            `
            )
            .order('created_at', { ascending: false });

          if (error) {
            set({ error: error.message, isLoading: false });
            return;
          }

          // Extract workspaces from the nested structure
          const workspaces = (data ?? [])
            .map((item) => item.workspace)
            .filter((ws): ws is Workspace => ws !== null);

          set({ workspaces, isLoading: false });

          // Auto-select if only one workspace
          const { currentWorkspace } = get();
          if (!currentWorkspace && workspaces.length === 1) {
            set({ currentWorkspace: workspaces[0] });
          }
          // Validate current selection still exists
          else if (currentWorkspace) {
            const stillExists = workspaces.some(
              (ws) => ws.id === currentWorkspace.id
            );
            if (!stillExists) {
              set({
                currentWorkspace: workspaces.length > 0 ? workspaces[0] : null,
              });
            }
          }
        } catch (error) {
          set({
            error:
              error instanceof Error
                ? error.message
                : 'Failed to fetch workspaces',
            isLoading: false,
          });
        }
      },

      // Select a workspace
      selectWorkspace: (workspace) => {
        set({ currentWorkspace: workspace, error: null });
      },

      // Select by ID (useful for deep linking)
      selectWorkspaceById: async (wsId) => {
        const { workspaces, fetchWorkspaces } = get();

        // If workspaces not loaded, fetch first
        if (workspaces.length === 0) {
          await fetchWorkspaces();
        }

        const workspace = get().workspaces.find((ws) => ws.id === wsId);
        if (workspace) {
          set({ currentWorkspace: workspace });
          return true;
        }

        return false;
      },

      // Direct state setters
      setWorkspaces: (workspaces) => set({ workspaces }),
      setCurrentWorkspace: (workspace) => set({ currentWorkspace: workspace }),
      setError: (error) => set({ error }),

      // Clear on logout
      clearWorkspaces: () =>
        set({
          workspaces: [],
          currentWorkspace: null,
          error: null,
        }),
    }),
    {
      name: STORAGE_KEYS.SELECTED_WORKSPACE,
      storage: createJSONStorage(() => AsyncStorage),
      // Only persist the current workspace ID, not the full list
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
export const useWorkspaces = () =>
  useWorkspaceStore((state) => state.workspaces);
export const useWorkspaceId = () =>
  useWorkspaceStore((state) => state.currentWorkspace?.id);
