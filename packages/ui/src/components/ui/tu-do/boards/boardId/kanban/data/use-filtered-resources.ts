'use client';

import type { WorkspaceMember } from '@tuturuuu/ui/hooks/use-workspace-members';
import { useMemo } from 'react';
import {
  labelNameMatchesQuery,
  memberMatchesSearchQuery,
  projectNameMatchesQuery,
} from '../../../../shared/task-resource-search-filters';

/** Minimal shape for bulk label lists (matches useBulkResources labels). */
export type KanbanFilteredLabel = { id: string; name: string; color: string };

/** Minimal shape for bulk project lists (matches useBulkResources projects). */
export type KanbanFilteredProject = {
  id: string;
  name: string | null | undefined;
};

export function useFilteredResources({
  workspaceLabels,
  workspaceProjects,
  workspaceMembers,
  search,
}: {
  workspaceLabels: KanbanFilteredLabel[];
  workspaceProjects: KanbanFilteredProject[];
  workspaceMembers: WorkspaceMember[];
  search: {
    labelQuery: string;
    projectQuery: string;
    assigneeQuery: string;
  };
}) {
  const filteredLabels = useMemo(() => {
    return workspaceLabels.filter((label) =>
      labelNameMatchesQuery(label.name, search.labelQuery)
    );
  }, [workspaceLabels, search.labelQuery]);

  const filteredProjects = useMemo(() => {
    return workspaceProjects.filter((project) =>
      projectNameMatchesQuery(project.name, search.projectQuery)
    );
  }, [workspaceProjects, search.projectQuery]);

  const filteredMembers = useMemo(() => {
    return workspaceMembers.filter((member) =>
      memberMatchesSearchQuery(member, search.assigneeQuery)
    );
  }, [workspaceMembers, search.assigneeQuery]);

  return { filteredLabels, filteredProjects, filteredMembers };
}
