'use client';

import { FlaskConical } from '@tuturuuu/icons';
import { Separator } from '@tuturuuu/ui/separator';
import { useTranslations } from 'next-intl';
import { useTheme } from 'next-themes';

export default function ExperimentalNotice() {
  const t = useTranslations('experimental-notice');

  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme?.includes('dark');

  return (
    <div
      className={`${
        isDark
          ? 'border-orange-300/20 bg-orange-300/10 text-orange-300'
          : 'border-amber-600/20 bg-amber-600/10 text-amber-600 dark:border-orange-300/20 dark:bg-orange-300/10 dark:text-orange-300'
      } mx-4 mt-8 max-w-xl rounded-lg border p-4 text-foreground md:p-8`}
    >
      <FlaskConical className="mx-auto h-16 w-16" />
      <Separator
        className={`${isDark ? 'bg-orange-300/20' : 'bg-amber-600/20 dark:bg-orange-300/20'} my-4`}
      />

      <p className="mb-2 text-center font-bold text-xl md:text-3xl">
        {t('experimental_feature')}
      </p>
      <p
        className={`text-center font-semibold text-xs md:text-sm ${
          isDark ? 'opacity-70' : 'opacity-80'
        }`}
      >
        {t('experimental_notice')}
      </p>
    </div>
  );
}
