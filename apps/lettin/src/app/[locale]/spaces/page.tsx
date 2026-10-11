import { ArrowRight, Compass } from '@tuturuuu/icons';
import { getTranslations } from 'next-intl/server';
import { Brand } from '@/components/brand';
import { CreativeSpaces } from '@/components/creative-spaces';
import { Link } from '@/i18n/navigation';
import { createLettinPageMetadata } from '@/lib/page-metadata';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'lettin' });
  return createLettinPageMetadata({
    title: t('spacesDirectoryTitle'),
    description: t('spacesDirectoryHint'),
    locale,
    pathname: '/spaces',
  });
}

export default async function Page() {
  const t = await getTranslations('lettin');
  return (
    <div className="notebook-theme min-h-screen">
      <Brand />
      <main className="mx-auto max-w-[90rem] space-y-10 px-5 py-10 md:px-10">
        <header className="toolkit-page-hero">
          <Compass size={36} />
          <p className="lettin-kicker">{t('dedicatedSpaces')}</p>
          <h1>{t('spacesDirectoryTitle')}</h1>
          <p>{t('spacesDirectoryHint')}</p>
        </header>
        <CreativeSpaces showHeading={false} />
        <section className="notebook-paper flex flex-wrap items-center justify-between gap-5 p-8">
          <div>
            <h2 className="text-3xl">{t('spacesPrivateTitle')}</h2>
            <p className="mt-3 max-w-xl text-muted-foreground text-sm">
              {t('spacesPrivateHint')}
            </p>
          </div>
          <Link href="/worlds" className="lettin-secondary-link">
            {t('exploreWorlds')}
            <ArrowRight size={16} />
          </Link>
        </section>
      </main>
    </div>
  );
}
