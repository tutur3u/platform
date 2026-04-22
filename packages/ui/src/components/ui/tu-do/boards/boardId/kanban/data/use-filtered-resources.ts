'use client';

import { useMemo } from 'react';
import {
  labelNameMatchesQuery,
  memberMatchesSearchQuery,
  projectNameMatchesQuery,
} from '../../../../shared/task-resource-search-filters';

export function useFilteredResources({
  workspaceLabels,
  workspaceProjects,
  workspaceMembers,
  search,
}: {
  workspaceLabels: any[];
  workspaceProjects: any[];
  workspaceMembers: any[];
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
    return workspaceProjects.filter((project: any) =>
      projectNameMatchesQuery(project.name, search.projectQuery)
    );
  }, [workspaceProjects, search.projectQuery]);

  const filteredMembers = useMemo(() => {
    return workspaceMembers.filter((member: any) =>
      memberMatchesSearchQuery(member, search.assigneeQuery)
    );
  }, [workspaceMembers, search.assigneeQuery]);

  return { filteredLabels, filteredProjects, filteredMembers };
}
