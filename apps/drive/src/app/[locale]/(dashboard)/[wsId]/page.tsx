import { notFound, redirect } from 'next/navigation';
import { connection } from 'next/server';
import {
  getDriveWorkspace,
  getDriveWorkspacePermissions,
} from '@/lib/workspace';
import DriveExplorerClient from './drive/drive-explorer-client';

interface WorkspaceDrivePageProps {
  params: Promise<{
    wsId: string;
  }>;
}

export default async function WorkspaceDrivePage({
  params,
}: WorkspaceDrivePageProps) {
  await connection();

  const { wsId: id } = await params;
  const workspace = await getDriveWorkspace(id);

  if (!workspace) {
    notFound();
  }

  const permissions = await getDriveWorkspacePermissions(workspace.id);

  if (!permissions) {
    notFound();
  }

  if (permissions.withoutPermission('manage_drive')) {
    redirect(`/${id}`);
  }

  return <DriveExplorerClient wsId={workspace.id} />;
}
