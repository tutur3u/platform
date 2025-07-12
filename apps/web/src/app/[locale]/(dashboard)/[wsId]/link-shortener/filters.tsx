import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { Building, Calendar, Globe, User } from '@tuturuuu/ui/icons';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { getTranslations } from 'next-intl/server';
import { Filter } from '../users/filters';

interface Props {
  wsId: string;
}

export default async function LinkShortenerFilters({ wsId }: Props) {
  const t = await getTranslations('link-shortener-data-table');

  const { data: creators } = await getCreators();
  const { data: domains } = await getDomains();
  const { data: workspaces } =
    wsId === ROOT_WORKSPACE_ID ? await getWorkspaces() : { data: [] };

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
      {wsId === ROOT_WORKSPACE_ID && (
        <Filter
          key="workspace-filter"
          tag="wsId"
          title={t('workspace')}
          icon={<Building className="mr-2 h-4 w-4" />}
          options={workspaces.map((workspace) => ({
            label: workspace.name || 'Unknown Workspace',
            value: workspace.id || '',
            count: workspace.link_count || 0,
          }))}
          multiple={true}
        />
      )}
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

  // Try the optimized view first, fallback to manual aggregation
  let { data, error } = await sbAdmin
    .from('shortened_links_creator_stats')
    .select('*')
    .order('link_count', { ascending: false });

  if (error) {
    console.log('Falling back to manual creator aggregation:', error.message);

    // Fallback: manual aggregation
    const { data: rawData, error: rawError } = await sbAdmin
      .from('shortened_links')
      .select(`
        creator_id,
        creator:users!creator_id (
          id,
          display_name,
          avatar_url,
          ...user_private_details(email)
        )
      `)
      .not('creator_id', 'is', null);

    if (rawError) {
      console.error('Error fetching creators:', rawError);
      return { data: [] };
    }

    // Aggregate creators with link counts
    const creatorCounts = new Map();

    rawData?.forEach((link) => {
      if (link.creator) {
        const creatorId = link.creator.id;
        if (creatorCounts.has(creatorId)) {
          creatorCounts.set(creatorId, {
            ...creatorCounts.get(creatorId),
            link_count: creatorCounts.get(creatorId).link_count + 1,
          });
        } else {
          creatorCounts.set(creatorId, {
            ...link.creator,
            link_count: 1,
          });
        }
      }
    });

    data = Array.from(creatorCounts.values());
  }

  return { data: data || [] };
}

async function getDomains() {
  const sbAdmin = await createAdminClient();

  // Try the optimized view first, fallback to manual aggregation
  let { data, error } = await sbAdmin
    .from('shortened_links_domain_stats')
    .select('*')
    .order('link_count', { ascending: false });

  if (error) {
    console.log('Falling back to manual domain aggregation:', error.message);

    // Fallback: manual aggregation
    const { data: rawData, error: rawError } = await sbAdmin
      .from('shortened_links')
      .select('link');

    if (rawError) {
      console.error('Error fetching domains:', rawError);
      return { data: [] };
    }

    // Extract domains and count occurrences
    const domainCounts = new Map();

    rawData?.forEach((link) => {
      try {
        const url = new URL(link.link);
        const domain = url.hostname;

        if (domainCounts.has(domain)) {
          domainCounts.set(domain, domainCounts.get(domain) + 1);
        } else {
          domainCounts.set(domain, 1);
        }
      } catch (e) {
        // Skip invalid URLs
        console.error('Error fetching domains:', e);
      }
    });

    // Convert to array and sort by count
    data = Array.from(domainCounts.entries())
      .map(([name, count]) => ({
        domain: name,
        link_count: count,
        creator_count: null,
        first_created: null,
        last_created: null,
      }))
      .sort((a, b) => b.link_count - a.link_count);
  }

  return { data: data || [] };
}

async function getWorkspaces() {
  const sbAdmin = await createAdminClient();

  // Get workspaces with link counts
  const { data: rawData, error } = await sbAdmin
    .from('shortened_links')
    .select(`
      ws_id,
      workspaces!ws_id (
        id,
        name,
        logo_url
      )
    `)
    .not('ws_id', 'is', null);

  if (error) {
    console.error('Error fetching workspaces:', error);
    return { data: [] };
  }

  // Aggregate workspaces with link counts
  const workspaceCounts = new Map();

  rawData?.forEach((link) => {
    if (link.workspaces) {
      const workspaceId = link.workspaces.id;
      if (workspaceCounts.has(workspaceId)) {
        workspaceCounts.set(workspaceId, {
          ...workspaceCounts.get(workspaceId),
          link_count: workspaceCounts.get(workspaceId).link_count + 1,
        });
      } else {
        workspaceCounts.set(workspaceId, {
          ...link.workspaces,
          link_count: 1,
        });
      }
    }
  });

  const data = Array.from(workspaceCounts.values()).sort(
    (a, b) => b.link_count - a.link_count
  );

  return { data };
}
