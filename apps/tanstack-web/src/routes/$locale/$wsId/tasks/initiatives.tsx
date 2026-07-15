import { createFileRoute, notFound } from '@tanstack/react-router';
import { TaskInitiativesClient } from '@tuturuuu/tasks-ui/tu-do/initiatives/task-initiatives-client';
import { requireCurrentUser } from '../../../../lib/platform/auth-gate';
import { createPageHead } from '../../../../lib/platform/head';
import { resolveMessagesLocale } from '../../../../lib/platform/messages';
import {
  type ResolvedWorkspace,
  resolveWorkspace,
} from '../../../../lib/platform/workspace';
import { requireWorkspacePermission } from '../../../../lib/platform/workspace-permission';

export const Route = createFileRoute('/$locale/$wsId/tasks/initiatives')({
  component: InitiativesRoutePage,
  head: ({ params }) => {
    const locale = resolveMessagesLocale(params.locale);

    return createPageHead({
      description:
        'Group projects into strategic initiatives for your workspace.',
      locale,
      title: 'Task Initiatives',
    });
  },
  loader: async ({ params }): Promise<ResolvedWorkspace> => {
    // Auth gate FIRST, fail closed: legacy getCurrentUser() -> redirect('/login').
    await requireCurrentUser({
      locale: params.locale,
      nextPath: `/${params.wsId}/tasks/initiatives`,
    });

    // Legacy getWorkspace() -> notFound() when missing/forbidden.
    const workspace = await resolveWorkspace({ data: { wsId: params.wsId } });
    if (!workspace.exists) {
      throw notFound();
    }

    // Legacy withoutPermission('manage_projects') -> redirect(`/${wsId}`).
    await requireWorkspacePermission({
      wsId: workspace.workspaceId,
      permission: 'manage_projects',
      locale: params.locale,
    });

    return workspace;
  },
});

function InitiativesRoutePage() {
  const workspace = Route.useLoaderData() as ResolvedWorkspace | undefined;

  if (!workspace) {
    throw notFound();
  }

  // Legacy prefetches `initialInitiatives` server-side as an optimization; the
  // client self-loads via TanStack Query (listWorkspaceTaskInitiatives) and
  // uses the prop only as initialData, so an empty initial set is functionally
  // correct here. (Client-side /api/v1 fetch hits an origin tanstack-web does
  // not serve yet — the same Phase-2 data-origin gap as the other routes.)
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-bold text-2xl">Task Initiatives</h1>
        <p className="text-muted-foreground">
          Organize related projects into higher-level initiatives to track
          strategic outcomes.
        </p>
      </div>
      <TaskInitiativesClient
        wsId={workspace.workspaceId}
        initialInitiatives={[]}
      />
    </div>
  );
}
