'use client';

import { Skeleton } from '@tuturuuu/ui/skeleton';
import dynamic from 'next/dynamic';
import type { PreviewEntry } from './preview-thumbnail';

const PreviewRender = dynamic(() => import('./preview-render'), {
  loading: () => <PreviewSkeleton />,
  ssr: false,
});

export function PreviewSkeleton() {
  return (
    <div className="grid w-full max-w-sm gap-3">
      <Skeleton className="h-9 w-32" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-2/3" />
    </div>
  );
}

export function ComponentPreview({ entry }: { entry: PreviewEntry }) {
  return <PreviewRender entry={entry} />;
}
