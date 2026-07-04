import { createFileRoute, notFound } from '@tanstack/react-router';
import HabitsClientPage from '@/components/habits/page-client';
import { requireCurrentUser } from '../../../lib/platform/auth-gate';
import { isHabitsEnabled } from '../../../lib/platform/habits';
import { createPageHead } from '../../../lib/platform/head';
import { resolveMessagesLocale } from '../../../lib/platform/messages';
import {
  type ResolvedWorkspace,
  resolveWorkspace,
} from '../../../lib/platform/workspace';

export const Route = createFileRoute('/$locale/$wsId/habits')({
  component: HabitsRoutePage,
  head: ({ params }) => {
    const locale = resolveMessagesLocale(params.locale);

    return createPageHead({
      description:
        'Track habits, routines, and shared progress across your workspace.',
      locale,
      title: 'Habits',
    });
  },
  loader: async ({ params }): Promise<ResolvedWorkspace> => {
    // Auth gate FIRST, fail closed: legacy getCurrentUser() -> redirect('/login').
    await requireCurrentUser({
      locale: params.locale,
      nextPath: `/${params.wsId}/habits`,
    });

    // Legacy getWorkspace() -> notFound() when missing.
    const workspace = await resolveWorkspace({ data: { wsId: params.wsId } });
    if (!workspace.exists) {
      throw notFound();
    }

    // Legacy `if (!(await isHabitsEnabled(wsId))) notFound()` — gate on the
    // ENABLE_HABITS workspace secret, resolved against the concrete id.
    const enabled = await isHabitsEnabled({
      data: { workspaceId: workspace.workspaceId },
    });
    if (!enabled) {
      throw notFound();
    }

    return workspace;
  },
});

function HabitsRoutePage() {
  const workspace = Route.useLoaderData() as ResolvedWorkspace | undefined;

  if (!workspace) {
    throw notFound();
  }

  return <HabitsClientPage wsId={workspace.workspaceId} />;
}
