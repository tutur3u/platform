import { BookOpen, Feather } from '@tuturuuu/icons';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
export async function Brand() {
  const t = await getTranslations('lettin');
  return (
    <header className="flex flex-wrap items-center justify-between gap-4 border-border border-b px-6 py-5 md:px-10">
      <Link
        href="/"
        className="notebook-title flex items-center gap-2 text-2xl"
      >
        <BookOpen className="size-6" />
        <span>
          <span className="text-muted-foreground">(Tu)</span>lettin
        </span>
      </Link>
      <nav className="flex items-center gap-6 text-sm">
        <Link href="/worlds">{t('explore')}</Link>
        <Link href="/dashboard" className="flex items-center gap-2">
          <Feather className="size-4" />
          {t('studio')}
        </Link>
      </nav>
    </header>
  );
}
