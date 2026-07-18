'use client';

import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CreditCard, Loader2 } from '@tuturuuu/icons';
import {
  checkWorkspacePermission,
  getWorkspace,
  getWorkspaceMemberSettings,
  getWorkspacePermissionsSummary,
} from '@tuturuuu/internal-api';
import type { Workspace } from '@tuturuuu/types';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import { Button } from '@tuturuuu/ui/button';
import { StandardWorkspaceAccessPage } from '@tuturuuu/ui/custom/workspace-access';
import { useTranslations } from 'next-intl';
import { GuestSelfJoinSetting } from './guest-self-join-setting';
import { InviteLinksSection } from './invite-links-section';
import { WorkspaceAvatarEditor } from './workspace-avatar-editor';
import { WorkspaceIdentityForm } from './workspace-identity-form';

interface Props {
  activeTab: string;
  user: WorkspaceUser | null;
  workspace?: Workspace | null;
  wsId?: string;
}

export function SatelliteWorkspaceSettingsPanel({
  activeTab,
  user,
  workspace: workspaceProp,
  wsId,
}: Props) {
  const t = useTranslations('satellite-workspace-settings');
  const workspaceQuery = useQuery({
    enabled: Boolean(wsId && !workspaceProp),
    queryFn: () => getWorkspace(wsId ?? ''),
    queryKey: ['workspace', wsId],
    staleTime: 5 * 60 * 1000,
  });
  const workspace = workspaceProp ?? workspaceQuery.data ?? null;
  const permissionsQuery = useQuery({
    enabled: Boolean(workspace?.id),
    queryFn: async () => {
      const [summary, roles] = await Promise.all([
        getWorkspacePermissionsSummary(workspace?.id ?? ''),
        checkWorkspacePermission(workspace?.id ?? '', 'manage_workspace_roles'),
      ]);
      return { ...summary, manage_workspace_roles: roles.hasPermission };
    },
    queryKey: ['workspace-settings-permissions', workspace?.id],
    staleTime: 60_000,
  });
  const memberSettingsQuery = useQuery({
    enabled: Boolean(
      workspace?.id &&
        activeTab === 'workspace_members' &&
        (permissionsQuery.data?.manage_workspace_members ||
          permissionsQuery.data?.manage_workspace_roles)
    ),
    queryFn: () => getWorkspaceMemberSettings(workspace?.id ?? ''),
    queryKey: ['workspace-member-settings', workspace?.id],
    staleTime: 30_000,
  });

  if (!activeTab.startsWith('workspace_')) return null;
  if ((!workspace && workspaceQuery.isPending) || permissionsQuery.isPending) {
    return <PanelLoading label={t('loading')} />;
  }
  if (!workspace || workspaceQuery.isError || permissionsQuery.isError) {
    return (
      <PanelError
        description={t('load_error_description')}
        title={t('load_error')}
      />
    );
  }

  const permissions = permissionsQuery.data;
  const canManageMembers = permissions?.manage_workspace_members ?? false;

  if (activeTab === 'workspace_general') {
    return (
      <div className="space-y-4">
        <PanelIntro
          description={t('general_description')}
          title={t('general')}
        />
        {!permissions?.manage_workspace_settings && <RestrictedNotice />}
        <WorkspaceAvatarEditor
          canEdit={permissions?.manage_workspace_settings ?? false}
          workspace={workspace}
        />
        <WorkspaceIdentityForm
          canEdit={permissions?.manage_workspace_settings ?? false}
          workspace={workspace}
        />
      </div>
    );
  }

  if (activeTab === 'workspace_members') {
    return (
      <div className="space-y-4">
        <PanelIntro
          description={t('members_description')}
          title={t('members')}
        />
        {!canManageMembers && !permissions?.manage_workspace_roles && (
          <RestrictedNotice />
        )}
        <GuestSelfJoinSetting
          disabled={!canManageMembers}
          wsId={workspace.id}
        />
        <InviteLinksSection
          disabled={
            !canManageMembers ||
            (memberSettingsQuery.data?.disableInvite ?? false)
          }
          wsId={workspace.id}
        />
        <StandardWorkspaceAccessPage
          disableInvite={memberSettingsQuery.data?.disableInvite ?? false}
          initialContext={{
            canManageMembers,
            canManageRoles: permissions?.manage_workspace_roles ?? false,
            currentUserEmail: user?.email ?? null,
            workspaceId: workspace.id,
          }}
          initialTab="people"
        />
      </div>
    );
  }

  const billingUrl = `https://pay.tuturuuu.com/${workspace.id}/billing`;
  return (
    <div className="space-y-4">
      <PanelIntro description={t('billing_description')} title={t('billing')} />
      <div className="relative overflow-hidden rounded-2xl border bg-card/40 p-5">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
          <div className="rounded-2xl border border-dynamic-purple/20 bg-dynamic-purple/10 p-3 text-dynamic-purple">
            <CreditCard />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold">{t('billing_manage')}</h3>
            <p className="mt-1 text-muted-foreground text-sm">
              {t('billing_manage_description')}
            </p>
          </div>
          {permissions?.manage_subscription ? (
            <Button asChild>
              <a href={billingUrl}>{t('billing_open')}</a>
            </Button>
          ) : (
            <Button disabled>{t('billing_open')}</Button>
          )}
        </div>
      </div>
    </div>
  );
}

function PanelIntro({
  description,
  title,
}: {
  description: string;
  title: string;
}) {
  return (
    <div className="rounded-2xl border bg-linear-to-br from-primary/[0.06] to-transparent p-5">
      <h2 className="font-semibold text-xl">{title}</h2>
      <p className="mt-1 text-muted-foreground text-sm">{description}</p>
    </div>
  );
}

function RestrictedNotice() {
  const t = useTranslations('satellite-workspace-settings');
  return (
    <div className="flex gap-3 rounded-xl border border-dynamic-orange/20 bg-dynamic-orange/10 p-4 text-sm">
      <AlertTriangle className="shrink-0 text-dynamic-orange" />
      <div>
        <p className="font-medium">{t('read_only')}</p>
        <p className="text-muted-foreground">{t('read_only_description')}</p>
      </div>
    </div>
  );
}

function PanelLoading({ label }: { label: string }) {
  return (
    <div className="flex min-h-48 items-center justify-center gap-2 text-muted-foreground">
      <Loader2 className="animate-spin" />
      {label}
    </div>
  );
}

function PanelError({
  description,
  title,
}: {
  description: string;
  title: string;
}) {
  return (
    <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-5">
      <div className="flex gap-3">
        <AlertTriangle className="text-destructive" />
        <div>
          <p className="font-semibold">{title}</p>
          <p className="text-muted-foreground text-sm">{description}</p>
        </div>
      </div>
    </div>
  );
}
