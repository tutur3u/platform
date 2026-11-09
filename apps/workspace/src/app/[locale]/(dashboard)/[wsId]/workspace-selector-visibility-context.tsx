'use client';

import { createContext, type ReactNode, useContext } from 'react';

const WorkspaceSelectorVisibilityContext = createContext(false);

export function WorkspaceSelectorVisibilityProvider({
  children,
  visible,
}: {
  children: ReactNode;
  visible: boolean;
}) {
  return (
    <WorkspaceSelectorVisibilityContext.Provider value={visible}>
      {children}
    </WorkspaceSelectorVisibilityContext.Provider>
  );
}

export function useWorkspaceSelectorVisibility() {
  return useContext(WorkspaceSelectorVisibilityContext);
}
