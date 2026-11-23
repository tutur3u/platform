'use client';

import {
  LoadingRegion,
  SkeletonLine,
  SkeletonText,
} from '@tuturuuu/ui/skeleton';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';

/** Heading line and paragraph placeholder for a page-level load. */
export function PageLoading({ className }: { className?: string }) {
  const t = useTranslations('common');
  return (
    <LoadingRegion
      className={cn('space-y-4 p-8', className)}
      srLabel={t('loading')}
    >
      <SkeletonLine barClassName="w-1/3" size="xl" />
      <SkeletonText lines={5} />
    </LoadingRegion>
  );
}
