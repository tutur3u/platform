import { createClient } from '@tuturuuu/supabase/next/server';
import { TaskInitiativesClient } from '@tuturuuu/ui/tu-do/initiatives/task-initiatives-client';
import { getCurrentUser } from '@tuturuuu/utils/user-helper';
import { getPermissions, getWorkspace } from '@tuturuuu/utils/workspace-helper';
import { notFound, redirect } from 'next/navigation';

interface Props {
  params: Promise<{
    wsId: string;
  }>;
}

type InitiativeRow = {
  id: string;
  name: string;
  description: string | null;
  status: string | null;
  created_at: string;
  creator: {
    id: string;
    display_name: string | null;
    avatar_url: string | null;
  } | null;
  task_project_initiatives:
    | {
        project_id: string;
        project: {
          id: string;
          name: string;
          status: string | null;
        } | null;
      }[]
    | null;
};

/**
 * Shared Task Initiatives Page component.
 * Handles workspace resolution, permissions, and data fetching.
 * Used by both apps/web and apps/tasks.
 */
export default async function TaskInitiativesPage({ params }: Props) {
  const { wsId: id } = await params;

  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const workspace = await getWorkspace(id);
  if (!workspace) redirect('/');

  const wsId = workspace.id;

  const { withoutPermission } = await getPermissions({ wsId });
  if (withoutPermission('manage_projects')) redirect(`/${wsId}`);

  const supabase = await createClient();

  const { data: initiativesData, error } = await supabase
    .from('task_initiatives')
    .select(
      `
        *,
        creator:users!task_initiatives_creator_id_fkey(
          id, display_name, avatar_url
        ),
        task_project_initiatives(
          project_id,
          project:task_projects(id, name, status)
        )
      `
    )
    .eq('ws_id', wsId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching task initiatives:', error);
    notFound();
  }

  const toInitiativeStatus = (value: string | null) => {
    const allowed = ['active', 'completed', 'on_hold', 'cancelled'] as const;
    if (!value) return null;
    return allowed.includes(value as (typeof allowed)[number])
      ? (value as (typeof allowed)[number])
      : null;
  };

  const initiatives =
    (initiativesData as InitiativeRow[] | null)?.map((initiative) => ({
      id: initiative.id,
      name: initiative.name,
      description: initiative.description,
      status: toInitiativeStatus(initiative.status),
      created_at: initiative.created_at,
      creator: initiative.creator,
      projectsCount: initiative.task_project_initiatives?.length ?? 0,
      linkedProjects:
        initiative.task_project_initiatives?.flatMap((link) =>
          link.project ? [link.project] : []
        ) ?? [],
    })) ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-bold text-2xl">Task Initiatives</h1>
        <p className="text-muted-foreground">
          Organize related projects into higher-level initiatives to track
          strategic outcomes.
        </p>
      </div>
      <TaskInitiativesClient wsId={wsId} initialInitiatives={initiatives} />
    </div>
  );
}
