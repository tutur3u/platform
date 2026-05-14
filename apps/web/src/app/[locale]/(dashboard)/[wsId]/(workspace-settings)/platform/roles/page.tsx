import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import { Separator } from '@tuturuuu/ui/separator';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { CustomDataTable } from '@/components/custom-data-table';
import WorkspaceWrapper from '@/components/workspace-wrapper';
import { getPlatformRoleColumns } from './columns';
import {
  getHiveAccessState,
  getPlatformRoleStats,
  getPlatformUserData,
} from './data';
import { HiveAccessPanel } from './hive-access-panel';
import { PlatformRoleOverview } from './platform-role-overview';

export const metadata: Metadata = {
  title: 'Roles',
  description: 'Manage Roles in the Platform area of your Tuturuuu workspace.',
};

interface Props {
  params: Promise<{
    wsId: string;
  }>;
  searchParams: Promise<{
    q?: string;
    page?: string;
    pageSize?: string;
    role?: string;
    enabled?: string;
  }>;
}

export default async function PlatformRolesPage({
  params,
  searchParams,
}: Props) {
  return (
    <WorkspaceWrapper params={params}>
      {async ({ wsId }) => {
        const locale = await getLocale();
        const t = await getTranslations();

        // Only allow root workspace members to access this page
        if (wsId !== ROOT_WORKSPACE_ID) {
          redirect(`/${wsId}/settings`);
        }

        const permissions = await getPermissions({
          wsId,
        });
        if (!permissions) notFound();
        const { withoutPermission } = permissions;

        if (withoutPermission('manage_workspace_roles'))
          redirect(`/${wsId}/settings`);

        const { q, page, pageSize, role, enabled } = await searchParams;

        // Fetch platform user data
        const { userData, userCount } = await getPlatformUserData({
          q,
          page: page || '1',
          pageSize: pageSize || '10',
          role,
          enabled,
        });
        const hiveAccess = await getHiveAccessState();

        const roleStats = getPlatformRoleStats(userData);
        const hiveEnabledCount = hiveAccess.members.filter(
          (member) => member.enabled
        ).length;

        return (
          <>
            <FeatureSummary
              pluralTitle={t('platform-roles.plural')}
              description={t('platform-roles.description')}
            />

            <PlatformRoleOverview
              hiveEnabledCount={hiveEnabledCount}
              labels={{
                activeUsers: t('platform-roles.active_users'),
                admins: t('platform-roles.admins'),
                challengeManagers: t('platform-roles.challenge_managers'),
                globalManagers: t('platform-roles.global_managers'),
                hiveResearchers: t('platform-roles.hive_researchers'),
                inactive: t('platform-roles.inactive'),
                members: t('platform-roles.members'),
                platformCoverage: t('platform-roles.platform_coverage'),
                visibleDirectory: t('platform-roles.matching_users'),
                workspaceCreators: t('platform-roles.workspace_creators'),
              }}
              stats={roleStats}
              totalUsers={userCount}
            />

            <Separator className="my-4" />

            <HiveAccessPanel
              initialAvailable={hiveAccess.available}
              initialMembers={hiveAccess.members}
              initialRequests={hiveAccess.requests}
              locale={locale}
              totalUsers={userCount}
              users={userData}
            />

            <Separator className="my-4" />

            <CustomDataTable
              data={userData}
              columnGenerator={getPlatformRoleColumns}
              count={userCount}
              extraData={{ locale }}
              namespace="platform-role-data-table"
              defaultVisibility={{
                id: false,
                created_at: false,
                // Show permissions overview by default, hide individual toggles initially
                platform_role: true,
                enabled: true,
                display_name: true,
                // Hide individual permission columns by default to prevent overwhelming UI
                allow_role_management: false,
                allow_manage_all_challenges: false,
                allow_challenge_management: false,
                allow_workspace_creation: false,
              }}
            />
          </>
        );
      }}
    </WorkspaceWrapper>
  );
}
