'use client';

import {
  LoadingRegion,
  SkeletonLine,
  SkeletonList,
} from '@tuturuuu/ui/skeleton';
import { useTranslations } from 'next-intl';

/** Page-level placeholder: a heading line and a list of rows. */
export function LettinPageLoading({ className }: { className?: string }) {
  const t = useTranslations('lettin');
  return (
    <LoadingRegion className={className} srLabel={t('loading')}>
      <SkeletonLine barClassName="w-1/3" size="xl" />
      <SkeletonList className="mt-4" rows={5} withAvatar={false} />
    </LoadingRegion>
  );
}

/** Section-level placeholder for a list that is still loading. */
export function LettinListLoading() {
  const t = useTranslations('lettin');
  return (
    <LoadingRegion srLabel={t('loading')}>
      <SkeletonList rows={4} />
    </LoadingRegion>
  );
}
