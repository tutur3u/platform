import { partitionTaskProjectLinks } from '@tuturuuu/internal-api/tasks';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { TaskProjectsClient } from '@tuturuuu/tasks-ui/tu-do/projects/task-projects-client';
import type {
  ProjectHealth,
  ProjectPriority,
  ProjectStatus,
  TaskProject,
} from '@tuturuuu/tasks-ui/tu-do/projects/types';
import { getCurrentUser } from '@tuturuuu/utils/user-helper';
import { getPermissions, getWorkspace } from '@tuturuuu/utils/workspace-helper';
import { notFound, redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

interface Props {
  params: Promise<{
    wsId: string;
  }>;
}

/**
 * Shared Task Projects Page component.
 * Handles workspace resolution, permissions, and data fetching.
 * Used by both apps/web and apps/tasks.
 */
export default async function TaskProjectsPage({ params }: Props) {
  const { wsId: id } = await params;

  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const workspace = await getWorkspace(id);
  if (!workspace) notFound();

  const wsId = workspace.id;

  const permissions = await getPermissions({ wsId });
  if (!permissions) notFound();
  const { withoutPermission } = permissions;
  if (withoutPermission('manage_projects')) redirect(`/${wsId}`);

  const supabase = await createAdminClient();
  const t = await getTranslations('task-projects');

  const { data: projects, error: projectsError } = await supabase
    .from('task_projects')
    .select(`
      *,
      creator:users!task_projects_creator_id_fkey(
        id, display_name, avatar_url
      ),
      lead:users!task_projects_lead_id_fkey(
        id, display_name, avatar_url
      ),
      task_project_tasks(
        task:tasks!inner(
          id, name, completed, completed_at, closed_at, deleted_at, priority,
          task_lists(name, status)
        )
      )
    `)
    .eq('ws_id', wsId)
    .order('created_at', { ascending: false });

  if (projectsError) {
    console.error('Error fetching task projects:', projectsError);
    notFound();
  }

  const formattedProjects: TaskProject[] = (projects ?? []).map((project) => {
    const linkedItems = partitionTaskProjectLinks(project.task_project_tasks);

    return {
      ...project,
      status: project.status as ProjectStatus | null,
      priority: project.priority as ProjectPriority | null,
      health_status: project.health_status as ProjectHealth | null,
      created_at: project.created_at ?? new Date().toISOString(),
      ...linkedItems,
    };
  });

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-dynamic-surface/60 bg-background p-5">
        <p className="font-medium text-muted-foreground text-xs">
          {t('page_kicker')}
        </p>
        <h1 className="mt-1 font-semibold text-2xl">{t('page_heading')}</h1>
        <p className="mt-2 max-w-3xl text-muted-foreground text-sm">
          {t('page_subheading')}
        </p>
      </div>
      <TaskProjectsClient wsId={wsId} initialProjects={formattedProjects} />
    </div>
  );
}
