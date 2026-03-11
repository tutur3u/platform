'use client';

import {
  AlertTriangle,
  Building2,
  Copy,
  Key,
  Shield,
  User,
  Users,
} from '@tuturuuu/icons';
import type { WorkspaceOverviewRow } from '@tuturuuu/types';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { toast } from '@tuturuuu/ui/sonner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import moment from 'moment';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { WorkspaceRateLimitsPanel } from './workspace-rate-limits-panel';
import { WorkspaceSecretsManager } from './workspace-secrets-manager';

interface Props {
  workspace: WorkspaceOverviewRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function WorkspaceDetailDialog({
  workspace,
  open,
  onOpenChange,
}: Props) {
  const t = useTranslations('ws-overview');

  if (!workspace) return null;

  const copyId = () => {
    navigator.clipboard.writeText(workspace.id);
    toast.success(t('copied_workspace_id'));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[96vh] w-[98vw] max-w-[1680px] flex-col overflow-hidden p-0">
        <DialogHeader className="border-border/80 border-b bg-background/95 px-6 pt-6 pb-4">
          <DialogTitle className="flex items-center gap-2">
            {workspace.personal ? (
              <User className="h-5 w-5" />
            ) : (
              <Building2 className="h-5 w-5" />
            )}
            {workspace.name || '—'}
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="overview" className="flex min-h-0 flex-1 flex-col">
          <TabsList className="mx-6 mt-4 grid h-auto w-auto shrink-0 grid-cols-3 rounded-xl bg-foreground/10 p-1">
            <TabsTrigger value="overview">
              {t('detail_tab_overview')}
            </TabsTrigger>
            <TabsTrigger value="secrets">{t('detail_tab_secrets')}</TabsTrigger>
            <TabsTrigger value="rate-limits">
              {t('detail_tab_rate_limits')}
            </TabsTrigger>
          </TabsList>

          <TabsContent
            value="overview"
            className="mt-0 min-h-0 flex-1 overflow-y-auto px-6 pt-4 pb-6"
          >
            <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
              <div className="rounded-xl border border-border/80 bg-background/80 p-5">
                <h4 className="mb-4 font-medium text-sm">{t('detail_info')}</h4>
                <div className="grid gap-4 md:grid-cols-2">
                  <OverviewItem label={t('handle')}>
                    {workspace.handle ? (
                      <span className="font-medium text-dynamic-purple">
                        @{workspace.handle}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </OverviewItem>
                  <OverviewItem label={t('col_type')}>
                    <Badge
                      variant={workspace.personal ? 'secondary' : 'outline'}
                    >
                      {workspace.personal ? t('personal') : t('team')}
                    </Badge>
                  </OverviewItem>
                  <OverviewItem label={t('col_creator_name')}>
                    <span>{workspace.creator_name || '—'}</span>
                  </OverviewItem>
                  <OverviewItem label={t('col_creator_email')}>
                    <span className="font-mono text-xs">
                      {workspace.creator_email || '—'}
                    </span>
                  </OverviewItem>
                  <OverviewItem label={t('col_created_at')}>
                    <span>
                      {moment(workspace.created_at).format(
                        'MMM DD, YYYY HH:mm'
                      )}
                    </span>
                  </OverviewItem>
                  <OverviewItem label={t('id')}>
                    <div className="flex items-center gap-1">
                      <span className="font-mono text-xs">
                        {workspace.id.slice(0, 8)}...
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={copyId}
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                  </OverviewItem>
                </div>
              </div>

              <div className="rounded-xl border border-border/80 bg-background/80 p-5">
                <h4 className="mb-4 font-medium text-sm">
                  {t('detail_subscription')}
                </h4>
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">
                      {t('col_plan')}
                    </span>
                    {workspace.highest_tier ? (
                      <TierBadge tier={workspace.highest_tier} />
                    ) : (
                      <span className="text-muted-foreground">
                        {t('no_subscription')}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-muted-foreground">
                      {t('col_status')}
                    </span>
                    <div className="flex flex-wrap justify-end gap-1">
                      {workspace.subscription_statuses.length > 0 ? (
                        workspace.subscription_statuses.map((s) => (
                          <Badge key={s} variant="outline" className="text-xs">
                            {s.replace('_', ' ')}
                          </Badge>
                        ))
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </div>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">
                      {t('col_active_subs')}
                    </span>
                    <span>{workspace.active_subscription_count}</span>
                  </div>
                  {workspace.active_subscription_count > 1 && (
                    <div className="flex items-center gap-1.5 rounded-md bg-dynamic-yellow/10 p-2 text-dynamic-yellow text-xs">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                      {t('multi_sub_warning')}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-border/80 bg-background/80 p-5">
              <h4 className="mb-4 font-medium text-sm">{t('detail_counts')}</h4>
              <div className="grid gap-3 sm:grid-cols-3">
                <CountCard
                  icon={<Users className="h-4 w-4 text-dynamic-blue" />}
                  label={t('col_members')}
                  value={workspace.member_count}
                />
                <CountCard
                  icon={<Shield className="h-4 w-4 text-dynamic-green" />}
                  label={t('col_roles')}
                  value={workspace.role_count}
                />
                <CountCard
                  icon={<Key className="h-4 w-4 text-dynamic-orange" />}
                  label={t('col_secrets')}
                  value={workspace.secret_count}
                />
              </div>
            </div>
          </TabsContent>

          <TabsContent
            value="secrets"
            className="mt-0 min-h-0 flex-1 overflow-y-auto px-6 pt-4 pb-6"
          >
            <WorkspaceSecretsManager workspaceId={workspace.id} />
          </TabsContent>

          <TabsContent
            value="rate-limits"
            className="mt-0 min-h-0 flex-1 overflow-y-auto px-6 pt-4 pb-6"
          >
            <WorkspaceRateLimitsPanel workspaceId={workspace.id} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function OverviewItem({
  children,
  label,
}: {
  children: ReactNode;
  label: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-foreground/5 p-3">
      <div className="text-muted-foreground text-xs uppercase tracking-[0.18em]">
        {label}
      </div>
      <div className="mt-2">{children}</div>
    </div>
  );
}

function TierBadge({ tier }: { tier: string }) {
  const config: Record<string, string> = {
    ENTERPRISE:
      'bg-dynamic-purple/10 text-dynamic-purple border-dynamic-purple/30',
    PRO: 'bg-dynamic-blue/10 text-dynamic-blue border-dynamic-blue/30',
    PLUS: 'bg-dynamic-cyan/10 text-dynamic-cyan border-dynamic-cyan/30',
    FREE: 'bg-secondary text-secondary-foreground border-border',
  };
  return (
    <Badge variant="outline" className={config[tier] || ''}>
      {tier}
    </Badge>
  );
}

function CountCard({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: number;
}) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-lg border border-border p-3">
      {icon}
      <span className="font-bold text-lg">{value}</span>
      <span className="text-muted-foreground text-xs">{label}</span>
    </div>
  );
}
