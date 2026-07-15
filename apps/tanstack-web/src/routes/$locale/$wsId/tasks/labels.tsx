import { createFileRoute, notFound } from '@tanstack/react-router';
import TaskLabelsClient from '@tuturuuu/tasks-ui/tu-do/labels/client';
import type { TaskLabel } from '@tuturuuu/tasks-ui/tu-do/labels/types';
import { requireCurrentUser } from '../../../../lib/platform/auth-gate';
import { createPageHead } from '../../../../lib/platform/head';
import { resolveMessagesLocale } from '../../../../lib/platform/messages';
import {
  type ResolvedWorkspace,
  resolveWorkspace,
} from '../../../../lib/platform/workspace';
import { requireWorkspacePermission } from '../../../../lib/platform/workspace-permission';

const EMPTY_LABELS: TaskLabel[] = [];

export const Route = createFileRoute('/$locale/$wsId/tasks/labels')({
  component: LabelsRoutePage,
  head: ({ params }) => {
    const locale = resolveMessagesLocale(params.locale);

    return createPageHead({
      description: 'Manage task labels in your Tuturuuu workspace.',
      locale,
      title: 'Task Labels',
    });
  },
  loader: async ({ params }): Promise<ResolvedWorkspace> => {
    // Auth gate FIRST, fail closed: legacy getCurrentUser() -> redirect('/login').
    await requireCurrentUser({
      locale: params.locale,
      nextPath: `/${params.wsId}/tasks/labels`,
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

function LabelsRoutePage() {
  const workspace = Route.useLoaderData() as ResolvedWorkspace | undefined;

  if (!workspace) {
    throw notFound();
  }

  // Legacy prefetches `initialLabels` server-side as an optimization; the client
  // self-loads its data, so an empty initial set is functionally correct here.
  // (Client-side data fetch hits an /api origin tanstack-web does not serve yet
  // — the same Phase-2 data-origin gap noted for the other dashboard routes.)
  return (
    <TaskLabelsClient
      wsId={workspace.workspaceId}
      initialLabels={EMPTY_LABELS}
    />
  );
}
