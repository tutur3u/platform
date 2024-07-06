'use client';

import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function GetStartedButton() {
  const t = useTranslations();
  const pathname = usePathname();

  const hidden = pathname === '/login';

  return (
    <Link
      href={`/login${pathname !== '/' ? `?nextUrl=${encodeURIComponent(pathname)}` : ''}`}
      className={`border-border hover:bg-foreground/[0.025] dark:hover:bg-foreground/5 hidden flex-none rounded border px-4 py-1.5 text-sm transition duration-300 md:block md:text-base ${
        hidden
          ? 'text-foreground/50 pointer-events-none select-none opacity-50'
          : 'opacity-100'
      }`}
    >
      {t('common.get-started')}
    </Link>
  );
}
