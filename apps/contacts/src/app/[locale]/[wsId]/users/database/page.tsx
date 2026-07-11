import { MessageSquarePlus, UserPlus } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import ModifiableDialogTrigger from '@tuturuuu/ui/custom/modifiable-dialog-trigger';
import { getPermissions, getWorkspace } from '@tuturuuu/utils/workspace-helper';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { AuditLogTable } from './audit-log-table';
import { DuplicateUsersDialog } from './components/duplicate-users-dialog';
import { ProfileLinksManager } from './components/profile-links-manager';
import { DatabaseTabs } from './database-tabs';
import UserForm from './form';
import { PlatformLinkRepairDialog } from './platform-link-repair-dialog';
import { UsersDatabaseHero } from './users-database-hero';
import {
  UsersDatabaseHeroStats,
  UsersDatabaseHeroStatsSkeleton,
} from './users-database-hero-stats';
import { UsersTabContent } from './users-tab-content';
import { UsersTableSkeleton } from './users-table-skeleton';

export const metadata: Metadata = {
  title: 'Database',
  description: 'Manage Database in the Users area of your Tuturuuu workspace.',
};

function parseIntSearchParam(value?: string, fallback = 1) {
  if (!value) return fallback;

  const parsed = Number.parseInt(value, 10);

  return Number.isNaN(parsed) ? fallback : parsed;
}

function clampPageSize(value?: string, fallback = 10) {
  const parsed = parseIntSearchParam(value, fallback);
  return Math.min(Math.max(parsed, 1), 100);
}

function resolveDatabaseTab(
  tab?: string
): 'users' | 'audit-log' | 'profile-links' {
  if (tab === 'audit-log') return 'audit-log';
  if (tab === 'profile-links') return 'profile-links';
  return 'users';
}

interface Props {
  params: Promise<{
    locale: string;
    wsId: string;
  }>;
  searchParams: Promise<{
    tab?: string;
    q?: string;
    page?: string;
    pageSize?: string;
    includedGroups?: string | string[];
    excludedGroups?: string | string[];
    status?: string;
    linkStatus?: string;
    groupMembership?: string;
    requireAttention?: string;
    logPeriod?: string;
    logMonth?: string;
    logYear?: string;
    logEventKind?: string;
    logSource?: string;
    logAffectedUser?: string;
    logActor?: string;
    logPage?: string;
    logPageSize?: string;
  }>;
}

