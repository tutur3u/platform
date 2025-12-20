import {
  BarChart3,
  Clock,
  LinkIcon,
  MousePointerClick,
  TrendingUp,
  Users,
} from '@tuturuuu/icons';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import type { Tables } from '@tuturuuu/types';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { CustomDataTable } from '@/components/custom-data-table';
import WorkspaceWrapper from '@/components/workspace-wrapper';
import { linkShortenerColumns } from './columns';
import LinkShortenerFilters from './filters';
import { InlineLinkShortenerForm } from './inline-form';

export const metadata: Metadata = {
  title: 'Link Shortener',
  description: 'Manage Link Shortener in your Tuturuuu workspace.',
};

type ShortenedLink = Tables<'shortened_links'> & {
  creator?: {
    id: string;
    email: string | null;
    display_name: string | null;
    avatar_url: string | null;
  } | null;
  href?: string;
  click_count?: number;
  analytics?: {
    total_clicks: number;
  } | null;
};

interface Props {
  params: Promise<{
    wsId: string;
  }>;
  searchParams: Promise<{
    q?: string;
    page?: string;
    pageSize?: string;
    creatorId?: string | string[];
    dateRange?: string;
    domain?: string | string[];
    wsId?: string | string[];
  }>;
}

export default async function LinkShortenerPage({
  params,
  searchParams,
}: Props) {
  return (
    <WorkspaceWrapper params={params}>
      {async ({ wsId }) => {
        const t = await getTranslations();

        const [{ data: rawData, count }, analytics] = await Promise.all([
          getData(wsId, await searchParams),
          getAnalyticsData(wsId),
        ]);

        // Fetch analytics data separately
        const sbAdmin = await createAdminClient();
        const { data: analyticsData } = await sbAdmin
          .from('link_analytics_summary')
          .select('link_id, total_clicks')
          .in(
            'link_id',
            rawData.map((d) => d.id)
          );

        const analyticsMap = new Map(
          analyticsData?.map((a) => [a.link_id || '', a.total_clicks || 0]) ||
            []
        );

        const data = rawData.map((d) => ({
          ...d,
          href: `/${wsId}/link-shortener/${d.id}`,
          click_count: analyticsMap.get(d.id) || 0,
        }));

        const linksThisMonth = data.filter((d) => {
          const createdDate = new Date(d.created_at);
          const now = new Date();
          return (
            createdDate.getMonth() === now.getMonth() &&
            createdDate.getFullYear() === now.getFullYear()
          );
        }).length;

        const uniqueCreators = new Set(
          data.map((d) => d.creator?.id).filter(Boolean)
        ).size;

        return (
          <div className="min-h-screen">
            <div className="container mx-auto space-y-8 px-4 py-8">
              {/* Header Section */}
              <div className="space-y-6 text-center">
                <div className="flex items-center justify-center space-x-4">
                  <div className="relative">
                    <div className="absolute inset-0 rounded-full bg-dynamic-blue/20 blur-lg" />
                    <div className="relative rounded-full border border-dynamic-blue/20 bg-linear-to-br from-dynamic-blue/10 to-dynamic-blue/5 p-4">
                      <LinkIcon className="h-10 w-10 text-dynamic-blue" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <h1 className="bg-linear-to-r from-foreground via-foreground to-foreground/60 bg-clip-text font-bold text-5xl tracking-tight">
                      {t('link-shortener.plural')}
                    </h1>
                    <p className="max-w-2xl text-muted-foreground text-xl">
                      {t('link-shortener.description')}
                    </p>
                  </div>
                </div>
              </div>

              {/* Stats Cards */}
              <div className="grid grid-cols-1 gap-6 md:grid-cols-5">
                <Card className="group relative overflow-hidden border-0 bg-linear-to-br from-dynamic-blue/5 via-dynamic-blue/10 to-dynamic-blue/5 shadow-lg transition-all duration-300 hover:scale-105 hover:shadow-xl">
                  <div className="absolute inset-0 bg-linear-to-br from-dynamic-blue/10 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                  <CardHeader className="relative pb-3">
                    <CardTitle className="flex items-center gap-2 font-medium text-muted-foreground text-sm">
                      <div className="rounded-md bg-dynamic-blue/10 p-1.5 transition-colors group-hover:bg-dynamic-blue/20">
                        <LinkIcon className="h-4 w-4 text-dynamic-blue" />
                      </div>
                      {t('link-shortener.total_links')}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="relative">
                    <div className="mb-1 font-bold text-3xl text-dynamic-blue">
                      {count?.toLocaleString()}
                    </div>
                    <p className="text-muted-foreground text-xs">
                      {t('link-shortener.all_time')}
                    </p>
                  </CardContent>
                </Card>

                <Card className="group relative overflow-hidden border-0 bg-linear-to-br from-dynamic-green/5 via-dynamic-green/10 to-dynamic-green/5 shadow-lg transition-all duration-300 hover:scale-105 hover:shadow-xl">
                  <div className="absolute inset-0 bg-linear-to-br from-dynamic-green/10 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                  <CardHeader className="relative pb-3">
                    <CardTitle className="flex items-center gap-2 font-medium text-muted-foreground text-sm">
                      <div className="rounded-md bg-dynamic-green/10 p-1.5 transition-colors group-hover:bg-dynamic-green/20">
                        <Clock className="h-4 w-4 text-dynamic-green" />
                      </div>
                      {t('link-shortener.this_month')}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="relative">
                    <div className="mb-1 font-bold text-3xl text-dynamic-green">
                      {linksThisMonth.toLocaleString()}
                    </div>
                    <p className="text-muted-foreground text-xs">
                      {t('link-shortener.new_links')}
                    </p>
                  </CardContent>
                </Card>

                <Card className="group relative overflow-hidden border-0 bg-linear-to-br from-dynamic-orange/5 via-dynamic-orange/10 to-dynamic-orange/5 shadow-lg transition-all duration-300 hover:scale-105 hover:shadow-xl">
                  <div className="absolute inset-0 bg-linear-to-br from-dynamic-orange/10 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                  <CardHeader className="relative pb-3">
                    <CardTitle className="flex items-center gap-2 font-medium text-muted-foreground text-sm">
                      <div className="rounded-md bg-dynamic-orange/10 p-1.5 transition-colors group-hover:bg-dynamic-orange/20">
                        <Users className="h-4 w-4 text-dynamic-orange" />
                      </div>
                      {t('link-shortener.active_creators')}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="relative">
                    <div className="mb-1 font-bold text-3xl text-dynamic-orange">
                      {uniqueCreators.toLocaleString()}
                    </div>
                    <p className="text-muted-foreground text-xs">
                      {t('link-shortener.unique_users')}
                    </p>
                  </CardContent>
                </Card>

                <Card className="group relative overflow-hidden border-0 bg-linear-to-br from-dynamic-purple/5 via-dynamic-purple/10 to-dynamic-purple/5 shadow-lg transition-all duration-300 hover:scale-105 hover:shadow-xl">
                  <div className="absolute inset-0 bg-linear-to-br from-dynamic-purple/10 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                  <CardHeader className="relative pb-3">
                    <CardTitle className="flex items-center gap-2 font-medium text-muted-foreground text-sm">
                      <div className="rounded-md bg-dynamic-purple/10 p-1.5 transition-colors group-hover:bg-dynamic-purple/20">
                        <MousePointerClick className="h-4 w-4 text-dynamic-purple" />
                      </div>
                      {t('link-shortener.analytics.total_clicks')}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="relative">
                    <div className="mb-1 font-bold text-3xl text-dynamic-purple">
                      {analytics.totalClicks.toLocaleString()}
                    </div>
                    <p className="text-muted-foreground text-xs">
                      {t('link-shortener.analytics.all_links_combined')}
                    </p>
                  </CardContent>
                </Card>

                <Card className="group relative overflow-hidden border-0 bg-linear-to-br from-dynamic-pink/5 via-dynamic-pink/10 to-dynamic-pink/5 shadow-lg transition-all duration-300 hover:scale-105 hover:shadow-xl">
                  <div className="absolute inset-0 bg-linear-to-br from-dynamic-pink/10 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                  <CardHeader className="relative pb-3">
                    <CardTitle className="flex items-center gap-2 font-medium text-muted-foreground text-sm">
                      <div className="rounded-md bg-dynamic-pink/10 p-1.5 transition-colors group-hover:bg-dynamic-pink/20">
                        <BarChart3 className="h-4 w-4 text-dynamic-pink" />
                      </div>
                      {t('link-shortener.analytics.unique_visitors')}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="relative">
                    <div className="mb-1 font-bold text-3xl text-dynamic-pink">
                      {analytics.uniqueVisitors.toLocaleString()}
                    </div>
                    <p className="text-muted-foreground text-xs">
                      {t('link-shortener.analytics.unique_ip_addresses')}
                    </p>
                  </CardContent>
                </Card>
              </div>

              {/* Create Link Section */}
              <Card className="relative overflow-hidden border-0 bg-linear-to-br from-card/80 via-card to-card/80 shadow-xl backdrop-blur-xl">
                <div className="absolute inset-0 bg-linear-to-br from-primary/5 to-transparent" />
                <CardContent className="relative p-0">
                  <InlineLinkShortenerForm wsId={wsId} />
                </CardContent>
              </Card>

              {/* Links Table Section */}
              <Card className="relative overflow-hidden border-0 bg-linear-to-br from-card/80 via-card to-card/80 shadow-xl backdrop-blur-xl">
                <div className="absolute inset-0 bg-linear-to-br from-primary/5 to-transparent opacity-50" />
                <CardHeader className="relative">
                  <CardTitle className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="rounded-lg bg-dynamic-blue/10 p-2">
                        <TrendingUp className="h-5 w-5 text-dynamic-blue" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-lg">
                          {t('link-shortener.recent_links')}
                        </h3>
                        <p className="text-muted-foreground text-sm">
                          {count}{' '}
                          {count === 1
                            ? t('link-shortener.singular')
                            : t('link-shortener.plural')}
                        </p>
                      </div>
                    </div>
                  </CardTitle>
                  <CardDescription className="text-base">
                    {t('link-shortener.manage_description')}
                  </CardDescription>
                </CardHeader>
                <CardContent className="relative">
                  <CustomDataTable
                    data={data}
                    columnGenerator={linkShortenerColumns}
                    namespace="link-shortener-data-table"
                    count={count}
                    filters={<LinkShortenerFilters wsId={wsId} />}
                    defaultVisibility={{
                      id: false,
                      creator: false,
                      creator_id: false,
                      created_at: false,
                      click_count: true,
                      href: true,
                    }}
                  />
                </CardContent>
              </Card>
            </div>
          </div>
        );
      }}
    </WorkspaceWrapper>
  );
}

