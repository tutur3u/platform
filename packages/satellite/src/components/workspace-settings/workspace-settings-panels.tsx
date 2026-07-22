'use client';

import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  Coins,
  CreditCard,
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
import { StandardWorkspaceAccessPage } from '@tuturuuu/ui/custom/workspace-access';
import { Progress } from '@tuturuuu/ui/progress';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import { useTranslations } from 'next-intl';
import type { ComponentType, ReactNode } from 'react';
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
    const invitationsDisabled =
      workspace.personal || (memberSettingsQuery.data?.disableInvite ?? false);

    return (
      <div className="space-y-4">
        {!canManageMembers && !permissions?.manage_workspace_roles && (
          <RestrictedNotice />
        )}
        <GuestSelfJoinSetting
          disabled={workspace.personal || !canManageMembers}
          wsId={workspace.id}
        />
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
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <BillingMetricCard
          description={t('billing_plan_description')}
          icon={CreditCard}
          label={t('billing_current_plan')}
          tone="purple"
        >
          {aiCreditsQuery.isPending ? (
            <Skeleton className="h-8 w-28" />
          ) : creditStatus ? (
            <div className="flex items-center gap-2">
              <span className="font-semibold text-2xl">
                {t(getPlanTranslationKey(creditStatus.tier))}
              </span>
              <span className="rounded-full border bg-muted/60 px-2 py-0.5 font-medium text-muted-foreground text-xs">
                {creditStatus.tier}
              </span>
            </div>
          ) : (
            <BillingMetricError onRetry={() => aiCreditsQuery.refetch()} />
          )}
        </BillingMetricCard>

        <BillingMetricCard
          description={t('billing_ai_credits_description')}
          icon={Coins}
          label={t('billing_ai_credits')}
          tone="blue"
        >
          {aiCreditsQuery.isPending ? (
            <div className="space-y-3">
              <Skeleton className="h-8 w-36" />
              <Skeleton className="h-2 w-full" />
            </div>
          ) : creditStatus ? (
            <div className="space-y-3">
              <div className="flex items-end justify-between gap-3">
                <p className="font-semibold text-2xl tabular-nums">
                  {formatCredits(creditStatus.remaining)}
                </p>
                <p className="text-muted-foreground text-xs">
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
              <p className="text-muted-foreground text-xs">
                {t('billing_credits_remaining')}
              </p>
            </div>
          ) : (
            <BillingMetricError onRetry={() => aiCreditsQuery.refetch()} />
          )}
        </BillingMetricCard>
      </div>

      <div className="relative overflow-hidden rounded-2xl border bg-card/40 p-5">
        <div className="absolute inset-y-0 right-0 w-1/3 bg-linear-to-l from-dynamic-purple/10 to-transparent" />
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center">
          <div className="rounded-2xl border border-dynamic-purple/20 bg-dynamic-purple/10 p-3 text-dynamic-purple">
            <CreditCard className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold">{t('billing_manage')}</h3>
            <p className="mt-1 text-muted-foreground text-sm">
              {t('billing_manage_description')}
            </p>
          </div>
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
        </div>
      </div>
    </div>
  );
}

function BillingMetricCard({
  children,
  description,
  icon: Icon,
  label,
  tone,
}: {
  children: ReactNode;
  description: string;
  icon: ComponentType<{ className?: string }>;
  label: string;
  tone: 'blue' | 'purple';
}) {
  const toneClass =
    tone === 'blue'
      ? 'border-dynamic-blue/20 bg-dynamic-blue/10 text-dynamic-blue'
      : 'border-dynamic-purple/20 bg-dynamic-purple/10 text-dynamic-purple';

  return (
    <div className="rounded-2xl border bg-card/40 p-5">
      <div className="mb-4 flex items-start gap-3">
        <div className={`rounded-xl border p-2.5 ${toneClass}`}>
          <Icon className="size-4" />
        </div>
        <div className="min-w-0">
          <p className="font-medium">{label}</p>
          <p className="text-muted-foreground text-xs">{description}</p>
        </div>
      </div>
      {children}
    </div>
  );
}

function BillingMetricError({ onRetry }: { onRetry: () => void }) {
  const t = useTranslations('satellite-workspace-settings');
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-dashed p-3">
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

function getPlanTranslationKey(tier: 'FREE' | 'PLUS' | 'PRO' | 'ENTERPRISE') {
  const keys = {
    ENTERPRISE: 'billing_plan_enterprise',
    FREE: 'billing_plan_free',
    PLUS: 'billing_plan_plus',
    PRO: 'billing_plan_pro',
  } as const;

  return keys[tier];
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
