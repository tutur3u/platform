'use client';

import { useTheme } from 'next-themes';
import useTranslation from 'next-translate/useTranslation';
import Link from 'next/link';

export default function GetStartedButton({ href }: { href: string }) {
  const { t } = useTranslation('home');
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme?.includes('dark');

  return (
    <div className="group relative inline-flex">
      <div
        className={`${
          isDark
            ? 'from-rose-400/60 to-orange-300/60'
            : 'from-rose-400 to-orange-300 dark:from-rose-400/60 dark:to-orange-300/60'
        } animate-tilt absolute -inset-px rounded-lg bg-gradient-to-r opacity-70 blur-lg transition-all group-hover:-inset-1 group-hover:opacity-100 group-hover:duration-200`}
      />
      <Link
        href={href}
        className={`${
          isDark
            ? 'from-rose-400/60 to-orange-300/60'
            : 'from-rose-400 to-orange-300 dark:from-rose-400/60 dark:to-orange-300/60'
        } relative inline-flex items-center justify-center rounded-lg bg-gradient-to-r px-8 py-2 font-bold text-white transition-all md:text-lg`}
      >
        {t('get-started')}
      </Link>
    </div>
  );
}
