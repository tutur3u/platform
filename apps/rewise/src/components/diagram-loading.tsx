'use client';

import { LoadingRegion, Skeleton } from '@tuturuuu/ui/skeleton';
import { useTranslations } from 'next-intl';

/** Placeholder for a Mermaid diagram that is still rendering. */
export function DiagramLoading() {
  const t = useTranslations('ai_chat');
  return (
    <LoadingRegion srLabel={t('diagram_loading')}>
      <Skeleton className="h-40 w-full rounded-lg" />
    </LoadingRegion>
  );
}
