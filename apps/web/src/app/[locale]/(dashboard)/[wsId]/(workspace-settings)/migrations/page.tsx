import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { resolveWorkspaceId } from '@tuturuuu/utils/constants';
import MigrationDashboard from './migration-dashboard';

export const metadata: Metadata = {
  title: 'Migrations',
  description:
    'Manage Migrations in the Workspace Settings area of your Tuturuuu workspace.',
};

interface Props {
  params: Promise<{
    wsId: string;
  }>;
}

export default async function PlatformMigrationsPage({ params }: Props) {
  const { wsId: id } = await params;
  const wsId = resolveWorkspaceId(id);
  if (wsId !== ROOT_WORKSPACE_ID) redirect(`/${wsId}/settings`);
  return <MigrationDashboard />;
}
