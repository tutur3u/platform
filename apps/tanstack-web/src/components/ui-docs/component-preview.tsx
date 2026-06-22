'use client';

import { Skeleton } from '@tuturuuu/ui/skeleton';
import PreviewRender from './preview-render';
import type { PreviewEntry } from './preview-thumbnail';

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
