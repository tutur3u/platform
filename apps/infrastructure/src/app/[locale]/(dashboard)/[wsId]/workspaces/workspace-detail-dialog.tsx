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
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
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
      <DialogContent className="flex h-[calc(100vh-1.5rem)] max-h-[calc(100vh-1.5rem)] w-[calc(100vw-1.5rem)] max-w-none flex-col overflow-hidden rounded-2xl border-border/80 bg-background/98 p-0 sm:max-w-[calc(100vw-1.5rem)]">
        <Tabs defaultValue="overview" className="flex min-h-0 flex-1 flex-col">
          <div className="border-border/80 border-b bg-background/95">
            <DialogHeader className="gap-5 px-8 pt-7 pb-5">
              <div className="flex flex-col gap-6 2xl:flex-row 2xl:items-start 2xl:justify-between">
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <DialogTitle className="flex items-center gap-3 text-2xl">
                      {workspace.personal ? (
                        <User className="h-6 w-6" />
                      ) : (
                        <Building2 className="h-6 w-6" />
                      )}
                      {workspace.name || '—'}
                    </DialogTitle>
                    <Badge
                      variant={workspace.personal ? 'secondary' : 'outline'}
                    >
                      {workspace.personal ? t('personal') : t('team')}
                    </Badge>
                    {workspace.highest_tier ? (
                      <TierBadge tier={workspace.highest_tier} />
                    ) : (
                      <Badge variant="outline">{t('no_subscription')}</Badge>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <MetaPill label={t('col_creator_email')}>
                      <span className="font-mono text-xs">
                        {workspace.creator_email || '—'}
                      </span>
                    </MetaPill>
                    <MetaPill label={t('col_created_at')}>
                      {moment(workspace.created_at).format(
                        'MMM DD, YYYY HH:mm'
                      )}
                    </MetaPill>
                    <MetaPill label={t('id')}>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs">
                          {workspace.id}
                        </span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 shrink-0"
                          onClick={copyId}
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </MetaPill>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-3 2xl:min-w-[460px]">
                  <HeroMetric
                    icon={<Users className="h-4 w-4 text-dynamic-blue" />}
                    label={t('col_members')}
                    value={workspace.member_count}
                  />
                  <HeroMetric
                    icon={<Shield className="h-4 w-4 text-dynamic-green" />}
                    label={t('col_roles')}
                    value={workspace.role_count}
                  />
                  <HeroMetric
                    icon={<Key className="h-4 w-4 text-dynamic-orange" />}
                    label={t('col_secrets')}
                    value={workspace.secret_count}
                  />
                </div>
              </div>
            </DialogHeader>

            <TabsList className="mx-8 mb-5 grid h-12 w-[min(100%,640px)] grid-cols-3 rounded-2xl bg-foreground/10 p-1">
              <TabsTrigger value="overview">
                {t('detail_tab_overview')}
              </TabsTrigger>
              <TabsTrigger value="secrets">
                {t('detail_tab_secrets')}
              </TabsTrigger>
              <TabsTrigger value="rate-limits">
                {t('detail_tab_rate_limits')}
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent
            value="overview"
            className="mt-0 min-h-0 flex-1 overflow-y-auto px-8 py-6"
          >
            <div className="space-y-5">
              <div className="grid gap-5 xl:grid-cols-[1.25fr_0.95fr]">
                <Card className="border-border/80 bg-background/80">
                  <CardHeader>
                    <CardTitle>{t('detail_info')}</CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
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
                      <span className="break-all font-mono text-xs">
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
                      <span className="break-all font-mono text-xs">
                        {workspace.id}
                      </span>
                    </OverviewItem>
                  </CardContent>
                </Card>

                <Card className="border-border/80 bg-background/80">
                  <CardHeader>
                    <CardTitle>{t('detail_subscription')}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <DetailRow label={t('col_plan')}>
                      {workspace.highest_tier ? (
                        <TierBadge tier={workspace.highest_tier} />
                      ) : (
                        <span className="text-muted-foreground">
                          {t('no_subscription')}
                        </span>
                      )}
                    </DetailRow>
                    <DetailRow label={t('col_status')}>
                      <div className="flex flex-wrap justify-end gap-2">
                        {workspace.subscription_statuses.length > 0 ? (
                          workspace.subscription_statuses.map((status) => (
                            <Badge
                              key={status}
                              variant="outline"
                              className="text-xs"
                            >
                              {status.replace('_', ' ')}
                            </Badge>
                          ))
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </div>
                    </DetailRow>
                    <DetailRow label={t('col_active_subs')}>
                      <span className="font-semibold text-lg">
                        {workspace.active_subscription_count}
                      </span>
                    </DetailRow>

                    {workspace.active_subscription_count > 1 && (
                      <div className="flex items-start gap-2 rounded-xl border border-dynamic-yellow/30 bg-dynamic-yellow/10 px-3 py-2 text-dynamic-yellow text-sm">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                        <span>{t('multi_sub_warning')}</span>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              <Card className="border-border/80 bg-background/80">
                <CardHeader>
                  <CardTitle>{t('detail_counts')}</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4 md:grid-cols-3">
                  <CountCard
                    icon={<Users className="h-5 w-5 text-dynamic-blue" />}
                    label={t('col_members')}
                    value={workspace.member_count}
                  />
                  <CountCard
                    icon={<Shield className="h-5 w-5 text-dynamic-green" />}
                    label={t('col_roles')}
                    value={workspace.role_count}
                  />
                  <CountCard
                    icon={<Key className="h-5 w-5 text-dynamic-orange" />}
                    label={t('col_secrets')}
                    value={workspace.secret_count}
                  />
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent
            value="secrets"
            className="mt-0 min-h-0 flex-1 overflow-y-auto px-8 py-6"
          >
            <WorkspaceSecretsManager workspaceId={workspace.id} />
          </TabsContent>

          <TabsContent
            value="rate-limits"
            className="mt-0 min-h-0 flex-1 overflow-y-auto px-8 py-6"
          >
            <WorkspaceRateLimitsPanel workspaceId={workspace.id} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function MetaPill({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div className="rounded-full border border-border/80 bg-foreground/5 px-3 py-2">
      <div className="mb-1 text-[10px] text-muted-foreground uppercase tracking-[0.18em]">
        {label}
      </div>
      <div className="text-sm">{children}</div>
    </div>
  );
}

function HeroMetric({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-2xl border border-border/80 bg-foreground/5 px-4 py-4">
      <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-[0.18em]">
        {icon}
        <span>{label}</span>
      </div>
      <div className="mt-3 font-semibold text-3xl">{value}</div>
    </div>
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
    <div className="rounded-xl border border-border/80 bg-foreground/5 p-4">
      <div className="text-[11px] text-muted-foreground uppercase tracking-[0.18em]">
        {label}
      </div>
      <div className="mt-3 min-h-8 text-sm">{children}</div>
    </div>
  );
}

function DetailRow({
  children,
  label,
}: {
  children: ReactNode;
  label: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-xl border border-border/80 bg-foreground/5 px-4 py-3">
      <span className="text-muted-foreground text-sm">{label}</span>
      <div className="text-right text-sm">{children}</div>
    </div>
  );
}

function TierBadge({ tier }: { tier: string }) {
  const config: Record<string, string> = {
    ENTERPRISE:
      'border-dynamic-purple/30 bg-dynamic-purple/10 text-dynamic-purple',
    FREE: 'border-border bg-secondary text-secondary-foreground',
    PLUS: 'border-dynamic-cyan/30 bg-dynamic-cyan/10 text-dynamic-cyan',
    PRO: 'border-dynamic-blue/30 bg-dynamic-blue/10 text-dynamic-blue',
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
    <div className="rounded-2xl border border-border/80 bg-foreground/5 p-5">
      <div className="flex items-center gap-2 text-sm">
        {icon}
        <span className="text-muted-foreground">{label}</span>
      </div>
      <div className="mt-4 font-semibold text-3xl">{value}</div>
    </div>
  );
}
