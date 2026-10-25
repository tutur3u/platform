'use client';

import { type ComponentProps, lazy, Suspense } from 'react';
import type { FloatingComposer } from './floating-composer';

// The composer brings the rich-text editor stack with it; loading it on demand
// keeps that out of the folder view's first download.
const LoadedFloatingComposer = lazy(() =>
  import('./floating-composer').then((module) => ({
    default: module.FloatingComposer,
  }))
);

export function LazyFloatingComposer(
  props: ComponentProps<typeof FloatingComposer>
) {
  return (
    <Suspense fallback={null}>
      <LoadedFloatingComposer {...props} />
    </Suspense>
  );
}
