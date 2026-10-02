import { ArrowRight } from '@tuturuuu/icons';
import { getTranslations } from 'next-intl/server';
import { Brand } from '@/components/brand';
import { CreativeAtlas } from '@/components/creative-atlas';
import { CreativeSpaces } from '@/components/creative-spaces';
import { Link } from '@/i18n/navigation';

export default async function Page() {
  const t = await getTranslations('lettin');
  return (
    <div className="notebook-theme min-h-screen">
      <Brand />
      <main className="creator-home">
        <section className="creator-hero">
          <div className="creator-hero-copy">
            <h1 className="creator-hero-title">{t('homeTitle')}</h1>
            <p className="creator-hero-description">{t('heroDescription')}</p>
            <div className="lettin-hero-actions">
              <Link className="lettin-primary-link" href="/dashboard">
                {t('openNotebook')}
                <ArrowRight size={16} />
              </Link>
              <Link className="lettin-secondary-link" href="/worlds">
                {t('exploreWorlds')}
              </Link>
            </div>
            <p className="lettin-invite-note">{t('inviteOnlyShort')}</p>
          </div>
          <CreativeAtlas />
        </section>
        <CreativeSpaces />
      </main>
      <footer className="creator-footer">
        <span className="lettin-wordmark">Tulletin</span>
        <p>{t('footerNote')}</p>
      </footer>
    </div>
  );
}
