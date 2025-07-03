import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import type { Tables } from '@tuturuuu/types/supabase';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import { Clock, LinkIcon, TrendingUp, Users } from '@tuturuuu/ui/icons';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { CustomDataTable } from '@/components/custom-data-table';
import { linkShortenerColumns } from './columns';
import LinkShortenerFilters from './filters';
import { InlineLinkShortenerForm } from './inline-form';

type ShortenedLink = Tables<'shortened_links'> & {
  creator?: {
    id: string;
    email: string | null;
    display_name: string | null;
    avatar_url: string | null;
  } | null;
  href?: string;
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
  }>;
}

export default async function LinkShortenerPage({
  params,
  searchParams,
}: Props) {
  const { wsId } = await params;
  const t = await getTranslations();

  // Get user and check permissions - only allow root workspace members
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Check if user has root workspace access
  if (wsId !== ROOT_WORKSPACE_ID || !user?.email?.endsWith('@tuturuuu.com')) {
    redirect(`/${wsId}`);
  }

  const { data: rawData, count } = await getData(await searchParams);

  const data = rawData.map((d) => ({
    ...d,
    href: `/${wsId}/link-shortener/${d.id}`,
  }));

  const linksThisMonth = data.filter((d) => {
    const createdDate = new Date(d.created_at);
    const now = new Date();
    return (
      createdDate.getMonth() === now.getMonth() &&
      createdDate.getFullYear() === now.getFullYear()
    );
  }).length;

  const uniqueCreators = new Set(data.map((d) => d.creator?.id).filter(Boolean))
    .size;

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20">
      <div className="container mx-auto px-4 py-8 space-y-8">
        {/* Header Section */}
        <div className="text-center space-y-6">
          <div className="flex items-center justify-center space-x-4">
            <div className="relative">
              <div className="absolute inset-0 bg-dynamic-blue/20 rounded-full blur-lg" />
              <div className="relative p-4 bg-gradient-to-br from-dynamic-blue/10 to-dynamic-blue/5 rounded-full border border-dynamic-blue/20">
                <LinkIcon className="h-10 w-10 text-dynamic-blue" />
              </div>
            </div>
            <div className="space-y-2">
              <h1 className="text-5xl font-bold tracking-tight bg-gradient-to-r from-foreground via-foreground to-foreground/60 bg-clip-text">
                {t('link-shortener.plural')}
              </h1>
              <p className="text-xl text-muted-foreground max-w-2xl">
                {t('link-shortener.description')}
              </p>
            </div>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="group relative overflow-hidden border-0 shadow-lg hover:shadow-xl transition-all duration-300 bg-gradient-to-br from-dynamic-blue/5 via-dynamic-blue/10 to-dynamic-blue/5 hover:scale-105">
            <div className="absolute inset-0 bg-gradient-to-br from-dynamic-blue/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            <CardHeader className="relative pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <div className="p-1.5 bg-dynamic-blue/10 rounded-md group-hover:bg-dynamic-blue/20 transition-colors">
                  <LinkIcon className="h-4 w-4 text-dynamic-blue" />
                </div>
                {t('link-shortener.total_links')}
              </CardTitle>
            </CardHeader>
            <CardContent className="relative">
              <div className="text-3xl font-bold text-dynamic-blue mb-1">
                {count?.toLocaleString()}
              </div>
              <p className="text-xs text-muted-foreground">
                {t('link-shortener.all_time')}
              </p>
            </CardContent>
          </Card>

          <Card className="group relative overflow-hidden border-0 shadow-lg hover:shadow-xl transition-all duration-300 bg-gradient-to-br from-dynamic-green/5 via-dynamic-green/10 to-dynamic-green/5 hover:scale-105">
            <div className="absolute inset-0 bg-gradient-to-br from-dynamic-green/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            <CardHeader className="relative pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <div className="p-1.5 bg-dynamic-green/10 rounded-md group-hover:bg-dynamic-green/20 transition-colors">
                  <Clock className="h-4 w-4 text-dynamic-green" />
                </div>
                {t('link-shortener.this_month')}
              </CardTitle>
            </CardHeader>
            <CardContent className="relative">
              <div className="text-3xl font-bold text-dynamic-green mb-1">
                {linksThisMonth.toLocaleString()}
              </div>
              <p className="text-xs text-muted-foreground">
                {t('link-shortener.new_links')}
              </p>
            </CardContent>
          </Card>

          <Card className="group relative overflow-hidden border-0 shadow-lg hover:shadow-xl transition-all duration-300 bg-gradient-to-br from-dynamic-orange/5 via-dynamic-orange/10 to-dynamic-orange/5 hover:scale-105">
            <div className="absolute inset-0 bg-gradient-to-br from-dynamic-orange/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            <CardHeader className="relative pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <div className="p-1.5 bg-dynamic-orange/10 rounded-md group-hover:bg-dynamic-orange/20 transition-colors">
                  <Users className="h-4 w-4 text-dynamic-orange" />
                </div>
                {t('link-shortener.active_creators')}
              </CardTitle>
            </CardHeader>
            <CardContent className="relative">
              <div className="text-3xl font-bold text-dynamic-orange mb-1">
                {uniqueCreators.toLocaleString()}
              </div>
              <p className="text-xs text-muted-foreground">
                {t('link-shortener.unique_users')}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Create Link Section */}
        <Card className="relative overflow-hidden border-0 shadow-xl bg-gradient-to-br from-card/80 via-card to-card/80 backdrop-blur-xl">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent" />
          <CardContent className="relative p-0">
            <InlineLinkShortenerForm />
          </CardContent>
        </Card>

        {/* Links Table Section */}
        <Card className="relative overflow-hidden border-0 shadow-xl bg-gradient-to-br from-card/80 via-card to-card/80 backdrop-blur-xl">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-50" />
          <CardHeader className="relative">
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-dynamic-blue/10 rounded-lg">
                  <TrendingUp className="h-5 w-5 text-dynamic-blue" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold">
                    {t('link-shortener.recent_links')}
                  </h3>
                  <p className="text-sm text-muted-foreground">
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
              filters={<LinkShortenerFilters />}
              defaultVisibility={{
                id: false,
              }}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

