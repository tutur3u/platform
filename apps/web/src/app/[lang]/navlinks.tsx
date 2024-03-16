'use client';

import useTranslation from 'next-translate/useTranslation';
import Link from 'next/link';

export default function Navlinks() {
  const { t } = useTranslation('common');

  return (
    <div className="left-1/2 top-1/2 hidden -translate-x-1/2 -translate-y-1/2 transform items-center justify-center gap-4 md:absolute md:flex md:gap-8">
      <Link href="/" className="opacity-50 hover:opacity-100">
        {t('home')}
      </Link>
      <Link href="/about" className="opacity-50 hover:opacity-100">
        {t('about')}
      </Link>
      <Link href="/members" className="opacity-50 hover:opacity-100">
        {t('members')}
      </Link>
      <Link href="/projects" className="opacity-50 hover:opacity-100">
        {t('projects')}
      </Link>
      <Link
        href="/calendar/meet-together"
        className="opacity-50 hover:opacity-100"
      >
        {t('meet-together')}
      </Link>
    </div>
  );
}
