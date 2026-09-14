import { BookOpen, Feather, Map as MapIcon, Sparkles } from '@tuturuuu/icons';
import { getTranslations } from 'next-intl/server';
import { Brand } from '@/components/brand';
import { Link } from '@/i18n/navigation';
export default async function Page() {
  const t = await getTranslations('lettin');
  return (
    <div className="notebook-theme min-h-screen">
      <Brand />
      <main>
        <section className="lettin-hero">
          <div className="lettin-hero-grid">
            <div className="lettin-hero-copy">
              <p className="lettin-kicker">
                <Sparkles className="size-4" />
                {t('edition')}
              </p>
              <h1 className="lettin-hero-title">{t('heroTitle')}</h1>
              <p className="lettin-deck">{t('heroDescription')}</p>
              <div className="mt-10 flex flex-wrap gap-4">
                <Link className="lettin-primary-link" href="/worlds">
                  {t('exploreWorlds')}
                  <MapIcon className="size-4" />
                </Link>
                <Link className="lettin-secondary-link" href="/dashboard">
                  {t('openNotebook')}
                  <Feather className="size-4" />
                </Link>
              </div>
              <p className="mt-6 max-w-lg font-bold text-xs uppercase tracking-[0.14em]">
                {t('inviteOnlyShort')}
              </p>
            </div>
            <div className="lettin-hero-collage" aria-hidden="true">
              <span className="lettin-burst">{t('bulletin')}</span>
              <div className="lettin-poster">
                <div className="lettin-poster-icon">
                  <Feather className="size-10 -rotate-12" />
                </div>
                <p className="mt-10 border-foreground border-y-3 py-3 font-black text-xs uppercase tracking-[0.2em]">
                  {t('tagline')}
                </p>
                <p className="lettin-serif my-10 font-bold text-4xl italic leading-tight">
                  “{t('notebookQuote')}”
                </p>
                <div className="lettin-poster-rule">
                  <BookOpen className="size-9" />
                  <MapIcon className="size-9 justify-self-center" />
                  <Sparkles className="size-9 justify-self-end" />
                </div>
              </div>
            </div>
          </div>
        </section>
        <div className="lettin-edition-strip" aria-hidden="true">
          <span>
            {t('tagline')} · {t('charactersFeature')} · {t('placesFeature')} ·{' '}
            {t('loreFeature')} · {t('tagline')} · {t('charactersFeature')}
          </span>
        </div>
        <section className="lettin-features">
          {(['charactersFeature', 'placesFeature', 'loreFeature'] as const).map(
            (key, i) => (
              <article className="lettin-feature" key={key}>
                <p className="lettin-feature-number">
                  {t('fileNumber', { number: `0${i + 1}` })}
                </p>
                <h2>{t(key)}</h2>
                <p>{t(`${key}Hint`)}</p>
              </article>
            )
          )}
        </section>
      </main>
    </div>
  );
}
