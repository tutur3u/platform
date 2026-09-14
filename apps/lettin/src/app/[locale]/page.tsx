import { ArrowRight, Feather, Map as MapIcon, Sparkles } from '@tuturuuu/icons';
import { getTranslations } from 'next-intl/server';
import { Brand } from '@/components/brand';
import { Link } from '@/i18n/navigation';

function WorldSignal({
  bulletin,
  caption,
  fieldNote,
  quote,
  title,
}: {
  bulletin: string;
  caption: string;
  fieldNote: string;
  quote: string;
  title: string;
}) {
  return (
    <div className="lettin-signal-stage">
      <div className="lettin-orbit lettin-orbit-one" />
      <div className="lettin-orbit lettin-orbit-two" />
      <span className="lettin-signal-tab">{bulletin}</span>
      <div className="lettin-map-card">
        <div className="lettin-map-card-topline">
          <span>{title}</span>
          <span>27° 19′ N</span>
        </div>
        <svg
          aria-hidden="true"
          viewBox="0 0 560 420"
          className="lettin-map-art"
        >
          <path
            className="lettin-contour"
            d="M36 235C60 115 181 39 300 72c117 33 219 124 213 228-6 103-98 101-219 87C172 373 10 362 36 235Z"
          />
          <path
            className="lettin-contour lettin-contour-inner"
            d="M103 238c19-78 94-128 174-111 84 17 160 76 160 140 0 69-71 73-154 63-84-10-198-12-180-92Z"
          />
          <path
            className="lettin-route"
            d="M90 304c70-5 93-109 164-106 75 3 74 91 163 69"
          />
          <circle
            className="lettin-node lettin-node-a"
            cx="91"
            cy="304"
            r="14"
          />
          <circle
            className="lettin-node lettin-node-b"
            cx="254"
            cy="198"
            r="20"
          />
          <circle
            className="lettin-node lettin-node-c"
            cx="417"
            cy="267"
            r="11"
          />
          <path
            className="lettin-star"
            d="m440 86 11 25 27 4-20 18 5 27-23-14-24 14 6-27-21-18 28-4Z"
          />
        </svg>
        <div className="lettin-map-caption">
          <MapIcon className="size-5" />
          <p>{caption}</p>
        </div>
      </div>
      <div className="lettin-field-note">
        <span>{fieldNote}</span>
        <p>“{quote}”</p>
      </div>
    </div>
  );
}

export default async function Page() {
  const t = await getTranslations('lettin');
  return (
    <div className="notebook-theme min-h-screen">
      <Brand />
      <main>
        <section className="lettin-hero">
          <div className="lettin-hero-grid">
            <div className="lettin-hero-copy">
              <div className="lettin-issue-row">
                <p className="lettin-kicker">
                  <Sparkles className="size-4" />
                  {t('edition')}
                </p>
                <span>{t('archiveLabel')}</span>
              </div>
              <h1 className="lettin-hero-title">
                <span>{t('heroLineOne')}</span>
                <span>{t('heroLineTwo')}</span>
                <span className="lettin-hero-accent">{t('heroLineThree')}</span>
              </h1>
              <p className="lettin-deck">{t('heroDescription')}</p>
              <div className="lettin-hero-actions">
                <Link className="lettin-primary-link" href="/worlds">
                  {t('exploreWorlds')}
                  <ArrowRight className="size-4" />
                </Link>
                <Link className="lettin-secondary-link" href="/dashboard">
                  {t('openNotebook')}
                  <Feather className="size-4" />
                </Link>
              </div>
              <p className="lettin-invite-note">{t('inviteOnlyShort')}</p>
            </div>
            <WorldSignal
              bulletin={t('bulletin')}
              caption={t('signalCaption')}
              fieldNote={t('fieldNote')}
              quote={t('notebookQuote')}
              title={t('signalTitle')}
            />
          </div>
        </section>
        <div className="lettin-edition-strip" aria-hidden="true">
          <span>
            {t('tagline')} · {t('charactersFeature')} · {t('placesFeature')} ·{' '}
            {t('loreFeature')} · {t('tagline')}
          </span>
        </div>
        <section className="lettin-features">
          {(['charactersFeature', 'placesFeature', 'loreFeature'] as const).map(
            (key, i) => (
              <article
                className={`lettin-feature lettin-feature-${i + 1}`}
                key={key}
              >
                <p className="lettin-feature-number">
                  {t('fileNumber', { number: `0${i + 1}` })}
                </p>
                <div className="lettin-feature-glyph" aria-hidden="true">
                  {i === 0 ? '✦' : i === 1 ? '⌁' : '↗'}
                </div>
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
