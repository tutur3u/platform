'use client';

import { useMemo } from 'react';
import { normalizeBoardText } from '../../board-text-utils';

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
    return workspaceLabels.filter(
      (label) =>
        !search.labelQuery ||
        normalizeBoardText(label.name).includes(
          normalizeBoardText(search.labelQuery)
        )
    );
  }, [workspaceLabels, search.labelQuery]);

  const filteredProjects = useMemo(() => {
    return workspaceProjects.filter(
      (project: any) =>
        !search.projectQuery ||
        normalizeBoardText(project.name).includes(
          normalizeBoardText(search.projectQuery)
        )
    );
  }, [workspaceProjects, search.projectQuery]);

  const filteredMembers = useMemo(() => {
    return workspaceMembers.filter(
      (member: any) =>
        !search.assigneeQuery ||
        member.display_name
          ?.toLowerCase()
          .includes(search.assigneeQuery.toLowerCase()) ||
        member.email?.toLowerCase().includes(search.assigneeQuery.toLowerCase())
    );
  }, [workspaceMembers, search.assigneeQuery]);

  return { filteredLabels, filteredProjects, filteredMembers };
}
