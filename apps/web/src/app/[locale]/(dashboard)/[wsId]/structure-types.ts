import type { Workspace, WorkspaceProductTier } from '@tuturuuu/types';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import type { NavLink } from '@tuturuuu/ui/custom/navigation';
import type { ReactNode } from 'react';
import type { DashboardNavigationLink } from './navigation-icon-descriptor';

export interface StructureProps {
  actions: ReactNode;
  children: ReactNode;
  defaultCollapsed: boolean;
  disableCreateNewWorkspace?: boolean;
  links: (DashboardNavigationLink | null)[];
  user: WorkspaceUser | null;
  userPopover: ReactNode;
  workspace: (Workspace & { tier?: WorkspaceProductTier | null }) | null;
  wsId: string;
}

export type NavigationState = {
  currentLinks: (NavLink | null)[];
  direction: 'forward' | 'backward';
  history: (NavLink | null)[][];
  titleHistory: string[];
};
