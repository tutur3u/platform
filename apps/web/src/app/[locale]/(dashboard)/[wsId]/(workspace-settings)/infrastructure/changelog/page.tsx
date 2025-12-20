import { Plus } from '@tuturuuu/icons';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { Button } from '@tuturuuu/ui/button';
import { CustomDataTable } from '@tuturuuu/ui/custom/tables/custom-data-table';
import { Separator } from '@tuturuuu/ui/separator';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { changelogColumns } from './columns';

export const metadata: Metadata = {
  title: 'Changelog',
  description: 'Manage platform changelog entries.',
};

interface Props {
  params: Promise<{
    wsId: string;
  }>;
  searchParams: Promise<{
    q?: string;
    page?: string;
    pageSize?: string;
    category?: string;
    published?: string;
  }>;
}

export default async function InfrastructureChangelogPage({
  params,
  searchParams,
}: Props) {
  const { wsId } = await params;

  const { withoutPermission } = await getPermissions({ wsId });

  if (withoutPermission('manage_changelog')) {
    redirect(`/${wsId}/settings`);
  }

  const t = await getTranslations();
  const { data: changelogs, count } = await getChangelogs(await searchParams);

  return (
    <>
      <div className="flex flex-col justify-between gap-4 rounded-lg border border-border bg-foreground/5 p-4 md:flex-row md:items-start">
        <div>
          <h1 className="font-bold text-2xl">
            {t('infrastructure-tabs.changelog')}
          </h1>
          <p className="text-foreground/80">
            Create and manage platform changelog entries.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="rounded-lg border border-border bg-background px-3 py-1.5">
            <span className="font-semibold text-muted-foreground text-sm">
              Total: {count}
            </span>
          </div>
          <Link href={`/${wsId}/infrastructure/changelog/new`}>
            <Button size="sm">
              <Plus className="mr-2 h-4 w-4" />
              New Entry
            </Button>
          </Link>
        </div>
      </div>

      <Separator className="my-4" />

      <CustomDataTable
        columnGenerator={changelogColumns}
        namespace="changelog-data-table"
        data={changelogs}
        count={count}
        defaultVisibility={{
          id: false,
          creator_id: false,
        }}
      />
    </>
  );
}

interface ChangelogEntry {
  id: string;
  title: string;
  slug: string;
  summary: string | null;
  category: string;
  version: string | null;
  is_published: boolean;
  published_at: string | null;
  creator_id: string;
  creator_name: string | null;
  created_at: string;
  updated_at: string;
}

async function getChangelogs({
  q,
  page = '1',
  pageSize = '10',
  category,
  published,
}: {
  q?: string;
  page?: string;
  pageSize?: string;
  category?: string;
  published?: string;
}) {
  const supabaseAdmin = await createAdminClient();
  if (!supabaseAdmin) notFound();

  const queryBuilder = supabaseAdmin
    .from('changelog_entries')
    .select(
      `
      id, title, slug, summary, category, version, is_published, published_at, creator_id, created_at, updated_at,
      creator:users!creator_id(display_name)
    `,
      { count: 'exact' }
    )
    .order('created_at', { ascending: false });

  if (q) {
    queryBuilder.or(
      `title.ilike.%${q}%,summary.ilike.%${q}%,slug.ilike.%${q}%`
    );
  }

  if (category) {
    queryBuilder.eq('category', category);
  }

  if (published === 'true') {
    queryBuilder.eq('is_published', true);
  } else if (published === 'false') {
    queryBuilder.eq('is_published', false);
  }

  if (page && pageSize) {
    const parsedPage = parseInt(page, 10);
    const parsedSize = parseInt(pageSize, 10);
    const start = (parsedPage - 1) * parsedSize;
    const end = parsedPage * parsedSize;
    queryBuilder.range(start, end).limit(parsedSize);
  }

  const { data, error, count } = await queryBuilder;
  if (error) throw error;

  // Transform data to flatten creator name
  const transformedData = data?.map((entry) => ({
    ...entry,
    creator_name:
      (entry.creator as { display_name: string } | null)?.display_name ?? null,
    creator: undefined,
  })) as ChangelogEntry[];

  return { data: transformedData, count: count || 0 };
}
