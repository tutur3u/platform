'use client';

import useTranslation from 'next-translate/useTranslation';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function Navlinks() {
  const { t } = useTranslation('common');
  const pathname = usePathname();

  if (pathname === '/calendar/meet-together') return null;
  if (pathname !== '/' && pathname !== '/branding') return null;

  return (
    <div className="inset-0 hidden items-center justify-center gap-4 md:absolute md:grid">
      <Link
        href="/calendar/meet-together"
        className="opacity-50 hover:opacity-100"
      >
        {t('meet-together')}
      </Link>
    </div>
  );
}
