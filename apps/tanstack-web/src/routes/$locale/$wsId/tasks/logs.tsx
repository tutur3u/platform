import { createFileRoute, notFound } from '@tanstack/react-router';
import LogsClient from '@tuturuuu/tasks-ui/tu-do/logs/logs-client';
import { requireCurrentUser } from '../../../../lib/platform/auth-gate';
import { createPageHead } from '../../../../lib/platform/head';
import { resolveMessagesLocale } from '../../../../lib/platform/messages';
import {
  type ResolvedWorkspace,
  resolveWorkspace,
} from '../../../../lib/platform/workspace';
import { requireWorkspacePermission } from '../../../../lib/platform/workspace-permission';

const EMPTY_BOARDS: { id: string; name: string | null }[] = [];
const EMPTY_ESTIMATION_TYPES: Record<string, string | null> = {};

export const Route = createFileRoute('/$locale/$wsId/tasks/logs')({
  component: LogsRoutePage,
  head: ({ params }) => {
    const locale = resolveMessagesLocale(params.locale);

    return createPageHead({
      description: 'View task change history across your Tuturuuu workspace.',
      locale,
      title: 'Activity Logs',
    });
  },
  loader: async ({ params }): Promise<ResolvedWorkspace> => {
    // Auth gate FIRST, fail closed: legacy getCurrentUser() -> redirect('/login').
    await requireCurrentUser({
      locale: params.locale,
      nextPath: `/${params.wsId}/tasks/logs`,
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

function LogsRoutePage() {
  const workspace = Route.useLoaderData() as ResolvedWorkspace | undefined;

  if (!workspace) {
    throw notFound();
  }

  // Legacy prefetches `boards`/`estimationTypes` server-side to seed the filter
  // dropdowns and timeline estimation display; LogsClient self-loads its log
  // entries via TanStack Query, so empty initial filter data is functionally
  // correct here. (Client-side data fetch hits an /api origin tanstack-web does
  // not serve yet — the same Phase-2 data-origin gap noted for other routes.)
  return (
    <LogsClient
      wsId={workspace.workspaceId}
      boards={EMPTY_BOARDS}
      estimationTypes={EMPTY_ESTIMATION_TYPES}
    />
  );
}
