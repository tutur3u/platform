'use client';

import { CheckCircle2 } from '@tuturuuu/icons';
import { useTranslations } from 'next-intl';

export function TrustBadges() {
  const t = useTranslations('landing.hero.trust');

  const badges = [
    { key: 'openSource', label: t('openSource') },
    { key: 'commits', label: t('commits') },
    { key: 'free', label: t('free') },
  ];

  return (
    <div className="mt-8 flex flex-wrap items-center justify-center gap-4 text-foreground/50 text-sm sm:gap-6">
      {badges.map((badge) => (
        <div
          key={badge.key}
          className="flex items-center gap-2 transition-colors hover:text-foreground/70"
        >
          <CheckCircle2 className="h-4 w-4 text-dynamic-green" />
          <span>{badge.label}</span>
        </div>
      ))}
    </div>
  );
}
