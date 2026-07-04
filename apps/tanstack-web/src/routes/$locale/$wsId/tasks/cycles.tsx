import { createFileRoute, notFound } from '@tanstack/react-router';
import { TaskCyclesClient } from '@tuturuuu/ui/tu-do/cycles/task-cycles-client';
import { requireCurrentUser } from '../../../../lib/platform/auth-gate';
import { createPageHead } from '../../../../lib/platform/head';
import { resolveMessagesLocale } from '../../../../lib/platform/messages';
import {
  type ResolvedWorkspace,
  resolveWorkspace,
} from '../../../../lib/platform/workspace';
import { requireWorkspacePermission } from '../../../../lib/platform/workspace-permission';

type TaskCycle = Parameters<
  typeof TaskCyclesClient
>[0]['initialCycles'][number];

const EMPTY_CYCLES: TaskCycle[] = [];

export const Route = createFileRoute('/$locale/$wsId/tasks/cycles')({
  component: CyclesRoutePage,
  head: ({ params }) => {
    const locale = resolveMessagesLocale(params.locale);

    return createPageHead({
      description: 'Plan and track time-boxed sprints for tasks.',
      locale,
      title: 'Task Cycles',
    });
  },
  loader: async ({ params }): Promise<ResolvedWorkspace> => {
    // Auth gate FIRST, fail closed: legacy getCurrentUser() -> redirect('/login').
    await requireCurrentUser({
      locale: params.locale,
      nextPath: `/${params.wsId}/tasks/cycles`,
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

function CyclesRoutePage() {
  const workspace = Route.useLoaderData() as ResolvedWorkspace | undefined;

  if (!workspace) {
    throw notFound();
  }

  // Legacy prefetches `initialCycles` server-side as an optimization; the client
  // self-loads its data via TanStack Query, so an empty initial set is
  // functionally correct here. (Client-side /api/v1 fetch hits an origin
  // tanstack-web does not serve yet — the same Phase-2 data-origin gap noted
  // for the other dashboard routes.)
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-bold text-2xl">Task Cycles</h1>
        <p className="text-muted-foreground">
          Time-box work into cycles (sprints) and track progress.
        </p>
      </div>
      <TaskCyclesClient
        wsId={workspace.workspaceId}
        initialCycles={EMPTY_CYCLES}
      />
    </div>
  );
}
