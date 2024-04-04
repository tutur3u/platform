'use client';

import useTranslation from 'next-translate/useTranslation';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function Navlinks() {
  const { t } = useTranslation('common');
  const pathname = usePathname();

  if (pathname === '/calendar/meet-together') return null;
  if (
    pathname !== '/' &&
    pathname !== '/branding' &&
    !pathname.startsWith('/calendar/meet-together/')
  )
    return null;

  return (
    <div className="left-1/2 top-1/2 hidden -translate-x-1/2 -translate-y-1/2 transform items-center justify-center gap-4 md:absolute md:flex">
      <Link
        href="/calendar/meet-together"
        className="opacity-50 hover:opacity-100"
      >
        {t('meet-together')}
      </Link>
      <Link
        href="https://docs.tuturuuu.com"
        className="opacity-50 hover:opacity-100"
        target="_blank"
      >
        {t('docs')}
      </Link>
    </div>
  );
}
