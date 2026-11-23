'use client';

import { LoadingPlaceholder } from '@tuturuuu/ui/loading-placeholder';
import { LoadingRegion, SkeletonList } from '@tuturuuu/ui/skeleton';
import { useTranslations } from 'next-intl';

/** Selected-admin summary; a placeholder while the admin list loads. */
export function AdminSummary({
  count,
  loading,
}: {
  count: number;
  loading: boolean;
}) {
  const t = useTranslations('common');
  if (loading) {
    return <LoadingPlaceholder className="w-28" srLabel={t('loading')} />;
  }
  return count > 0
    ? `${count} admin${count > 1 ? 's' : ''} selected`
    : 'Select administrators';
}

/** Stand-in for the admin options while the admin list loads. */
export function AdminListLoading() {
  const t = useTranslations('common');
  return (
    <LoadingRegion className="p-1" srLabel={t('loading')}>
      <SkeletonList rows={3} withAvatar={false} withSubtitle={false} />
    </LoadingRegion>
  );
}
