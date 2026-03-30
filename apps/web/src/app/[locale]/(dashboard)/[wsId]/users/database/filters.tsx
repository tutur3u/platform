'use client';

import { cn } from '@tuturuuu/utils/format';
import { GroupFilter } from './group-filter';

interface Props {
  wsId: string;
  noInclude?: boolean;
  noExclude?: boolean;
  effectiveExcludedGroups?: string[];
  className?: string;
}

export default function Filters({
  wsId,
  noInclude = false,
  noExclude = false,
  effectiveExcludedGroups = [],
  className,
}: Props) {
  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      {!noInclude && <GroupFilterWrapper wsId={wsId} filterType="included" />}
      {!noExclude && (
        <GroupFilterWrapper
          wsId={wsId}
          filterType="excluded"
          effectiveExcludedGroups={effectiveExcludedGroups}
        />
      )}
    </div>
  );
}

function GroupFilterWrapper({
  wsId,
  filterType,
  effectiveExcludedGroups = [],
}: {
  wsId: string;
  filterType: 'included' | 'excluded';
  effectiveExcludedGroups?: string[];
}) {
  const queryKey =
    filterType === 'excluded' ? 'excludedGroups' : 'includedGroups';
  const dependencyKey =
    filterType === 'excluded' ? 'includedGroups' : undefined;

  return (
    <GroupFilter
      wsId={wsId}
      filterType={filterType}
      queryKey={queryKey}
      pageKey="page"
      dependencyKey={dependencyKey}
      effectiveSelectedGroupIds={
        filterType === 'excluded' ? effectiveExcludedGroups : undefined
      }
    />
  );
}
