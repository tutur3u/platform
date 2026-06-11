'use client';

import type { DatabaseLinkStatus } from '@/lib/users-database-filters';
import Filters from './filters';
import type { GroupMembershipFilter } from './group-membership';
import { QuickGroupFilters } from './quick-group-filters';
import type {
  UsersDatabaseRequireAttention,
  UsersDatabaseStatus,
} from './resolved-filters';
import { UsersPrimaryFiltersDropdown } from './users-primary-filters-dropdown';

interface UsersFilterPanelProps {
  wsId: string;
  status: UsersDatabaseStatus;
  linkStatus: DatabaseLinkStatus;
  requireAttention: UsersDatabaseRequireAttention;
  groupMembership: GroupMembershipFilter;
  defaultLinkStatus: DatabaseLinkStatus;
  defaultGroupMembership: GroupMembershipFilter;
  includedGroups: string[];
  excludedGroups: string[] | null;
  effectiveIncludedGroups: string[];
  effectiveExcludedGroups: string[];
  initialFeaturedGroupIds?: string[];
  onStatusChange: (value: UsersDatabaseStatus) => void;
  onLinkStatusChange: (value: DatabaseLinkStatus) => void;
  onRequireAttentionChange: (value: UsersDatabaseRequireAttention) => void;
  onGroupMembershipChange: (value: GroupMembershipFilter) => void;
  onIncludedGroupsChange: (value: string[]) => Promise<void> | void;
  onExcludedGroupsChange: (value: string[]) => Promise<void> | void;
}

export function UsersFilterPanel({
  wsId,
  status,
  linkStatus,
  requireAttention,
  groupMembership,
  defaultLinkStatus,
  defaultGroupMembership,
  includedGroups,
  excludedGroups,
  effectiveIncludedGroups,
  effectiveExcludedGroups,
  initialFeaturedGroupIds = [],
  onStatusChange,
  onLinkStatusChange,
  onRequireAttentionChange,
  onGroupMembershipChange,
  onIncludedGroupsChange,
  onExcludedGroupsChange,
}: UsersFilterPanelProps) {
  return (
    <section className="col-span-full flex w-full flex-wrap items-center gap-2 rounded-lg border border-border/60 bg-background/80 p-2 shadow-sm">
      <UsersPrimaryFiltersDropdown
        wsId={wsId}
        status={status}
        linkStatus={linkStatus}
        requireAttention={requireAttention}
        groupMembership={groupMembership}
        defaultLinkStatus={defaultLinkStatus}
        defaultGroupMembership={defaultGroupMembership}
        onStatusChange={onStatusChange}
        onLinkStatusChange={onLinkStatusChange}
        onRequireAttentionChange={onRequireAttentionChange}
        onGroupMembershipChange={onGroupMembershipChange}
      />
      <QuickGroupFilters
        wsId={wsId}
        initialFeaturedGroupIds={initialFeaturedGroupIds}
        includedGroups={includedGroups}
        effectiveIncludedGroups={effectiveIncludedGroups}
        excludedGroups={excludedGroups}
        effectiveExcludedGroups={effectiveExcludedGroups}
        groupMembership={groupMembership}
        linkStatus={linkStatus}
        onIncludedGroupsChange={onIncludedGroupsChange}
      />
      <Filters
        wsId={wsId}
        includedGroups={includedGroups}
        excludedGroups={excludedGroups}
        effectiveIncludedGroups={effectiveIncludedGroups}
        effectiveExcludedGroups={effectiveExcludedGroups}
        onIncludedGroupsChange={onIncludedGroupsChange}
        onExcludedGroupsChange={onExcludedGroupsChange}
        className="contents"
      />
    </section>
  );
}
