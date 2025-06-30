import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import type { Tables } from '@tuturuuu/types/supabase';
import { Separator } from '@tuturuuu/ui/separator';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { CustomDataTable } from '@/components/custom-data-table';
import { linkShortenerColumns } from './columns';
import { InlineLinkShortenerForm } from './inline-form';

type ShortenedLink = Tables<'shortened_links'>;

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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">
          {t('link-shortener.plural')}
        </h1>
        <p className="text-muted-foreground">
          {t('link-shortener.description')}
        </p>
      </div>

      {/* Inline Form - No Modal! */}
      <InlineLinkShortenerForm />

      {/* Separator */}
      <Separator />

      {/* Data Table */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">
            {t('link-shortener.recent_links')}
          </h2>
          <p className="text-sm text-muted-foreground">
            {count}{' '}
            {count === 1
              ? t('link-shortener.singular')
              : t('link-shortener.plural')}
          </p>
        </div>
        <CustomDataTable
          data={data}
          columnGenerator={linkShortenerColumns}
          namespace="link-shortener-data-table"
          count={count}
          defaultVisibility={{
            id: false,
          }}
        />
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
    .select('*', { count: 'exact' })
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
