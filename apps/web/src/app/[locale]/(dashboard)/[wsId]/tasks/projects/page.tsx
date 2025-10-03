import { createClient } from '@tuturuuu/supabase/next/server';
import { getCurrentUser } from '@tuturuuu/utils/user-helper';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import WorkspaceWrapper from '@/components/workspace-wrapper';
import { TaskProjectsClient } from './task-projects-client';

export const metadata: Metadata = {
  title: 'Task Projects',
  description: 'Manage and track task projects across your workspace.',
};

interface Props {
  params: Promise<{
    wsId: string;
  }>;
}

export default async function TaskProjectsPage({ params }: Props) {
  return (
    <WorkspaceWrapper params={params}>
      {async ({ wsId }) => {
        const supabase = await createClient();

        // Get current user
        const currentUser = await getCurrentUser();
        if (!currentUser) {
          notFound();
        }

        // Check workspace permissions
        const { withoutPermission } = await getPermissions({ wsId });
        if (withoutPermission('manage_projects')) {
          notFound();
        }

        // Fetch task projects
        const { data: projects, error: projectsError } = await supabase
          .from('task_projects')
          .select(`
            *,
            creator:users!task_projects_creator_id_fkey(
              id,
              display_name,
              avatar_url
            ),
            task_project_tasks(
              task:tasks!inner(
                id,
                name,
                completed,
                deleted,
                task_lists(
                  name
                )
              )
            )
          `)
          .eq('ws_id', wsId)
          .eq('task_project_tasks.task.deleted', false)
          .order('created_at', { ascending: false });

        if (projectsError) {
          console.error('Error fetching task projects:', projectsError);
          notFound();
        }

        const formattedProjects = (projects ?? []).map((project) => {
          // Filter out soft-deleted tasks
          const activeTasks =
            project.task_project_tasks?.filter(
              (link) => link.task && link.task.deleted === false
            ) ?? [];

          return {
            id: project.id,
            name: project.name,
            description: project.description,
            created_at: project.created_at ?? new Date().toISOString(),
            creator_id: project.creator_id,
            creator: project.creator,
            tasksCount: activeTasks.length,
            linkedTasks: activeTasks.flatMap((link) =>
              link.task
                ? [
                    {
                      id: link.task.id,
                      name: link.task.name,
                      completed: link.task.completed,
                      listName: link.task.task_lists?.name ?? null,
                    },
                  ]
                : []
            ),
          };
        });

        return (
          <div className="space-y-6">
            <div>
              <h1 className="font-bold text-2xl">Task Projects</h1>
              <p className="text-muted-foreground">
                Manage and track cross-functional task projects across your
                workspace.
              </p>
            </div>

            <TaskProjectsClient
              wsId={wsId}
              initialProjects={formattedProjects}
              currentUserId={currentUser.id}
            />
          </div>
        );
      }}
    </WorkspaceWrapper>
  );
}
