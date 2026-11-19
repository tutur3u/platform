'use client';

import { Skeleton } from '@tuturuuu/ui/skeleton';
import { type ComponentProps, lazy, Suspense } from 'react';

const DescriptionEditor = lazy(() =>
  import('./task-description-editor').then((module) => ({
    default: module.TaskDescriptionEditor,
  }))
);

const ActivitySection = lazy(() =>
  import('../task-activity-section').then((module) => ({
    default: module.TaskActivitySection,
  }))
);

export function TaskDescriptionEditor(
  props: ComponentProps<typeof DescriptionEditor>
) {
  return (
    <Suspense
      fallback={
        <div aria-busy="true" className="min-h-64 space-y-3 px-4 md:px-8">
          <Skeleton className="h-4 w-11/12" />
          <Skeleton className="h-4 w-9/12" />
        </div>
      }
    >
      <DescriptionEditor {...props} />
    </Suspense>
  );
}

export function TaskActivitySection(
  props: ComponentProps<typeof ActivitySection>
) {
  return (
    <Suspense fallback={<Skeleton className="m-4 h-12" />}>
      <ActivitySection {...props} />
    </Suspense>
  );
}
