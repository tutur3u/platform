'use client';

import {
  createContext,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
  useContext,
  useEffect,
} from 'react';

const WorkspaceSelectRevealContext = createContext<boolean | null>(null);

export function WorkspaceSelectRevealProvider({
  children,
  revealed,
}: {
  children: ReactNode;
  revealed: boolean;
}) {
  return (
    <WorkspaceSelectRevealContext.Provider value={revealed}>
      {children}
    </WorkspaceSelectRevealContext.Provider>
  );
}

/**
 * True inside the sidebar's workspace selector section, where the trigger is
 * the "Switch workspace" entry point rather than a named workspace control.
 */
export function useIsSidebarWorkspaceSelect() {
  return useContext(WorkspaceSelectRevealContext) !== null;
}

export function useOpenWorkspaceSelectWhenRevealed(
  hasSelectableWorkspaces: boolean,
  setOpen: Dispatch<SetStateAction<boolean>>
) {
  const revealed = useContext(WorkspaceSelectRevealContext);

  useEffect(() => {
    if (revealed === null) return;

    if (!revealed) {
      setOpen(false);
      return;
    }

    if (revealed && hasSelectableWorkspaces) {
      setOpen(true);
    }
  }, [hasSelectableWorkspaces, revealed, setOpen]);
}
