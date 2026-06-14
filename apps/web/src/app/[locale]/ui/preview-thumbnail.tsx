'use client';

import { cn } from '@tuturuuu/utils/format';
import { useEffect, useRef, useState } from 'react';
import { ComponentPreview, PreviewSkeleton } from './component-preview';
import type { ComponentEntry } from './component-registry';

/** Minimal, serializable slice of a registry entry needed to render a preview. */
export type PreviewEntry = Pick<ComponentEntry, 'id' | 'name' | 'importPath'>;

/**
 * Renders a live component preview, but only mounts it once the card scrolls
 * near the viewport. Avoids rendering all ~61 previews up front on the
 * components index.
 */
export function PreviewThumbnail({
  entry,
  className,
}: {
  entry: PreviewEntry;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    if (inView) return;
    const node = ref.current;
    if (!node) return;

    if (typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const observed of entries) {
          if (observed.isIntersecting) {
            setInView(true);
            observer.disconnect();
            break;
          }
        }
      },
      { rootMargin: '200px' }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [inView]);

  return (
    <div
      className={cn(
        'relative grid min-h-40 place-items-center overflow-hidden p-4',
        className
      )}
      ref={ref}
    >
      {inView ? <ComponentPreview entry={entry} /> : <PreviewSkeleton />}
    </div>
  );
}
