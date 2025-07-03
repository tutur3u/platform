import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { Calendar, Globe, User } from '@tuturuuu/ui/icons';
import { getTranslations } from 'next-intl/server';
import { Filter } from '../users/filters';

export default async function LinkShortenerFilters() {
  const t = await getTranslations('link-shortener-data-table');

  const { data: creators } = await getCreators();
  const { data: domains } = await getDomains();

  const dateRangeOptions = [
    { label: t('date_filters.today'), value: 'today' },
    { label: t('date_filters.yesterday'), value: 'yesterday' },
    { label: t('date_filters.this_week'), value: 'this_week' },
    { label: t('date_filters.last_week'), value: 'last_week' },
    { label: t('date_filters.this_month'), value: 'this_month' },
    { label: t('date_filters.last_month'), value: 'last_month' },
    { label: t('date_filters.last_3_months'), value: 'last_3_months' },
    { label: t('date_filters.this_year'), value: 'this_year' },
  ];

  return (
    <>
      <Filter
        key="creator-filter"
        tag="creatorId"
        title={t('creator')}
        icon={<User className="mr-2 h-4 w-4" />}
        options={creators.map((creator) => ({
          label:
            creator.display_name || creator.email?.split('@')[0] || 'Unknown',
          value: creator.id || '',
          count: creator.link_count || 0,
        }))}
        multiple={true}
      />
      <Filter
        key="date-range-filter"
        tag="dateRange"
        title={t('date_range')}
        icon={<Calendar className="mr-2 h-4 w-4" />}
        options={dateRangeOptions}
        multiple={false}
      />
      <Filter
        key="domain-filter"
        tag="domain"
        title={t('domain')}
        icon={<Globe className="mr-2 h-4 w-4" />}
        options={domains.map((domain) => ({
          label: domain.domain || 'Unknown Domain',
          value: domain.domain || '',
          count: domain.link_count || 0,
        }))}
        multiple={true}
      />
    </>
  );
}

async function getCreators() {
  const sbAdmin = await createAdminClient();

  const { data, error } = await sbAdmin
    .from('shortened_links_creator_stats')
    .select('*')
    .order('link_count', { ascending: false });

  if (error) {
    console.error('Error fetching creators:', error);
    return { data: [] };
  }

  return { data: data || [] };
}

async function getDomains() {
  const sbAdmin = await createAdminClient();

  const { data, error } = await sbAdmin
    .from('shortened_links_domain_stats')
    .select('*')
    .order('link_count', { ascending: false });

  if (error) {
    console.error('Error fetching domains:', error);
    return { data: [] };
  }

  return { data: data || [] };
}