export default async function WorkspaceUsersPage({
  params,
  searchParams,
}: Props) {
  await connection();

  const t = await getTranslations();
  const { locale, wsId: id } = await params;
  const sp = await searchParams;
  const activeTab = resolveDatabaseTab(sp.tab);

  const workspace = await getWorkspace(id);
  if (!workspace) notFound();
  const wsId = workspace.id;

  const workspacePermissions = await getPermissions({ wsId });
  if (!workspacePermissions) notFound();
  const { containsPermission } = workspacePermissions;

  const hasPrivateInfo = containsPermission('view_users_private_info');
  const hasPublicInfo = containsPermission('view_users_public_info');
  const canCreateUsers = containsPermission('create_users');
  const canUpdateUsers = containsPermission('update_users');
  const canDeleteUsers = containsPermission('delete_users');
  const canCheckUserAttendance = containsPermission('check_user_attendance');
  const canExportUsers = containsPermission('export_users_data');
  const canViewAuditLog = containsPermission('manage_workspace_audit_logs');
  const canViewFeedbacks = containsPermission('view_user_groups');
  const canManageFeedbacks = containsPermission('update_user_groups_scores');
  const canManageProfileLinks = containsPermission('manage_user_profile_links');
  const canViewUsers = hasPrivateInfo || hasPublicInfo;

  if (!canViewUsers && !canViewAuditLog && !canManageProfileLinks) {
    notFound();
  }

  if (activeTab === 'users' && !canViewUsers) {
    notFound();
  }

  if (activeTab === 'audit-log' && !canViewAuditLog) {
    notFound();
  }

  if (activeTab === 'profile-links' && !canManageProfileLinks) {
    notFound();
  }

  const permissions = {
    hasPrivateInfo,
    hasPublicInfo,
    canCreateUsers,
    canUpdateUsers,
    canDeleteUsers,
    canCheckUserAttendance,
    canManageUserProfileLinks: canManageProfileLinks,
  };

  const canRepairPlatformLinks =
    canUpdateUsers && hasPrivateInfo && hasPublicInfo;
  const hasQuickActions = canViewFeedbacks || canRepairPlatformLinks;

  const usersContent =
    activeTab === 'users' ? (
      <Suspense fallback={<UsersTableSkeleton />}>
        <UsersTabContent
          wsId={wsId}
          locale={locale}
          permissions={permissions}
          canViewFeedbacks={canViewFeedbacks}
          canManageFeedbacks={canManageFeedbacks}
          canExportUsers={canExportUsers}
        />
      </Suspense>
    ) : undefined;

  const auditLogContent =
    activeTab === 'audit-log' ? (
      <AuditLogTable
        wsId={wsId}
        locale={locale}
        period={sp.logPeriod}
        month={sp.logMonth}
        year={sp.logYear}
        eventKind={sp.logEventKind}
        source={sp.logSource}
        affectedUserQuery={sp.logAffectedUser}
        actorQuery={sp.logActor}
        page={parseIntSearchParam(sp.logPage, 1)}
        pageSize={clampPageSize(sp.logPageSize, 10)}
        canExport={canExportUsers}
        canRepairStatusHistory={canViewAuditLog}
        canViewPrivateInfo={hasPrivateInfo}
      />
    ) : undefined;

  return (
    <>
      {canViewUsers ? (
        <UsersDatabaseHero
          title={t('ws-users.plural')}
          description={t('ws-users.description')}
          primaryAction={
            canCreateUsers ? (
              <ModifiableDialogTrigger
                title={t('ws-users.singular')}
                createDescription={t('ws-users.create_description')}
                trigger={
                  <Button size="sm">
                    <UserPlus className="mr-2 h-4 w-4" />
                    {t('ws-users.create')}
                  </Button>
                }
                form={
                  <UserForm
                    wsId={wsId}
                    canCreateUsers={canCreateUsers}
                    canUpdateUsers={canUpdateUsers}
                  />
                }
              />
            ) : undefined
          }
          quickActions={
            hasQuickActions ? (
              <>
                {canViewFeedbacks ? (
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/${wsId}/users/feedbacks`}>
                      <MessageSquarePlus className="mr-2 h-4 w-4" />
                      {t('ws-users.feedback_center_open')}
                    </Link>
                  </Button>
                ) : null}
                {canRepairPlatformLinks ? (
                  <PlatformLinkRepairDialog wsId={wsId} />
                ) : null}
                {canDeleteUsers && canUpdateUsers && hasPrivateInfo ? (
                  <DuplicateUsersDialog wsId={wsId} />
                ) : null}
              </>
            ) : undefined
          }
          stats={
            <Suspense
              fallback={
                <UsersDatabaseHeroStatsSkeleton
                  canViewFeedbacks={canViewFeedbacks}
                />
              }
            >
              <UsersDatabaseHeroStats
                wsId={wsId}
                canViewFeedbacks={canViewFeedbacks}
              />
            </Suspense>
          }
        />
      ) : null}
      <DatabaseTabs
        activeTab={activeTab}
        canViewUsers={canViewUsers}
        canViewAuditLog={canViewAuditLog}
        canManageProfileLinks={canManageProfileLinks}
        usersContent={usersContent}
        auditLogContent={auditLogContent}
        profileLinksContent={
          activeTab === 'profile-links' ? (
            <ProfileLinksManager wsId={wsId} />
          ) : undefined
        }
      />
    </>
  );
}
