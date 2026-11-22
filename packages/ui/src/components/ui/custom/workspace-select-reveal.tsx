'use client';

import {
  createContext,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
  useContext,
  useEffect,
  useId,
  useState,
} from 'react';
import { useIsMobile } from '../../../hooks/use-mobile';

export type WorkspaceSelectOpenRequest = () => boolean;

const WorkspaceSelectRevealContext = createContext<{
  revealed: boolean;
  openRequest?: WorkspaceSelectOpenRequest;
} | null>(null);

export function useWorkspaceSelectSection(isCollapsed: boolean) {
  const isMobile = useIsMobile();
  const id = useId();
  const [section, setSection] = useState<{
    mobile: boolean;
    openRequest: WorkspaceSelectOpenRequest;
  } | null>(null);
  const current = section?.mobile === isMobile ? section : null;

  useEffect(() => {
    if (section?.mobile && !isMobile) {
      section.openRequest();
      setSection(null);
      return;
    }
    if (!isCollapsed || !current) return;
    current.openRequest();
    if (isMobile) setSection(null);
  }, [current, isCollapsed, isMobile, section]);

  return {
    id,
    visible: current !== null && (!isMobile || !isCollapsed),
    openRequest: isCollapsed ? undefined : current?.openRequest,
    toggle(openDrawer: () => void) {
      if (current) {
        current.openRequest();
        setSection(null);
        return;
      }

      let pending = true;
      setSection({
        mobile: isMobile,
        openRequest() {
          const shouldOpen = pending;
          pending = false;
          return shouldOpen;
        },
      });
      if (isMobile && isCollapsed) openDrawer();
    },
  };
}

export function WorkspaceSelectRevealProvider({
  children,
  openRequest,
  revealed,
}: {
  children: ReactNode;
  openRequest?: WorkspaceSelectOpenRequest;
  revealed: boolean;
}) {
  return (
    <WorkspaceSelectRevealContext.Provider value={{ revealed, openRequest }}>
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
  const section = useContext(WorkspaceSelectRevealContext);
  const revealed = section?.revealed;
  const openRequest = section?.openRequest;

  useEffect(() => {
    if (revealed === undefined) return;

    if (!revealed) {
      setOpen(false);
      return;
    }

    if (hasSelectableWorkspaces && openRequest?.()) {
      setOpen(true);
    }
  }, [hasSelectableWorkspaces, openRequest, revealed, setOpen]);
}
