import { createClient } from '@tuturuuu/supabase/next/server';
import type { Task } from '@tuturuuu/types/primitives/Task';
import { getCurrentSupabaseUser } from '@tuturuuu/utils/user-helper';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import WorkspaceWrapper from '@/components/workspace-wrapper';
import { TaskProjectDetail } from './task-project-detail';

export const metadata: Metadata = {
  title: 'Task Project',
  description: 'View and manage task project details.',
};

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

export default async function TaskProjectPage({ params }: Props) {
  return (
    <WorkspaceWrapper params={params}>
      {async ({ wsId, workspace }) => {
        const { projectId } = await params;
        const supabase = await createClient();

        const user = await getCurrentSupabaseUser();

        // Check workspace permissions
        const { withoutPermission } = await getPermissions({ wsId });
        if (withoutPermission('manage_projects')) {
          notFound();
        }

        // Fetch task project details with extended metadata
        const { data: project, error: projectError } = await supabase
          .from('task_projects')
          .select(
            `
            *,
            creator:users!task_projects_creator_id_fkey(
              id,
              display_name,
              avatar_url
            ),
            lead:workspace_members(...users(
              id,
              display_name,
              avatar_url
            ))
          `
          )
          .eq('id', projectId)
          .eq('ws_id', wsId)
          .single();

        if (projectError || !project) {
          console.error('Error fetching project:', projectError);
          notFound();
        }

        // Fetch all tasks linked to this project with full details
        const { data: projectTasks, error: tasksError } = await supabase
          .from('task_project_tasks')
          .select(
            `
            task:tasks!inner(
              *,
              assignees:task_assignees(
                user:users(
                  id,
                  display_name,
                  avatar_url
                )
              ),
              labels:task_labels(
                label:workspace_task_labels(
                  id,
                  name,
                  color,
                  created_at
                )
              ),
              projects:task_project_tasks(
                project:task_projects(
                  id,
                  name,
                  status
                )
              )
            )
          `
          )
          .eq('project_id', projectId)
          .is('task.deleted_at', null);

        if (tasksError) {
          console.error('Error fetching project tasks:', tasksError);
          notFound();
        }

        // Extract and transform tasks (filter out any null tasks and deleted ones)
        const rawTasks = (projectTasks ?? [])
          .map((pt) => pt.task)
          .filter(
            (task): task is NonNullable<typeof task> =>
              task !== null && !task.deleted_at
          );

        // Get unique board IDs and list IDs
        const listIds = [
          ...new Set(
            rawTasks
              .map((t) => t.list_id)
              .filter((id): id is string => id !== null)
          ),
        ];

        // Fetch all lists for these tasks
        const { data: lists } = await supabase
          .from('task_lists')
          .select('*')
          .in('id', listIds.length > 0 ? listIds : [''])
          .eq('deleted', false);

        // Transform tasks to match Task type
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
              name: list.name ?? 'Untitled List',
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
      }}
    </WorkspaceWrapper>
  );
}
