'use client';

import { createContext, type ReactNode, useContext } from 'react';
import type { WorkspaceSelectInitialWorkspace } from './workspace-select-helpers';

const SidebarWorkspaceSelectContext = createContext<{
  initialWorkspace: WorkspaceSelectInitialWorkspace | null;
} | null>(null);

/**
 * Marks the sidebar's workspace selector section. The selector is always
 * present there (it opens the Select workspace dialog, so there is no
 * show/hide or dropdown state to manage). `initialWorkspace` is the current
 * workspace as the server already knows it, so the trigger can name it before
 * the client-side workspace list loads (including in the server render).
 */
export function WorkspaceSelectRevealProvider({
  children,
  initialWorkspace = null,
}: {
  children: ReactNode;
  initialWorkspace?: WorkspaceSelectInitialWorkspace | null;
}) {
  return (
    <SidebarWorkspaceSelectContext.Provider value={{ initialWorkspace }}>
      {children}
    </SidebarWorkspaceSelectContext.Provider>
  );
}

/**
 * True inside the sidebar's workspace selector section, where the trigger is
 * the "Switch workspace" entry point rather than a named workspace control.
 */
export function useIsSidebarWorkspaceSelect() {
  return useContext(SidebarWorkspaceSelectContext) !== null;
}

/** The server-known current workspace provided by the sidebar section. */
export function useSidebarInitialWorkspace() {
  return useContext(SidebarWorkspaceSelectContext)?.initialWorkspace ?? null;
}
