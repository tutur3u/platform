'use client';

import { MinusCircle, PlusCircle } from '@tuturuuu/icons';
import { Filter } from '@tuturuuu/ui/custom/user-filters';
import { useTranslations } from 'next-intl';
import { useExcludedUserGroups, useWorkspaceUserGroups } from './hooks';

interface Props {
  wsId: string;
  includedGroups: string[];
  excludedGroups: string[];
  noInclude?: boolean;
  noExclude?: boolean;
}

export function ClientFilters({
  wsId,
  includedGroups,
  excludedGroups,
  noInclude = false,
  noExclude = false,
}: Props) {
  const t = useTranslations('user-data-table');

  const { data: userGroups = [], isLoading: isLoadingGroups } =
    useWorkspaceUserGroups(wsId);

  const { data: excludedUserGroups = [], isLoading: isLoadingExcluded } =
    useExcludedUserGroups(wsId, includedGroups);

  // Show loading state if fetching initial data
  if (isLoadingGroups || isLoadingExcluded) {
    return (
      <div className="flex gap-2">
        <div className="h-8 w-32 animate-pulse rounded-md bg-muted" />
        <div className="h-8 w-32 animate-pulse rounded-md bg-muted" />
      </div>
    );
  }

  return (
    <>
      {noInclude || (
        <Filter
          key="included-user-groups-filter"
          tag="includedGroups"
          title={t('included_groups')}
          icon={<PlusCircle className="mr-2 h-4 w-4" />}
          defaultValues={includedGroups}
          options={userGroups.map((group) => ({
            label: group.name || 'No name',
            value: group.id,
            count: group.amount,
          }))}
        />
      )}
      {noExclude || (
        <Filter
          key="excluded-user-groups-filter"
          tag="excludedGroups"
          title={t('excluded_groups')}
          icon={<MinusCircle className="mr-2 h-4 w-4" />}
          defaultValues={excludedGroups}
          options={excludedUserGroups.map((group) => ({
            label: group.name || 'No name',
            value: group.id,
            count: group.amount,
          }))}
        />
      )}
    </>
  );
}
