'use client';

import { Rocket, Sparkles, Zap } from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { useTranslations } from 'next-intl';

export function PaygBanner() {
  const t = useTranslations('landing.pricing.payAsYouGo');

  const features = [
    { icon: Sparkles, label: t('features.0') },
    { icon: Zap, label: t('features.1') },
    { icon: Rocket, label: t('features.2') },
  ];

  return (
    <div className="rounded-xl border border-dynamic-cyan/20 bg-gradient-to-r from-dynamic-cyan/5 via-dynamic-blue/5 to-dynamic-purple/5 p-5">
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div className="flex items-start gap-3">
          <Badge
            variant="secondary"
            className="shrink-0 border-dynamic-cyan/30 bg-dynamic-cyan/10 text-dynamic-cyan"
          >
            {t('badge')}
          </Badge>
          <div>
            <h3 className="mb-1 font-semibold">{t('title')}</h3>
            <p className="text-foreground/60 text-sm">{t('description')}</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          {features.map((feature, index) => (
            <div
              key={index}
              className="flex items-center gap-1.5 text-foreground/60 text-sm"
            >
              <feature.icon className="h-4 w-4 text-dynamic-cyan" />
              <span>{feature.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
