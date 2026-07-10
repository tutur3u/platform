'use client';

import { cn } from '@tuturuuu/utils/format';
import { GroupFilter } from './group-filter';

interface Props {
  wsId: string;
  noInclude?: boolean;
  noExclude?: boolean;
  includedGroups?: string[];
  excludedGroups?: string[] | null;
  effectiveIncludedGroups?: string[];
  effectiveExcludedGroups?: string[];
  onIncludedGroupsChange?: (value: string[]) => Promise<void> | void;
  onExcludedGroupsChange?: (value: string[]) => Promise<void> | void;
  className?: string;
}

export default function Filters({
  wsId,
  noInclude = false,
  noExclude = false,
  includedGroups = [],
  excludedGroups = null,
  effectiveIncludedGroups = [],
  effectiveExcludedGroups = [],
  onIncludedGroupsChange,
  onExcludedGroupsChange,
  className,
}: Props) {
  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      {!noInclude && (
        <GroupFilterWrapper
          wsId={wsId}
          filterType="included"
          selectedGroupIds={includedGroups}
          dependencyGroupIds={effectiveIncludedGroups}
          effectiveSelectedGroupIds={effectiveIncludedGroups}
          onSelectedGroupIdsChange={onIncludedGroupsChange}
        />
      )}
      {!noExclude && (
        <GroupFilterWrapper
          wsId={wsId}
          filterType="excluded"
          selectedGroupIds={excludedGroups ?? []}
          dependencyGroupIds={effectiveIncludedGroups}
          effectiveSelectedGroupIds={effectiveExcludedGroups}
          onSelectedGroupIdsChange={onExcludedGroupsChange}
        />
      )}
    </div>
  );
}

function GroupFilterWrapper({
  wsId,
  filterType,
  selectedGroupIds,
  dependencyGroupIds,
  effectiveSelectedGroupIds,
  onSelectedGroupIdsChange,
}: {
  wsId: string;
  filterType: 'included' | 'excluded';
  selectedGroupIds: string[];
  dependencyGroupIds: string[];
  effectiveSelectedGroupIds: string[];
  onSelectedGroupIdsChange?: (value: string[]) => Promise<void> | void;
}) {
  return (
    <GroupFilter
      wsId={wsId}
      filterType={filterType}
      selectedGroupIds={selectedGroupIds}
      dependencyGroupIds={dependencyGroupIds}
      effectiveSelectedGroupIds={effectiveSelectedGroupIds}
      onSelectedGroupIdsChange={onSelectedGroupIdsChange}
    />
  );
}
