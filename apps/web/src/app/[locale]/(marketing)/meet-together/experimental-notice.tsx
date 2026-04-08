'use client';

import { FlaskConical } from '@ncthub/ui/icons';
import { Separator } from '@ncthub/ui/separator';
import { useTranslations } from 'next-intl';
import { useTheme } from 'next-themes';

export default function ExperimentalNotice() {
  const t = useTranslations('experimental-notice');

  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme?.includes('dark');

  return (
    <div className="mx-4 mt-8 max-w-xl rounded-lg border border-dynamic-light-orange/20 bg-dynamic-light-orange/10 p-4 text-dynamic-orange md:p-8">
      <FlaskConical className="mx-auto h-16 w-16" />
      <Separator className="my-4 bg-dynamic-light-orange/20" />

      <p className="mb-2 text-center font-bold text-xl md:text-3xl">
        {t('experimental_feature')}
      </p>
      <p
        className={`text-center font-semibold text-xs md:text-sm ${isDark ? 'opacity-70' : 'opacity-80'}`}
      >
        {t('experimental_notice')}
      </p>
    </div>
  );
}