async function getAnalyticsData(wsId: string) {
  const supabase = await createClient();
  const sbAdmin = await createAdminClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.id) {
    return { totalClicks: 0, uniqueVisitors: 0 };
  }

  const { data: workspaceMember } = await supabase
    .from('workspace_members')
    .select('*')
    .eq('ws_id', wsId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (!workspaceMember) {
    return { totalClicks: 0, uniqueVisitors: 0 };
  }

  // Get analytics summary for all links in the workspace
  let analyticsQuery = sbAdmin
    .from('link_analytics_summary')
    .select('total_clicks, unique_visitors');

  if (wsId !== ROOT_WORKSPACE_ID) {
    analyticsQuery = analyticsQuery.eq('ws_id', wsId);
  }

  const { data: analyticsData, error } = await analyticsQuery;

  if (error || !analyticsData) {
    return { totalClicks: 0, uniqueVisitors: 0 };
  }

  const totalClicks = analyticsData.reduce(
    (sum, item) => sum + (item.total_clicks || 0),
    0
  );
  const uniqueVisitors = analyticsData.reduce(
    (sum, item) => sum + (item.unique_visitors || 0),
    0
  );

  return { totalClicks, uniqueVisitors };
}

async function getData(
  wsId: string,
  {
    q,
    page = '1',
    pageSize = '10',
    creatorId,
    dateRange,
    domain,
    wsId: workspaceFilter,
  }: {
    q?: string;
    page?: string;
    pageSize?: string;
    creatorId?: string | string[];
    dateRange?: string;
    domain?: string | string[];
    wsId?: string | string[];
  } = {}
) {
  const supabase = await createClient();
  const sbAdmin = await createAdminClient();

  const limit = parseInt(pageSize, 10);
  const offset = (parseInt(page, 10) - 1) * limit;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.id) {
    return { data: [], count: 0 };
  }

  const { data: workspaceMember } = await supabase
    .from('workspace_members')
    .select('*')
    .eq('ws_id', wsId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (!workspaceMember) {
    return { data: [], count: 0 };
  }

  let query = sbAdmin
    .from('shortened_links')
    .select(
      `
      *,
      creator:users!creator_id (
        id,
        display_name,
        avatar_url,
        ...user_private_details(email)
      )
    `,
      { count: 'exact' }
    )
    .order('created_at', { ascending: false });

  if (wsId !== ROOT_WORKSPACE_ID) {
    query = query.eq('ws_id', wsId);
  } else if (workspaceFilter) {
    // If in root workspace and workspace filter is applied
    const workspaceIds = Array.isArray(workspaceFilter)
      ? workspaceFilter
      : [workspaceFilter];
    query = query.in('ws_id', workspaceIds);
  }

  // Apply search filter - supports URL, domain, and slug search
  if (q) {
    const searchTerm = q.trim();
    query = query.textSearch('link', searchTerm);
  }

  // Apply creator filter
  if (creatorId) {
    const creatorIds = Array.isArray(creatorId) ? creatorId : [creatorId];
    query = query.in('creator_id', creatorIds);
  }

  // Apply domain filter
  if (domain) {
    const domains = Array.isArray(domain) ? domain : [domain];
    query = query.in('domain', domains);
  }

  // Apply date range filter
  if (dateRange) {
    const now = new Date();
    let startDate: Date | null = null;

    switch (dateRange) {
      case 'today':
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        break;
      case 'yesterday': {
        startDate = new Date(
          now.getFullYear(),
          now.getMonth(),
          now.getDate() - 1
        );
        const endDate = new Date(
          now.getFullYear(),
          now.getMonth(),
          now.getDate()
        );
        query = query
          .gte('created_at', startDate.toISOString())
          .lt('created_at', endDate.toISOString());
        break;
      }
      case 'this_week': {
        const dayOfWeek = now.getDay();
        startDate = new Date(
          now.getFullYear(),
          now.getMonth(),
          now.getDate() - dayOfWeek
        );
        break;
      }
      case 'last_week': {
        const lastWeekStart = new Date(
          now.getFullYear(),
          now.getMonth(),
          now.getDate() - now.getDay() - 7
        );
        const lastWeekEnd = new Date(
          now.getFullYear(),
          now.getMonth(),
          now.getDate() - now.getDay()
        );
        query = query
          .gte('created_at', lastWeekStart.toISOString())
          .lt('created_at', lastWeekEnd.toISOString());
        break;
      }
      case 'this_month':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case 'last_month': {
        const lastMonthStart = new Date(
          now.getFullYear(),
          now.getMonth() - 1,
          1
        );
        const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 1);
        query = query
          .gte('created_at', lastMonthStart.toISOString())
          .lt('created_at', lastMonthEnd.toISOString());
        break;
      }
      case 'last_3_months':
        startDate = new Date(now.getFullYear(), now.getMonth() - 3, 1);
        break;
      case 'this_year':
        startDate = new Date(now.getFullYear(), 0, 1);
        break;
      default:
        startDate = new Date(0); // Beginning of time
    }

    // Apply start date filter if not already handled above
    if (
      !['yesterday', 'last_week', 'last_month'].includes(dateRange) &&
      startDate
    ) {
      query = query.gte('created_at', startDate.toISOString());
    }
  }

  const { data, error, count } = await query.range(offset, offset + limit - 1);

  if (error) {
    console.error('Error fetching shortened links:', error);
    return { data: [], count: 0 };
  }

  return { data: data || [], count: count || 0 } as {
    data: ShortenedLink[];
    count: number;
  };
}
