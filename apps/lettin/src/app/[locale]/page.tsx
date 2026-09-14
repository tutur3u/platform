import { BookOpen, Feather, Map as MapIcon, Sparkles } from '@tuturuuu/icons';
import { getTranslations } from 'next-intl/server';
import { Brand } from '@/components/brand';
import { Link } from '@/i18n/navigation';
export default async function Page() {
  const t = await getTranslations('lettin');
  return (
    <div className="notebook-theme min-h-screen">
      <Brand />
      <main className="mx-auto max-w-6xl px-6 py-16 md:py-24">
        <div className="grid items-center gap-14 md:grid-cols-[1.15fr_1fr]">
          <section>
            <p className="mb-6 text-muted-foreground text-xs uppercase tracking-[0.23em]">
              {t('tagline')}
            </p>
            <h1 className="text-5xl leading-[1.12] md:text-7xl">
              {t('heroTitle')}
            </h1>
            <p className="mt-7 max-w-lg text-lg text-muted-foreground leading-relaxed">
              {t('heroDescription')}
            </p>
            <div className="mt-9 flex flex-wrap gap-4">
              <Link
                className="rounded-lg bg-primary px-6 py-3 text-primary-foreground"
                href="/worlds"
              >
                {t('exploreWorlds')}
              </Link>
              <Link
                className="rounded-lg border border-border bg-card px-6 py-3"
                href="/dashboard"
              >
                {t('openNotebook')}
              </Link>
            </div>
            <p className="mt-5 text-muted-foreground text-sm">
              {t('inviteOnlyShort')}
            </p>
          </section>
          <div
            className="notebook-paper relative rotate-2 rounded-xl px-8 py-12 md:px-12"
            aria-hidden="true"
          >
            <Feather className="ml-auto size-12 -rotate-12 text-primary" />
            <p className="notebook-title my-10 text-3xl italic">
              {t('notebookQuote')}
            </p>
            <div className="flex justify-between border-border border-t pt-6">
              <BookOpen className="size-9" />
              <MapIcon className="size-9" />
              <Sparkles className="size-9" />
            </div>
          </div>
        </div>
        <section className="mt-24 grid gap-8 border-border border-t pt-10 sm:grid-cols-3">
          {(['charactersFeature', 'placesFeature', 'loreFeature'] as const).map(
            (key, i) => (
              <div key={key}>
                <p className="mb-3 text-muted-foreground text-xs">0{i + 1}</p>
                <h2 className="text-2xl">{t(key)}</h2>
                <p className="mt-3 text-muted-foreground leading-relaxed">
                  {t(`${key}Hint`)}
                </p>
              </div>
            )
          )}
        </section>
      </main>
    </div>
  );
}
