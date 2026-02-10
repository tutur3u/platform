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
import { Separator } from '@tuturuuu/ui/separator';
import { toast } from '@tuturuuu/ui/sonner';
import moment from 'moment';
import { useTranslations } from 'next-intl';

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
    toast.success('Copied workspace ID');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {workspace.personal ? (
              <User className="h-5 w-5" />
            ) : (
              <Building2 className="h-5 w-5" />
            )}
            {workspace.name || '—'}
          </DialogTitle>
        </DialogHeader>

        {/* Info Section */}
        <div>
          <h4 className="mb-2 font-medium text-sm">{t('detail_info')}</h4>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Handle</span>
              {workspace.handle ? (
                <span className="font-medium text-dynamic-purple">
                  @{workspace.handle}
                </span>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('col_type')}</span>
              <Badge variant={workspace.personal ? 'secondary' : 'outline'}>
                {workspace.personal ? t('personal') : t('team')}
              </Badge>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">
                {t('col_creator_name')}
              </span>
              <span>{workspace.creator_name || '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">
                {t('col_creator_email')}
              </span>
              <span className="font-mono text-xs">
                {workspace.creator_email || '—'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">
                {t('col_created_at')}
              </span>
              <span>
                {moment(workspace.created_at).format('MMM DD, YYYY HH:mm')}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">ID</span>
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
            </div>
          </div>
        </div>

        <Separator />

        {/* Subscription Section */}
        <div>
          <h4 className="mb-2 font-medium text-sm">
            {t('detail_subscription')}
          </h4>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('col_plan')}</span>
              {workspace.highest_tier ? (
                <TierBadge tier={workspace.highest_tier} />
              ) : (
                <span className="text-muted-foreground">
                  {t('no_subscription')}
                </span>
              )}
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">{t('col_status')}</span>
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

        <Separator />

        {/* Counts Grid */}
        <div>
          <h4 className="mb-2 font-medium text-sm">{t('detail_counts')}</h4>
          <div className="grid grid-cols-3 gap-3">
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
      </DialogContent>
    </Dialog>
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
  icon: React.ReactNode;
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
