import { createFileRoute } from '@tanstack/react-router';
import { UserReportLoading } from '../../../../../components/loading/workspace-route-loading';

export const Route = createFileRoute('/$locale/$wsId/users/reports/$reportId')({
  component: UserReportLoadingRoute,
});

function UserReportLoadingRoute() {
  const { locale } = Route.useParams();

  return <UserReportLoading locale={locale} />;
}
