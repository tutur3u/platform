import WorkspaceWrapper from '@tuturuuu/ui/custom/workspace-wrapper';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { TutoringClient } from './tutoring-client';

export const metadata: Metadata = {
  title: 'Tutoring',
  description: 'Manage tutoring and remedial sessions.',
};

interface PageProps {
  params: Promise<{ locale: string; wsId: string }>;
}

export default async function TutoringPage({ params }: PageProps) {
  return (
    <WorkspaceWrapper params={params}>
      {async ({ wsId, isPersonal }) => {
        if (isPersonal) {
          notFound();
        }

        const permissions = await getPermissions({ wsId });
        if (!permissions || permissions.withoutPermission('view_user_groups')) {
          notFound();
        }

        return (
          <TutoringClient
            wsId={wsId}
            canManage={
              !permissions.withoutPermission('update_user_groups_scores')
            }
          />
        );
      }}
    </WorkspaceWrapper>
  );
}