async function getData({
  q,
  page = '1',
  pageSize = '10',
  creatorId,
  dateRange,
  domain,
}: {
  q?: string;
  page?: string;
  pageSize?: string;
  creatorId?: string | string[];
  dateRange?: string;
  domain?: string | string[];
} = {}) {
  const sbAdmin = await createAdminClient();

  const limit = parseInt(pageSize);
  const offset = (parseInt(page) - 1) * limit;

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

  // Apply search filter - supports URL, domain, and slug search
  if (q) {
    const searchTerm = q.trim();
    const searchConditions: string[] = [];

    // Search in link URL and slug
    searchConditions.push(`link.ilike.%${searchTerm}%`);
    searchConditions.push(`slug.ilike.%${searchTerm}%`);

    // Use optimized domain extraction for domain searches
    if (!searchTerm.includes('/') && searchTerm.includes('.')) {
      searchConditions.push(`extract_domain(link).ilike.%${searchTerm}%`);
    }

    // If the search term is just a domain name without protocol, search for it
    if (!searchTerm.includes('://') && searchTerm.includes('.')) {
      searchConditions.push(`link.ilike.%://${searchTerm}%`);
      searchConditions.push(`link.ilike.%www.${searchTerm}%`);
    }

    query = query.or(searchConditions.join(','));
  }

  // Apply creator filter
  if (creatorId) {
    const creatorIds = Array.isArray(creatorId) ? creatorId : [creatorId];
    query = query.in('creator_id', creatorIds);
  }

  // Apply domain filter using the optimized domain extraction
  if (domain) {
    const domains = Array.isArray(domain) ? domain : [domain];
    const domainConditions = domains
      .map((d) => `extract_domain(link).ilike.%${d}%`)
      .join(',');
    query = query.or(domainConditions);
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
