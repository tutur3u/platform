'use client';

import { createContext, type ReactNode, useContext } from 'react';

const SidebarWorkspaceSelectContext = createContext(false);

/**
 * Marks the sidebar's workspace selector section. The selector is always
 * present there (it opens the Select workspace dialog, so there is no
 * show/hide or dropdown state to manage).
 */
export function WorkspaceSelectRevealProvider({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <SidebarWorkspaceSelectContext.Provider value>
      {children}
    </SidebarWorkspaceSelectContext.Provider>
  );
}

/**
 * True inside the sidebar's workspace selector section, where the trigger is
 * the "Switch workspace" entry point rather than a named workspace control.
 */
export function useIsSidebarWorkspaceSelect() {
  return useContext(SidebarWorkspaceSelectContext);
}
