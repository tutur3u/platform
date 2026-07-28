'use client';

import { useVirtualizer } from '@tanstack/react-virtual';
import { cn } from '@tuturuuu/utils/format';
import { useMemo, useRef } from 'react';

const LINE_HEIGHT = 24;

export function RepositoryVirtualSource({
  className,
  source,
}: {
  className?: string;
  source: string;
}) {
  const lines = useMemo(() => source.split('\n'), [source]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: lines.length,
    estimateSize: () => LINE_HEIGHT,
    getScrollElement: () => scrollRef.current,
    initialRect: { height: 600, width: 1200 },
    overscan: 12,
  });

  return (
    <div
      className={cn(
        'max-h-[75vh] overflow-auto overscroll-contain font-mono text-[13px] leading-6',
        className
      )}
      ref={scrollRef}
      style={{ contain: 'strict', height: Math.min(lines.length * 24, 600) }}
    >
      <div
        className="relative min-w-full"
        style={{ height: virtualizer.getTotalSize() }}
      >
        {virtualizer.getVirtualItems().map((virtualLine) => (
          <div
            className="absolute top-0 left-0 grid h-6 w-max min-w-full grid-cols-[auto_1fr]"
            key={virtualLine.key}
            style={{ transform: `translateY(${virtualLine.start}px)` }}
          >
            <span
              aria-hidden
              className="sticky left-0 min-w-14 select-none border-r bg-background/95 px-3 text-right text-muted-foreground/55"
            >
              {virtualLine.index + 1}
            </span>
            <code className="whitespace-pre px-4">
              {lines[virtualLine.index] || ' '}
            </code>
          </div>
        ))}
      </div>
    </div>
  );
}
