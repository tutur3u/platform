'use client';
import { cn } from '@tuturuuu/utils/format';
import type { ReactNode } from 'react';
import type { CallLayout } from './call-stage';

/** Fixed child slots preserve the sole media stage when collaboration opens. */
export function CollaborationStageLayout({
  content,
  stage,
  layout,
}: {
  content: ReactNode;
  stage: ReactNode;
  layout: CallLayout;
}) {
  const active = Boolean(content);
  return (
    <div
      className={cn(
        'flex h-full min-h-0 min-w-0 gap-2',
        active ? 'flex-col lg:flex-row' : ''
      )}
    >
      <div className={cn('min-h-0 min-w-0 flex-1', !active && 'hidden')}>
        {content}
      </div>
      <div
        className={cn(
          'min-h-0 min-w-0',
          !active
            ? 'flex-1'
            : layout === 'spotlight'
              ? 'h-32 shrink-0 lg:h-auto lg:w-44'
              : layout === 'grid'
                ? 'h-36 shrink-0 lg:h-auto lg:w-[40%]'
                : 'h-36 shrink-0 lg:h-auto lg:w-60'
        )}
      >
        {stage}
      </div>
    </div>
  );
}
