import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';

export async function Brand() {
  const t = await getTranslations('lettin');
  return (
    <header className="lettin-masthead">
      <div className="lettin-header-inner">
        <Link href="/" className="lettin-wordmark">
          Tulletin
        </Link>
        <nav aria-label={t('studioNavigation')}>
          <Link className="lettin-nav-link" href="/spaces">
            {t('spaces')}
          </Link>
          <Link className="lettin-nav-link" href="/worlds">
            {t('explore')}
          </Link>
          <Link className="lettin-nav-link" href="/saved">
            {t('savedNotebooks')}
          </Link>
          <Link className="lettin-nav-link lettin-nav-studio" href="/dashboard">
            {t('studio')}
          </Link>
        </nav>
      </div>
    </header>
  );
}
