import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Brand } from '@/components/brand';
import { PublicExplorer } from '@/components/public-explorer';
import { createLettinPageMetadata } from '@/lib/page-metadata';
import { publicWorlds } from '@/lib/public-worlds';
import { publicCatalogueFiltersSchema } from '@/server/public-catalogue-filters';
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'lettin' });
  return createLettinPageMetadata({
    title: t('exploreWorlds'),
    description: t('heroDescription'),
    locale,
    pathname: '/worlds',
  });
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    q?: string | string[];
    tag?: string | string[];
  }>;
}) {
  const query = await searchParams;
  const page = Math.min(
    10000,
    Math.max(1, Math.floor(Number(query.page)) || 1)
  );
  const filters = publicCatalogueFiltersSchema.safeParse({
    page,
    search: typeof query.q === 'string' ? query.q.slice(0, 200) : query.q,
    tag: query.tag,
  });
  if (!filters.success) notFound();
  return (
    <div className="notebook-theme min-h-screen">
      <Brand />
      <PublicExplorer
        worlds={await publicWorlds(undefined, filters.data)}
        page={filters.data.page}
        search={filters.data.search}
        tag={filters.data.tag}
      />
    </div>
  );
}
