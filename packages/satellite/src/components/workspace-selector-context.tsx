'use client';

import type { LaunchableWorkspace } from '@tuturuuu/utils/launchable-apps';
import { createContext, type ReactNode, useContext, useMemo } from 'react';
import type { WorkspaceSelectRenderer } from './sidebar-structure-utils';

type WorkspaceSelectorContextValue = {
  renderWorkspaceSelect?: WorkspaceSelectRenderer;
  visible: boolean;
  workspace: LaunchableWorkspace;
};

const WorkspaceSelectorContext =
  createContext<WorkspaceSelectorContextValue | null>(null);

export function WorkspaceSelectorProvider({
  children,
  renderWorkspaceSelect,
  visible,
  workspace,
}: WorkspaceSelectorContextValue & { children: ReactNode }) {
  const value = useMemo(
    () => ({ renderWorkspaceSelect, visible, workspace }),
    [renderWorkspaceSelect, visible, workspace]
  );

  return (
    <WorkspaceSelectorContext.Provider value={value}>
      {children}
    </WorkspaceSelectorContext.Provider>
  );
}

export function useWorkspaceSelector() {
  return useContext(WorkspaceSelectorContext);
}
