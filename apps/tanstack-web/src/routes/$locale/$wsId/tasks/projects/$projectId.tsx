import { createFileRoute, notFound } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequestHeaders } from '@tanstack/react-start/server';
import { withForwardedInternalApiAuth } from '@tuturuuu/internal-api';
import {
  getWorkspaceTaskProject,
  getWorkspaceTaskProjectTasks,
} from '@tuturuuu/internal-api/tasks';
import TaskProjectDetailPageClient from '@tuturuuu/tasks-ui/tu-do/projects/projectId/task-project-detail-page-client';
import { requireCurrentUser } from '../../../../../lib/platform/auth-gate';
import { createPageHead } from '../../../../../lib/platform/head';
import { resolveMessagesLocale } from '../../../../../lib/platform/messages';
import {
  type ResolvedFullWorkspace,
  resolveFullWorkspace,
} from '../../../../../lib/platform/workspace';
import { requireWorkspacePermission } from '../../../../../lib/platform/workspace-permission';

type TaskProject = Awaited<ReturnType<typeof getWorkspaceTaskProject>>;
type TaskProjectData = Awaited<ReturnType<typeof getWorkspaceTaskProjectTasks>>;

type ProjectLoaderData = {
  currentUserId: string;
  initialProject: TaskProject;
  initialProjectData: TaskProjectData;
  projectId: string;
  workspace: ResolvedFullWorkspace['workspace'];
};

/**
 * Forwarded-auth data load for the task project detail page. Mirrors the
 * legacy shared component's parallel `getWorkspaceTaskProject` +
 * `getWorkspaceTaskProjectTasks` calls (RLS-respecting). Returns `null` on any
 * failure so the loader can map it to a not-found, matching the legacy
 * `catch -> notFound()`.
 */
const loadTaskProject = createServerFn({ method: 'GET' })
  .validator((data: { wsId: string; projectId: string }) => data)
  .handler(
    async ({
      data,
    }): Promise<{
      initialProject: TaskProject;
      initialProjectData: TaskProjectData;
    } | null> => {
      const options = withForwardedInternalApiAuth(getRequestHeaders());

      try {
        const [initialProject, initialProjectData] = await Promise.all([
          getWorkspaceTaskProject(data.wsId, data.projectId, options),
          getWorkspaceTaskProjectTasks(data.wsId, data.projectId, options),
        ]);

        return { initialProject, initialProjectData };
      } catch {
        return null;
      }
    }
  );

export const Route = createFileRoute(
  '/$locale/$wsId/tasks/projects/$projectId'
)({
  component: ProjectDetailRoutePage,
  head: ({ params }) => {
    const locale = resolveMessagesLocale(params.locale);

    return createPageHead({
      description: 'View and manage a task project in your Tuturuuu workspace.',
      locale,
      title: 'Task Project',
    });
  },
  loader: async ({ params }): Promise<ProjectLoaderData> => {
    // Auth gate FIRST, fail closed: legacy getCurrentUser() -> redirect('/login').
    const user = await requireCurrentUser({
      locale: params.locale,
      nextPath: `/${params.wsId}/tasks/projects/${params.projectId}`,
    });

    // Legacy getWorkspace() -> notFound(). The client needs the full row.
    const workspace = await resolveFullWorkspace({
      data: { wsId: params.wsId },
    });
    if (!workspace.exists) {
      throw notFound();
    }

    // Legacy withoutPermission('manage_projects') -> notFound().
    await requireWorkspacePermission({
      wsId: workspace.workspace.id,
      permission: 'manage_projects',
      locale: params.locale,
    });

    // Legacy server-fetches project + tasks via forwarded-auth readers, then
    // notFound() on failure. This is a functional data-backed migration (the
    // internal-api facades resolve server-side), not a Phase-2-gapped shell.
    const loaded = await loadTaskProject({
      data: { wsId: workspace.workspace.id, projectId: params.projectId },
    });
    if (!loaded) {
      throw notFound();
    }

    return {
      currentUserId: user.id,
      initialProject: loaded.initialProject,
      initialProjectData: loaded.initialProjectData,
      projectId: params.projectId,
      workspace: workspace.workspace,
    };
  },
});

function ProjectDetailRoutePage() {
  const data = Route.useLoaderData() as ProjectLoaderData | undefined;

  if (!data) {
    throw notFound();
  }

  return (
    <TaskProjectDetailPageClient
      currentUserId={data.currentUserId}
      initialProject={data.initialProject}
      initialProjectData={data.initialProjectData}
      projectId={data.projectId}
      workspace={data.workspace}
      wsId={data.workspace.id}
    />
  );
}
