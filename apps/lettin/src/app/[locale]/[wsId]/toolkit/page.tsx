import { ArrowLeft, Sparkles } from '@tuturuuu/icons';
import { connection } from 'next/server';
import { getTranslations } from 'next-intl/server';
import { CreatorToolkit } from '@/components/creator-toolkit';
import { Link } from '@/i18n/navigation';

export default async function Page({
  params,
}: {
  params: Promise<{ wsId: string }>;
}) {
  await connection();
  const { wsId } = await params;
  const t = await getTranslations('lettin');
  return (
    <main className="mx-auto max-w-[90rem] space-y-10 px-5 py-10 md:px-10">
      <Link
        className="inline-flex items-center gap-2 text-sm"
        href={`/${wsId}`}
      >
        <ArrowLeft size={16} />
        {t('myWorlds')}
      </Link>
      <header className="toolkit-page-hero">
        <Sparkles size={36} />
        <p className="lettin-kicker">{t('poweredByTuturuuu')}</p>
        <h1>{t('toolkitPageTitle')}</h1>
        <p>{t('toolkitPageHint')}</p>
      </header>
      <CreatorToolkit wsId={wsId} showHeading={false} />
    </main>
  );
}
