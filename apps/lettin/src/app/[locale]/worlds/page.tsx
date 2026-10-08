import { getTranslations } from 'next-intl/server';
import { Brand } from '@/components/brand';
import { PublicExplorer } from '@/components/public-explorer';
import { createLettinPageMetadata } from '@/lib/page-metadata';
import { publicWorlds } from '@/lib/public-worlds';
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
  searchParams: Promise<{ page?: string; q?: string }>;
}) {
  const query = await searchParams;
  const page = Math.min(
    10000,
    Math.max(1, Math.floor(Number(query.page)) || 1)
  );
  return (
    <div className="notebook-theme min-h-screen">
      <Brand />
      <PublicExplorer
        worlds={
          await publicWorlds(undefined, {
            page,
            search: query.q?.slice(0, 200),
          })
        }
        page={page}
        search={query.q}
      />
    </div>
  );
}
