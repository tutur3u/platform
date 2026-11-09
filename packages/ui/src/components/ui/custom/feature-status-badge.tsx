'use client';

import { cn } from '@tuturuuu/utils/format';
import type { ComponentProps } from 'react';
import { Badge } from '../badge';

export type FeatureStatusVariant = 'experimental' | 'beta';
export type FeatureStatusLocale = 'en' | 'vi';

const FEATURE_STATUS_LABELS = {
  experimental: {
    en: 'Experimental',
    vi: 'Thử nghiệm',
  },
  beta: {
    en: 'Beta',
    vi: 'Beta',
  },
} as const satisfies Record<
  FeatureStatusVariant,
  Record<FeatureStatusLocale, string>
>;

export type FeatureStatusBadgeProps = Omit<
  ComponentProps<'span'>,
  'children' | 'dangerouslySetInnerHTML'
> & {
  locale: FeatureStatusLocale;
  variant: FeatureStatusVariant;
};

export function FeatureStatusBadge({
  className,
  lang,
  locale,
  variant,
  ...props
}: FeatureStatusBadgeProps) {
  return (
    <Badge
      {...props}
      className={cn('shrink-0', className)}
      lang={lang ?? locale}
      variant="outline"
    >
      {FEATURE_STATUS_LABELS[variant][locale]}
    </Badge>
  );
}
