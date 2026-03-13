'use client';

import { useQuery } from '@tanstack/react-query';
import {
  getWorkspaceTaskProject,
  getWorkspaceTaskProjectTasks,
} from '@tuturuuu/internal-api/tasks';
import type { Workspace } from '@tuturuuu/types';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import { TaskProjectDetail } from '@tuturuuu/ui/tu-do/projects/projectId/task-project-detail';
import { useTranslations } from 'next-intl';

interface Props {
  wsId: string;
  projectId: string;
  currentUserId: string;
  workspace: Workspace;
}

export default function TaskProjectDetailPageClient({
  wsId,
  projectId,
  currentUserId,
  workspace,
}: Props) {
  const t = useTranslations('task_project_detail.common');

  const { data: project, error: projectError } = useQuery({
    queryKey: ['task-project', wsId, projectId],
    queryFn: () => getWorkspaceTaskProject(wsId, projectId),
    enabled: !!wsId && !!projectId,
  });

  const { data: projectData, error: tasksError } = useQuery({
    queryKey: ['task-project-tasks', wsId, projectId],
    queryFn: () => getWorkspaceTaskProjectTasks(wsId, projectId),
    enabled: !!wsId && !!projectId,
  });

  if (projectError) {
    throw projectError;
  }

  if (tasksError) {
    throw tasksError;
  }

  if (!project || !projectData) {
    return null;
  }

  const lists: TaskList[] = (projectData.lists ?? []).map((list) => ({
    ...list,
    name: list.name ?? t('untitled_list'),
    archived: list.archived ?? false,
    created_at: list.created_at ?? new Date().toISOString(),
    creator_id: list.creator_id ?? '',
    deleted: list.deleted ?? false,
    position: list.position ?? 0,
    status: list.status ?? 'active',
    color: (list.color as TaskList['color']) ?? 'gray',
  }));

  return (
    <TaskProjectDetail
      workspace={workspace}
      project={{
        ...project,
        created_at: project.created_at ?? new Date().toISOString(),
      }}
      tasks={projectData.tasks ?? []}
      lists={lists}
      currentUserId={currentUserId}
      wsId={wsId}
    />
  );
}
