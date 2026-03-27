'use client';

import {
  Activity,
  Archive,
  Clock,
  Layers,
  Link,
  Link2Off,
  ShieldAlert,
  Users,
} from '@tuturuuu/icons';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { useUserStatusLabels } from '@/hooks/use-user-status-labels';
import Filters from './filters';
import type { GroupMembershipFilter } from './group-membership';
import { GroupMembershipFilterControl } from './group-membership-filter';
import { QuickGroupFilters } from './quick-group-filters';

interface UsersFilterPanelProps {
  wsId: string;
  status: 'active' | 'archived' | 'archived_until' | 'all';
  linkStatus: 'all' | 'linked' | 'virtual';
  requireAttention: 'all' | 'true' | 'false';
  groupMembership: GroupMembershipFilter;
  effectiveExcludedGroups: string[];
  initialFeaturedGroupIds?: string[];
  onStatusChange: (
    value: 'active' | 'archived' | 'archived_until' | 'all'
  ) => void;
  onLinkStatusChange: (value: 'all' | 'linked' | 'virtual') => void;
  onRequireAttentionChange: (value: 'all' | 'true' | 'false') => void;
  onGroupMembershipChange: (value: GroupMembershipFilter) => void;
}

export function UsersFilterPanel({
  wsId,
  status,
  linkStatus,
  requireAttention,
  groupMembership,
  effectiveExcludedGroups,
  initialFeaturedGroupIds = [],
  onStatusChange,
  onLinkStatusChange,
  onRequireAttentionChange,
  onGroupMembershipChange,
}: UsersFilterPanelProps) {
  const t = useTranslations('ws-users');
  const userStatusLabels = useUserStatusLabels(wsId);

  return (
    <section className="flex w-full flex-col gap-2 rounded-[24px] border border-border/60 bg-gradient-to-r from-background via-background to-muted/25 p-3 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <QuickGroupFilters
          wsId={wsId}
          initialFeaturedGroupIds={initialFeaturedGroupIds}
          effectiveExcludedGroups={effectiveExcludedGroups}
          groupMembership={groupMembership}
        />
      </div>

      <div className="flex flex-wrap items-stretch gap-2">
        <GroupMembershipFilterControl
          value={groupMembership}
          onChange={onGroupMembershipChange}
        />

        <FilterSelectCard label={t('status_filter')}>
          <Select value={status} onValueChange={onStatusChange}>
            <SelectTrigger className="h-9 w-full border-border/60 bg-background/80">
              <SelectValue placeholder={t('status_filter')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">
                <div className="flex items-center gap-2">
                  <Activity className="h-4 w-4" />
                  <span>{t('status_active')}</span>
                </div>
              </SelectItem>
              <SelectItem value="archived">
                <div className="flex items-center gap-2">
                  <Archive className="h-4 w-4" />
                  <span>{userStatusLabels.archived}</span>
                </div>
              </SelectItem>
              <SelectItem value="archived_until">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  <span>{userStatusLabels.archived_until}</span>
                </div>
              </SelectItem>
              <SelectItem value="all">
                <div className="flex items-center gap-2">
                  <Layers className="h-4 w-4" />
                  <span>{t('status_all')}</span>
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
        </FilterSelectCard>

        <FilterSelectCard label={t('link_status_filter')}>
          <Select value={linkStatus} onValueChange={onLinkStatusChange}>
            <SelectTrigger className="h-9 w-full border-border/60 bg-background/80">
              <SelectValue placeholder={t('link_status_filter')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  <span>{t('link_status_all')}</span>
                </div>
              </SelectItem>
              <SelectItem value="linked">
                <div className="flex items-center gap-2">
                  <Link className="h-4 w-4" />
                  <span>{t('link_status_linked')}</span>
                </div>
              </SelectItem>
              <SelectItem value="virtual">
                <div className="flex items-center gap-2">
                  <Link2Off className="h-4 w-4" />
                  <span>{t('link_status_virtual')}</span>
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
        </FilterSelectCard>

        <FilterSelectCard label={t('attention_filter')}>
          <Select
            value={requireAttention}
            onValueChange={onRequireAttentionChange}
          >
            <SelectTrigger className="h-9 w-full border-border/60 bg-background/80">
              <SelectValue placeholder={t('attention_filter')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  <span>{t('attention_all')}</span>
                </div>
              </SelectItem>
              <SelectItem value="true">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="h-4 w-4" />
                  <span>{t('attention_only')}</span>
                </div>
              </SelectItem>
              <SelectItem value="false">
                <div className="flex items-center gap-2">
                  <Link2Off className="h-4 w-4" />
                  <span>{t('attention_none')}</span>
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
        </FilterSelectCard>

        <Filters
          wsId={wsId}
          effectiveExcludedGroups={effectiveExcludedGroups}
        />
      </div>
    </section>
  );
}

function FilterSelectCard({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-w-[11rem] flex-col gap-1.5 rounded-2xl border border-border/60 bg-background/70 px-3 py-2.5 shadow-sm">
      <div className="text-[11px] text-muted-foreground uppercase tracking-[0.08em]">
        {label}
      </div>
      {children}
    </div>
  );
}
