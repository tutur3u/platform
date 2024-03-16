import MigrationDashboard from './migration-dashboard';
import { notFound } from 'next/navigation';
import { ROOT_WORKSPACE_ID } from '@/constants/common';

export const dynamic = 'force-dynamic';

interface Props {
  params: {
    wsId: string;
  };
}

export default async function PlatformMigrationsPage({
  params: { wsId },
}: Props) {
  if (wsId !== ROOT_WORKSPACE_ID) notFound();
  return <MigrationDashboard />;
}
