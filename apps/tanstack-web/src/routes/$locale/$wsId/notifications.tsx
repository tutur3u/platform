import { createFileRoute, notFound } from '@tanstack/react-router';
import { NotificationListPage } from '@/components/notifications/notification-list-page';
import {
  loadNotificationsData,
  type NotificationsRouteData,
  validateNotificationsSearch,
} from '@/lib/notifications/notification-list-route-data';
import {
  getWorkspaceNextPath,
  requireCurrentUser,
} from '@/lib/platform/auth-gate';
import { createPageHead } from '@/lib/platform/head';
import { resolveMessagesLocale } from '@/lib/platform/messages';
import { resolveWorkspace } from '@/lib/platform/workspace';

export const Route = createFileRoute('/$locale/$wsId/notifications')({
  component: NotificationsRoutePage,
  validateSearch: validateNotificationsSearch,
  loaderDeps: ({ search }) => ({
    page: search.page,
    pageSize: search.pageSize,
    priority: search.priority,
    scope: search.scope,
    tab: search.tab,
    type: search.type,
  }),
  head: ({ params }) => {
    const locale = resolveMessagesLocale(params.locale);

    return createPageHead({
      description: 'View notifications across your Tuturuuu workspaces.',
      locale,
      title: 'Notifications',
    });
  },
  loader: async ({
    deps,
    location,
    params,
  }): Promise<NotificationsRouteData> => {
    await requireCurrentUser({
      locale: params.locale,
      nextPath: getWorkspaceNextPath(
        params,
        location.pathname,
        'notifications'
      ),
    });

    const workspace = await resolveWorkspace({ data: { wsId: params.wsId } });
    if (!workspace.exists) {
      throw notFound();
    }

    return loadNotificationsData({
      data: {
        ...deps,
        wsId: workspace.workspaceId,
      },
    });
  },
});

function NotificationsRoutePage() {
  const { locale } = Route.useParams();
  const data = Route.useLoaderData() as NotificationsRouteData | undefined;

  if (!data) {
    throw notFound();
  }

  return (
    <NotificationListPage data={data} locale={resolveMessagesLocale(locale)} />
  );
}
