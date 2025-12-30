import { createClient } from '@tuturuuu/supabase/next/server';
import { getCurrentUser } from '@tuturuuu/utils/user-helper';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import WorkspaceWrapper from '@/components/workspace-wrapper';
import { TaskProjectsClient } from './task-projects-client';
import type {
  ProjectHealth,
  ProjectPriority,
  ProjectStatus,
  TaskProject,
} from './types';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('task-projects');

  return {
    title: t('page_title'),
    description: t('page_description'),
  };
}

interface Props {
  params: Promise<{
    wsId: string;
  }>;
}

export default async function TaskProjectsPage({ params }: Props) {
  const t = await getTranslations('task-projects');

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

        // Fetch task projects with all fields
        const { data: projects, error: projectsError } = await supabase
          .from('task_projects')
          .select(`
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
            )),
            task_project_tasks(
              task:tasks!inner(
                id,
                name,
                completed,
                completed_at,
                closed_at,
                deleted_at,
                priority,
                task_lists(
                  name
                )
              )
            )
          `)
          .eq('ws_id', wsId)
          .order('created_at', { ascending: false });

        if (projectsError) {
          console.error('Error fetching task projects:', projectsError);
          notFound();
        }

        const formattedProjects: TaskProject[] = (projects ?? []).map(
          (project) => {
            // Filter out soft-deleted tasks
            const activeTasks =
              project.task_project_tasks?.filter(
                (link) => link.task && link.task.deleted_at === null
              ) ?? [];

            return {
              ...project,
              // Type cast database string unions to proper TypeScript types
              status: project.status as ProjectStatus | null,
              priority: project.priority as ProjectPriority | null,
              health_status: project.health_status as ProjectHealth | null,
              created_at: project.created_at ?? new Date().toISOString(),
              tasksCount: activeTasks.length,
              completedTasksCount: activeTasks.filter(
                (link) =>
                  link.task?.completed_at !== null ||
                  link.task?.closed_at !== null
              ).length,
              linkedTasks: activeTasks.flatMap(({ task }) =>
                task
                  ? [
                      {
                        id: task.id,
                        name: task.name,
                        completed_at: task.completed_at,
                        priority: task.priority as ProjectPriority | null,
                        listName: task.task_lists?.name ?? null,
                      },
                    ]
                  : []
              ),
            };
          }
        );

        return (
          <div className="space-y-6">
            <div>
              <h1 className="font-bold text-2xl">{t('page_heading')}</h1>
              <p className="text-muted-foreground">{t('page_subheading')}</p>
            </div>

            <TaskProjectsClient
              wsId={wsId}
              initialProjects={formattedProjects}
            />
          </div>
        );
      }}
    </WorkspaceWrapper>
  );
}
