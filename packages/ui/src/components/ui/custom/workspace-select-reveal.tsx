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
