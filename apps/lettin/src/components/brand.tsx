import { Feather } from '@tuturuuu/icons';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
export async function Brand() {
  const t = await getTranslations('lettin');
  return (
    <header className="lettin-masthead">
      <div className="mx-auto flex max-w-[90rem] flex-wrap items-center justify-between gap-5 px-5 py-4 md:px-10">
        <Link href="/" className="lettin-logo">
          <span className="lettin-brand-mark">
            <span>TL</span>
          </span>
          <span className="lettin-wordmark">Lettin</span>
          <span className="lettin-wordmark-note">{t('wordmarkNote')}</span>
        </Link>
        <p className="hidden border-primary-foreground/30 border-x px-6 font-bold text-[10px] uppercase tracking-[0.18em] lg:block">
          {t('masthead')}
        </p>
        <nav className="flex items-center gap-6">
          <Link className="lettin-nav-link" href="/worlds">
            {t('explore')}
          </Link>
          <Link
            href="/dashboard"
            className="lettin-nav-link flex items-center gap-2"
          >
            <Feather className="size-4" />
            {t('studio')}
          </Link>
        </nav>
      </div>
    </header>
  );
}
