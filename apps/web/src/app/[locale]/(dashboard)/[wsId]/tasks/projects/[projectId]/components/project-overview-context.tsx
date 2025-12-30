'use client';

import type { TaskProjectWithRelations } from '@tuturuuu/types';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type { WorkspaceMember } from '@tuturuuu/ui/hooks/use-workspace-members';
import { createContext, useContext } from 'react';
import type {
  ActiveTab,
  HealthStatus,
  ProjectUpdate,
  TaskPriority,
} from '../types';

interface ProjectOverviewContextType {
  project: TaskProjectWithRelations;
  tasks: Task[];
  recentUpdates: ProjectUpdate[];
  isLoadingUpdates: boolean;
  setActiveTab: (tab: ActiveTab) => void;
  setShowLinkTaskDialog: (show: boolean) => void;
  // Description editing
  editedDescription: string;
  setEditedDescription: (value: string) => void;
  isEditingDescription: boolean;
  setIsEditingDescription: (value: boolean) => void;
  // Configuration
  showConfiguration: boolean;
  setShowConfiguration: (value: boolean) => void;
  editedStatus: string | null;
  setEditedStatus: (value: string) => void;
  editedPriority: TaskPriority | null;
  setEditedPriority: (value: TaskPriority | null) => void;
  editedHealthStatus: HealthStatus | null;
  setEditedHealthStatus: (value: HealthStatus | null) => void;
  editedLeadId: string | null;
  setEditedLeadId: (value: string | null) => void;
  editedStartDate: string;
  setEditedStartDate: (value: string) => void;
  editedEndDate: string;
  setEditedEndDate: (value: string) => void;
  editedArchived: boolean;
  setEditedArchived: (value: boolean) => void;
  // Sidebar
  showLeadSelector: boolean;
  setShowLeadSelector: (value: boolean) => void;
  showTimelineEditor: boolean;
  setShowTimelineEditor: (value: boolean) => void;
  // Members
  workspaceMembers: WorkspaceMember[];
  isLoadingMembers: boolean;
  // Animation
  fadeInViewVariant: (delay?: number) => object;
}

const ProjectOverviewContext = createContext<ProjectOverviewContextType | null>(
  null
);

export function ProjectOverviewProvider({
  children,
  value,
}: {
  children: React.ReactNode;
  value: ProjectOverviewContextType;
}) {
  return (
    <ProjectOverviewContext.Provider value={value}>
      {children}
    </ProjectOverviewContext.Provider>
  );
}

export function useProjectOverview() {
  const context = useContext(ProjectOverviewContext);
  if (!context) {
    throw new Error(
      'useProjectOverview must be used within a ProjectOverviewProvider'
    );
  }
  return context;
}
