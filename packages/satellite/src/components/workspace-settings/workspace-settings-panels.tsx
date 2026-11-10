'use client';

import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  ExternalLink,
  Loader2,
  RefreshCw,
} from '@tuturuuu/icons';
import {
  getWorkspace,
  getWorkspaceAiCreditStatus,
  getWorkspaceMemberSettings,
  getWorkspacePermissionsSummary,
} from '@tuturuuu/internal-api';
import type { Workspace } from '@tuturuuu/types';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import { Button } from '@tuturuuu/ui/button';
import { SettingItemTab } from '@tuturuuu/ui/custom/settings-item-tab';
import { SettingsSection } from '@tuturuuu/ui/custom/settings-section';
import { StandardWorkspaceAccessPage } from '@tuturuuu/ui/custom/workspace-access';
import { HiddenWorkspacesSettings } from '@tuturuuu/ui/custom/workspace-select';
import { Progress } from '@tuturuuu/ui/progress';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import { useTranslations } from 'next-intl';
import { GuestSelfJoinSetting } from './guest-self-join-setting';
import { InviteLinksSection } from './invite-links-section';
import { PlanName } from './plan-name';
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
      const summary = await getWorkspacePermissionsSummary(workspace?.id ?? '');

      return {
        ...summary,
        manage_workspace_roles:
          'manage_workspace_roles' in summary &&
          summary.manage_workspace_roles === true,
      };
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
  const aiCreditsQuery = useQuery({
    enabled: Boolean(workspace?.id && activeTab === 'workspace_billing'),
    queryFn: () => getWorkspaceAiCreditStatus(workspace?.id ?? ''),
    queryKey: ['workspace-ai-credit-status', workspace?.id],
    staleTime: 30_000,
  });

  if (!activeTab.startsWith('workspace_')) return null;
  if ((!workspace && workspaceQuery.isPending) || permissionsQuery.isPending) {
    return (
      <div className="space-y-8">
        {activeTab === 'workspace_general' && <HiddenWorkspacesSettings />}
        <PanelLoading label={t('loading')} />
      </div>
    );
  }
  if (!workspace || workspaceQuery.isError || permissionsQuery.isError) {
    return (
      <div className="space-y-8">
        {activeTab === 'workspace_general' && <HiddenWorkspacesSettings />}
        <PanelError
          description={t('load_error_description')}
          title={t('load_error')}
        />
      </div>
    );
  }

  const permissions = permissionsQuery.data;
  const canManageMembers = permissions?.manage_workspace_members ?? false;

  if (activeTab === 'workspace_general') {
    return (
      <div className="space-y-8">
        <HiddenWorkspacesSettings />
        {!permissions?.manage_workspace_settings && <RestrictedNotice />}
        <SettingsSection>
          <WorkspaceAvatarEditor
            canEdit={permissions?.manage_workspace_settings ?? false}
            workspace={workspace}
          />
          <WorkspaceIdentityForm
            canEdit={permissions?.manage_workspace_settings ?? false}
            workspace={workspace}
          />
        </SettingsSection>
      </div>
    );
  }

  if (activeTab === 'workspace_members') {
    const invitationsDisabled =
      workspace.personal || (memberSettingsQuery.data?.disableInvite ?? false);

    return (
      <div className="space-y-8">
        {!canManageMembers && !permissions?.manage_workspace_roles && (
          <RestrictedNotice />
        )}
        <SettingsSection>
          <GuestSelfJoinSetting
            disabled={workspace.personal || !canManageMembers}
            wsId={workspace.id}
          />
        </SettingsSection>
        {!workspace.personal ? (
          <InviteLinksSection
            disabled={!canManageMembers || invitationsDisabled}
            wsId={workspace.id}
          />
        ) : null}
        <StandardWorkspaceAccessPage
          disableInvite={invitationsDisabled}
          initialContext={{
            canManageMembers,
            canManageRoles: permissions?.manage_workspace_roles ?? false,
            currentUserEmail: user?.email ?? null,
            workspaceId: workspace.id,
          }}
          initialTab="people"
          showHeader={false}
        />
      </div>
    );
  }

  const billingUrl = `https://pay.tuturuuu.com/${workspace.id}/billing`;
  const creditStatus = aiCreditsQuery.data;
  return (
    <div className="space-y-8">
      <SettingsSection>
        <SettingItemTab
          description={t('billing_plan_description')}
          title={t('billing_current_plan')}
        >
          {aiCreditsQuery.isPending ? (
            <Skeleton className="h-6 w-28" />
          ) : creditStatus ? (
            <PlanName tier={creditStatus.tier} />
          ) : (
            <BillingMetricError onRetry={() => aiCreditsQuery.refetch()} />
          )}
        </SettingItemTab>

        <SettingItemTab
          layout="stacked"
          description={t('billing_ai_credits_description')}
          title={t('billing_ai_credits')}
        >
          {aiCreditsQuery.isPending ? (
            <div className="space-y-3">
              <Skeleton className="h-6 w-36" />
              <Skeleton className="h-2 w-full" />
            </div>
          ) : creditStatus ? (
            <div className="space-y-3">
              <div className="flex items-end justify-between gap-3">
                <p className="font-semibold text-base tabular-nums">
                  {formatCredits(creditStatus.remaining)}
                </p>
                <p className="text-muted-foreground text-sm">
                  {t('billing_credits_used', {
                    used: formatCredits(creditStatus.totalUsed),
                  })}
                </p>
              </div>
              <Progress
                aria-label={t('billing_credit_usage')}
                className="h-2"
                value={Math.min(100, Math.max(0, creditStatus.percentUsed))}
              />
              <p className="text-muted-foreground text-sm">
                {t('billing_credits_remaining')}
              </p>
            </div>
          ) : (
            <BillingMetricError onRetry={() => aiCreditsQuery.refetch()} />
          )}
        </SettingItemTab>
      </SettingsSection>

      <SettingsSection>
        <SettingItemTab
          description={t('billing_manage_description')}
          title={t('billing_manage')}
        >
          {permissions?.can_access_billing ? (
            <Button asChild>
              <a href={billingUrl} rel="noopener noreferrer" target="_blank">
                {t('billing_open_pay')}
                <ExternalLink className="ml-2 size-4" />
              </a>
            </Button>
          ) : (
            <Button disabled>
              {t('billing_open_pay')}
              <ExternalLink className="ml-2 size-4" />
            </Button>
          )}
        </SettingItemTab>
      </SettingsSection>
    </div>
  );
}

function BillingMetricError({ onRetry }: { onRetry: () => void }) {
  const t = useTranslations('satellite-workspace-settings');
  return (
    <div className="flex items-center justify-between gap-3">
      <p className="text-muted-foreground text-sm">
        {t('billing_overview_unavailable')}
      </p>
      <Button onClick={onRetry} size="sm" type="button" variant="ghost">
        <RefreshCw className="mr-1.5 size-3.5" />
        {t('billing_retry')}
      </Button>
    </div>
  );
}

function formatCredits(value: number) {
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 0,
    notation: value >= 1_000_000 ? 'compact' : 'standard',
  }).format(value);
}

function RestrictedNotice() {
  const t = useTranslations('satellite-workspace-settings');
  return (
    <SettingItemTab
      layout="stacked"
      description={t('read_only_description')}
      icon={<AlertTriangle className="size-4 text-dynamic-yellow" />}
      title={t('read_only')}
    />
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
    <SettingItemTab
      layout="stacked"
      description={description}
      icon={<AlertTriangle className="size-4 text-destructive" />}
      title={title}
    />
  );
}
