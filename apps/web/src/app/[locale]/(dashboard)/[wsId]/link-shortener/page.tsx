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
    <div>
      <div className="container mx-auto px-4 py-8 space-y-8">
        {/* Header Section */}
        <div className="text-center space-y-4">
          <div className="flex items-center justify-center space-x-3">
            <div className="p-3 bg-dynamic-blue/10 rounded-full">
              <LinkIcon className="h-8 w-8 text-dynamic-blue" />
            </div>
            <div>
              <h1 className="text-4xl font-bold tracking-tight bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text">
                {t('link-shortener.plural')}
              </h1>
              <p className="text-lg text-muted-foreground mt-2">
                {t('link-shortener.description')}
              </p>
            </div>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="border-0 shadow-md bg-gradient-to-br from-dynamic-blue/5 to-dynamic-blue/10">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <LinkIcon className="h-4 w-4" />
                {t('link-shortener.total_links')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-dynamic-blue">
                {count}
              </div>
              <p className="text-xs text-muted-foreground">
                {t('link-shortener.all_time')}
              </p>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-md bg-gradient-to-br from-dynamic-green/5 to-dynamic-green/10">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Clock className="h-4 w-4" />
                {t('link-shortener.this_month')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-dynamic-green">
                {linksThisMonth}
              </div>
              <p className="text-xs text-muted-foreground">
                {t('link-shortener.new_links')}
              </p>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-md bg-gradient-to-br from-dynamic-orange/5 to-dynamic-orange/10">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Users className="h-4 w-4" />
                {t('link-shortener.active_creators')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-dynamic-orange">
                {uniqueCreators}
              </div>
              <p className="text-xs text-muted-foreground">
                {t('link-shortener.unique_users')}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Create Link Section */}
        <Card className="border-0 shadow-lg bg-card/50 backdrop-blur-sm">
          <CardContent className="p-0">
            <InlineLinkShortenerForm />
          </CardContent>
        </Card>

        {/* Links Table Section */}
        <Card className="border-0 shadow-lg bg-card/50 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-dynamic-blue" />
                {t('link-shortener.recent_links')}
              </div>
              <div className="text-sm font-normal text-muted-foreground">
                {count}{' '}
                {count === 1
                  ? t('link-shortener.singular')
                  : t('link-shortener.plural')}
              </div>
            </CardTitle>
            <CardDescription>
              {t('link-shortener.manage_description')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CustomDataTable
              data={data}
              columnGenerator={linkShortenerColumns}
              namespace="link-shortener-data-table"
              count={count}
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
}: {
  q?: string;
  page?: string;
  pageSize?: string;
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

  if (q) {
    query = query.or(`link.ilike.%${q}%,slug.ilike.%${q}%`);
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
