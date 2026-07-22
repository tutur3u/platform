'use client';

import { cn } from '@tuturuuu/utils/format';
import { SlotText } from 'slot-text/react';

export function AnimatedSlotText({
  className,
  text,
}: {
  className?: string;
  text: string;
}) {
  return (
    <SlotText
      className={cn('line-clamp-1 break-all', className)}
      options={{ bounce: 0.1, duration: 180, stagger: 12 }}
      text={text}
    />
  );
}
