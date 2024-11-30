'use client';

import { useTranslations } from 'next-intl';
import Link from 'next/link';

export default function GetStartedButton({ href }: { href: string }) {
  const t = useTranslations('home');

  return (
    <div className="group relative inline-flex">
      <div className="from-dynamic-red/80 to-dynamic-orange/80 animate-tilt absolute -inset-px rounded-lg bg-gradient-to-r opacity-70 blur-lg transition-all group-hover:-inset-1 group-hover:opacity-100 group-hover:duration-200" />
      <Link
        href={href}
        className="from-dynamic-red/60 to-dynamic-orange/60 relative inline-flex items-center justify-center rounded-lg bg-gradient-to-r px-8 py-2 font-bold text-white transition-all md:text-lg"
      >
        {t('get-started')}
      </Link>
    </div>
  );
}
