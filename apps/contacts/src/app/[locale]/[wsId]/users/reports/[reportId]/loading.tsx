import {
  LoadingRegion,
  SkeletonCard,
  SkeletonLine,
} from '@tuturuuu/ui/skeleton';
import { getTranslations } from 'next-intl/server';

export default async function Loading() {
  const t = await getTranslations('common');

  return (
    <LoadingRegion srLabel={t('loading')} className="space-y-4">
      <SkeletonLine size="xl" barClassName="w-1/3" />
      <SkeletonCard lines={6} />
      <SkeletonCard lines={4} />
    </LoadingRegion>
  );
}
