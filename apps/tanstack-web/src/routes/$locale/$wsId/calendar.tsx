import { createFileRoute, notFound } from '@tanstack/react-router';
import { TaskCalendarPageShell } from '@tuturuuu/tasks-ui/calendar/task-calendar-page-shell';
import type { CalendarConnection } from '@tuturuuu/types';
import { requireCurrentUser } from '../../../lib/platform/auth-gate';
import { createPageHead } from '../../../lib/platform/head';
import { resolveMessagesLocale } from '../../../lib/platform/messages';
import {
  type ResolvedFullWorkspace,
  resolveFullWorkspace,
} from '../../../lib/platform/workspace';
import { requireWorkspacePermission } from '../../../lib/platform/workspace-permission';

const EMPTY_CONNECTIONS: CalendarConnection[] = [];

type CalendarLoaderData = {
  userId: string;
  workspace: ResolvedFullWorkspace['workspace'];
};

export const Route = createFileRoute('/$locale/$wsId/calendar')({
  component: CalendarRoutePage,
  head: ({ params }) => {
    const locale = resolveMessagesLocale(params.locale);

    return createPageHead({
      description: 'Manage Calendar in your Tuturuuu workspace.',
      locale,
      title: 'Calendar',
    });
  },
  loader: async ({ params }): Promise<CalendarLoaderData> => {
    // Auth gate FIRST, fail closed: legacy resolveAuthenticatedSessionUser() ->
    // redirect('/login'). The profile carries the user id the shell needs.
    const user = await requireCurrentUser({
      locale: params.locale,
      nextPath: `/${params.wsId}/calendar`,
    });

    // Legacy getWorkspace() -> notFound(). The calendar shell needs the FULL
    // workspace row (timezone / first_day_of_week / personal), so resolve the
    // wide variant rather than the id-only one.
    const workspace = await resolveFullWorkspace({
      data: { wsId: params.wsId },
    });
    if (!workspace.exists) {
      throw notFound();
    }

    // Legacy withoutPermission('manage_calendar') -> redirect(`/${wsId}`).
    await requireWorkspacePermission({
      wsId: workspace.workspace.id,
      permission: 'manage_calendar',
      locale: params.locale,
    });

    return { userId: user.id, workspace: workspace.workspace };
  },
});

function CalendarRoutePage() {
  const { locale } = Route.useParams();
  const data = Route.useLoaderData() as CalendarLoaderData | undefined;

  if (!data) {
    throw notFound();
  }

  const { userId, workspace } = data;

  // Legacy server-fetches calendar_connections + a Google token via the admin
  // client. Those hit an origin tanstack-web does not serve yet (the Phase-2
  // data-origin gap); the shell renders correctly with no connected calendars
  // and no Google token, which is also the genuine first-load state.
  return (
    <TaskCalendarPageShell
      calendarConnections={EMPTY_CONNECTIONS}
      enableSmartScheduling
      experimentalGoogleToken={null}
      isPersonalWorkspace={workspace.id === userId}
      locale={locale}
      userId={userId}
      workspace={workspace}
    />
  );
}
