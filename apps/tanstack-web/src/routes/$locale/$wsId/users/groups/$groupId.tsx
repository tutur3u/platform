import { createFileRoute, Outlet, useLocation } from '@tanstack/react-router';
import { UserGroupLoading } from '../../../../../components/loading/workspace-route-loading';

export const Route = createFileRoute('/$locale/$wsId/users/groups/$groupId')({
  component: UserGroupRouteShell,
});

function UserGroupRouteShell() {
  const { groupId, locale, wsId } = Route.useParams();
  const pathname = useLocation({ select: (location) => location.pathname });
  const groupHref = `/${locale}/${wsId}/users/groups/${groupId}`;

  if (pathname === groupHref || pathname === `${groupHref}/`) {
    return <UserGroupLoading />;
  }

  return <Outlet />;
}
