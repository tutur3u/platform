import { Filter } from '@tuturuuu/ui/custom/user-filters';
import { getTranslations } from 'next-intl/server';
import { Funnel } from '@tuturuuu/icons';

export default async function Filters() {
  const t = await getTranslations('email-blacklist-data-table');

  const typeOptions = [
    {
      label: t('email'),
      value: 'email',
      count: undefined,
    },
    {
      label: t('domain'),
      value: 'domain',
      count: undefined,
    },
  ];

  return (
    <Filter
      key="type-filter"
      tag="type"
      title={t('entry_type')}
      icon={<Funnel className="h-4 w-4" />}
      options={typeOptions}
    />
  );
}
