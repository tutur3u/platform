import { getCurrentWorkspaceUser } from '@tuturuuu/utils/user-helper';
import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import { Separator } from '@tuturuuu/ui/separator';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import WorkspaceWrapper from '@/components/workspace-wrapper';
import GroupIndicatorsSelector from './group-indicators-selector';

export const metadata: Metadata = {
  title: 'Group Indicators',
  description:
    'Manage Indicators for groups in the Users area of your Tuturuuu workspace.',
};

interface Props {
  params: Promise<{
    locale: string;
    wsId: string;
  }>;
}

export default async function GroupIndicatorsPage({ params }: Props) {
  return (
    <WorkspaceWrapper params={params}>
      {async ({ wsId }) => {
        const t = await getTranslations();
        const user = await getCurrentWorkspaceUser(wsId);

        const { containsPermission } = await getPermissions({
          wsId,
        });

        const canViewUserGroupsScores = containsPermission(
          'view_user_groups_scores'
        );
        if (!canViewUserGroupsScores) {
          notFound();
        }

        const hasManageUsers = containsPermission('manage_users');
        const canCreateUserGroupsScores = containsPermission(
          'create_user_groups_scores'
        );
        const canUpdateUserGroupsScores = containsPermission(
          'update_user_groups_scores'
        );
        const canDeleteUserGroupsScores = containsPermission(
          'delete_user_groups_scores'
        );

        return (
          <>
            <FeatureSummary
              pluralTitle={t('ws-user-group-indicators.plural')}
              singularTitle={t('ws-user-group-indicators.singular')}
              description={t('ws-user-group-indicators.description')}
            />
            <Separator className="my-4" />
            <GroupIndicatorsSelector
              wsId={wsId}
              workspaceUserId={user?.virtual_user_id}
              hasManageUsers={hasManageUsers}
              canCreateUserGroupsScores={canCreateUserGroupsScores}
              canUpdateUserGroupsScores={canUpdateUserGroupsScores}
              canDeleteUserGroupsScores={canDeleteUserGroupsScores}
            />
          </>
        );
      }}
    </WorkspaceWrapper>
  );
}
