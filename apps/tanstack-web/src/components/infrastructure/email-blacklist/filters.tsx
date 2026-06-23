'use client';

import { Funnel } from '@tuturuuu/icons';
import type { BackendInfrastructureEmailBlacklistEntryType } from '@tuturuuu/internal-api/backend';
import { Filter } from '@tuturuuu/ui/custom/user-filters';
import { useTranslations } from 'next-intl';

type EmailBlacklistFiltersProps = {
  type: BackendInfrastructureEmailBlacklistEntryType | '';
};

export default function EmailBlacklistFilters({
  type,
}: EmailBlacklistFiltersProps) {
  const t = useTranslations('email-blacklist-data-table');

  return (
    <Filter
      align="start"
      defaultValues={type ? [type] : []}
      extraQueryOnSet={{ page: '1' }}
      icon={<Funnel className="h-4 w-4" />}
      key="type-filter"
      multiple={false}
      options={[
        {
          label: t('email'),
          value: 'email',
        },
        {
          label: t('domain'),
          value: 'domain',
        },
      ]}
      tag="type"
      title={t('entry_type')}
    />
  );
}
