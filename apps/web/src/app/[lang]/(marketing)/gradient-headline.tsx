'use client';

import { useTheme } from 'next-themes';
import useTranslation from 'next-translate/useTranslation';

export default function GradientHeadline() {
  const { t } = useTranslation('home');
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme?.includes('dark');

  return (
    <span
      className={`${
        isDark
          ? 'from-pink-300 via-amber-300 to-blue-300'
          : 'from-pink-500 via-yellow-500 to-sky-600 dark:from-pink-300 dark:via-amber-300 dark:to-blue-300'
      } bg-gradient-to-r bg-clip-text text-transparent`}
    >
      {t('headline-p2')}
    </span>
  );
}
