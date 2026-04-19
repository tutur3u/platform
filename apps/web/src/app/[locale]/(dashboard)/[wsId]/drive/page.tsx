import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import WorkspaceWrapper from '@/components/workspace-wrapper';
import DriveExplorerClient from './drive-explorer-client';

export const metadata: Metadata = {
  title: 'Drive',
  description: 'Manage Drive in your Tuturuuu workspace.',
};

interface Props {
  params: Promise<{
    wsId: string;
  }>;
}

export default async function WorkspaceStorageObjectsPage({ params }: Props) {
  return (
    <WorkspaceWrapper params={params}>
      {async ({ wsId }) => {
        const permissions = await getPermissions({
          wsId,
        });

        if (!permissions) {
          notFound();
        }

        if (permissions.withoutPermission('manage_drive')) {
          redirect(`/${wsId}`);
        }

        return <DriveExplorerClient wsId={wsId} />;
      }}
    </WorkspaceWrapper>
  );
}
