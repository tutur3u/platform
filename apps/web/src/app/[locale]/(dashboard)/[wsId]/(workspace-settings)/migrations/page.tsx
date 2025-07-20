import MigrationDashboard from './migration-dashboard';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { redirect } from 'next/navigation';

interface Props {
  params: Promise<{
    wsId: string;
  }>;
}

export default async function PlatformMigrationsPage({ params }: Props) {
  const { wsId } = await params;
  if (wsId !== ROOT_WORKSPACE_ID) redirect(`/${wsId}/settings`);
  return <MigrationDashboard />;
}
