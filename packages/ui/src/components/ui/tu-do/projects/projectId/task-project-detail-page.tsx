import { createClient } from '@tuturuuu/supabase/next/server';
import type { Task } from '@tuturuuu/types/primitives/Task';
import { TaskProjectDetail } from '@tuturuuu/ui/tu-do/projects/projectId/task-project-detail';
import {
  getCurrentSupabaseUser,
  getCurrentUser,
} from '@tuturuuu/utils/user-helper';
import { getPermissions, getWorkspace } from '@tuturuuu/utils/workspace-helper';
import { notFound, redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

interface Props {
  params: Promise<{
    wsId: string;
    projectId: string;
  }>;
}

interface TaskLabelEntry {
  label: {
    id: string;
    name: string;
    color: string | null;
    created_at: string | null;
  } | null;
}

interface TaskProjectEntry {
  project: {
    id: string;
    name: string;
    status: string | null;
  } | null;
}

interface TaskAssigneeEntry {
  user: {
    id: string;
    display_name: string | null;
    avatar_url: string | null;
  };
}

/**
 * Shared Task Project Detail Page component.
 * Handles workspace resolution, permissions, and data fetching.
 * Used by both apps/web and apps/tasks.
 */
export default async function TaskProjectDetailPage({ params }: Props) {
  const { wsId: id, projectId } = await params;

  const currentUser = await getCurrentUser();
  if (!currentUser) redirect('/login');

  const workspace = await getWorkspace(id);
  if (!workspace) redirect('/');

  const wsId = workspace.id;

  const { withoutPermission } = await getPermissions({ wsId });
  if (withoutPermission('manage_projects')) notFound();

  const supabase = await createClient();
  const user = await getCurrentSupabaseUser();
  const t = await getTranslations('task_project_detail.common');

  const { data: project, error: projectError } = await supabase
    .from('task_projects')
    .select(
      `
      *,
      creator:users!task_projects_creator_id_fkey(id, display_name, avatar_url),
      lead:users!task_projects_lead_id_fkey(id, display_name, avatar_url)
    `
    )
    .eq('id', projectId)
    .eq('ws_id', wsId)
    .single();

  if (projectError || !project) {
    console.error('Error fetching project:', projectError);
    notFound();
  }

  const { data: projectTasks, error: tasksError } = await supabase
    .from('task_project_tasks')
    .select(
      `
      task:tasks!inner(
        *,
        assignees:task_assignees(user:users(id, display_name, avatar_url)),
        labels:task_labels(label:workspace_task_labels(id, name, color, created_at)),
        projects:task_project_tasks(project:task_projects(id, name, status))
      )
    `
    )
    .eq('project_id', projectId)
    .is('task.deleted_at', null);

  if (tasksError) {
    console.error('Error fetching project tasks:', tasksError);
    notFound();
  }

  const rawTasks = (projectTasks ?? [])
    .map((pt) => pt.task)
    .filter(
      (task): task is NonNullable<typeof task> =>
        task !== null && !task.deleted_at
    );

  const listIds = [
    ...new Set(
      rawTasks
        .map((t) => t.list_id)
        .filter((lid): lid is string => lid !== null)
    ),
  ];

  const { data: lists } = await supabase
    .from('task_lists')
    .select('*')
    .in('id', listIds.length > 0 ? listIds : [''])
    .eq('deleted', false);

  const formattedTasks: Task[] = rawTasks.map((task) => {
    const normalizedLabels =
      (task.labels as TaskLabelEntry[] | null | undefined)
        ?.map((entry) => entry.label)
        .filter((label): label is NonNullable<Task['labels']>[number] =>
          Boolean(label)
        ) ?? [];

    const normalizedProjects =
      (task.projects as TaskProjectEntry[] | null | undefined)
        ?.map((entry) => entry.project)
        .filter((proj): proj is NonNullable<Task['projects']>[number] =>
          Boolean(proj)
        ) ?? [];

    const normalizedAssignees =
      (task.assignees as TaskAssigneeEntry[] | null | undefined)?.map(
        (entry) => ({
          id: entry.user.id,
          display_name: entry.user.display_name ?? null,
          avatar_url: entry.user.avatar_url ?? null,
        })
      ) ?? [];

    return {
      ...task,
      assignees: normalizedAssignees,
      labels: normalizedLabels,
      projects: normalizedProjects,
    } as Task;
  });

  return (
    <TaskProjectDetail
      workspace={workspace}
      project={{
        ...project,
        created_at: project.created_at ?? new Date().toISOString(),
      }}
      tasks={formattedTasks}
      lists={(lists ?? []).map((list) => ({
        ...list,
        name: list.name ?? t('untitled_list'),
        archived: list.archived ?? false,
        created_at: list.created_at ?? new Date().toISOString(),
        creator_id: list.creator_id ?? '',
        deleted: list.deleted ?? false,
        position: list.position ?? 0,
        status: list.status ?? 'active',
        color: (list.color as any) ?? 'gray',
      }))}
      currentUserId={user!.id}
      wsId={wsId}
    />
  );
}
