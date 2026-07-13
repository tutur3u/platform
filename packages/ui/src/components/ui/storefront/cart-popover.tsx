'use client';

import { ShoppingCart } from '@tuturuuu/icons';
import { cn } from '@tuturuuu/utils/format';
import type { CSSProperties, ReactNode } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '../popover';
import type { StorefrontSurfaceLabels } from './types';

export function StorefrontCartPopover({
  cartQuantity,
  children,
  labels,
  onOpenChange,
  open,
  radius,
}: {
  cartQuantity: number;
  children: ReactNode;
  labels: StorefrontSurfaceLabels;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  radius: string;
}) {
  const cartControlStyle: CSSProperties | undefined =
    cartQuantity > 0
      ? {
          borderColor: 'var(--storefront-accent-border, var(--border))',
          color: 'var(--storefront-accent-text, var(--primary))',
        }
      : undefined;

  return (
    <Popover onOpenChange={onOpenChange} open={open}>
      <PopoverTrigger asChild>
        <button
          aria-label={`${labels.cart}: ${cartQuantity}`}
          className={cn(
            'inline-flex h-11 min-w-14 shrink-0 items-center justify-center gap-2 border bg-card px-3 font-semibold text-sm tabular-nums transition hover:bg-muted/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
            radius
          )}
          style={cartControlStyle}
          type="button"
        >
          <ShoppingCart aria-hidden className="size-5 shrink-0" />
          <span className="sr-only">{labels.cart}: </span>
          <span className="min-w-4 text-center">{cartQuantity}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className={cn(
          'w-[min(calc(100vw-2rem),24rem)] border-border p-4 shadow-sm',
          radius
        )}
        sideOffset={10}
      >
        {children}
      </PopoverContent>
    </Popover>
  );
}
