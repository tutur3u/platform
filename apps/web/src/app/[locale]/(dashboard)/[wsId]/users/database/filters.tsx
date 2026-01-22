'use client';

import { GroupFilter } from './group-filter';

interface Props {
  wsId: string;
  noInclude?: boolean;
  noExclude?: boolean;
}

export default function Filters({
  wsId,
  noInclude = false,
  noExclude = false,
}: Props) {
  return (
    <div className="flex items-center gap-2">
      {!noInclude && <GroupFilterWrapper wsId={wsId} filterType="included" />}
      {!noExclude && <GroupFilterWrapper wsId={wsId} filterType="excluded" />}
    </div>
  );
}

function GroupFilterWrapper({
  wsId,
  filterType,
}: {
  wsId: string;
  filterType: 'included' | 'excluded';
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
    />
  );
}
