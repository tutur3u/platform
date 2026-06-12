'use client';

import { cn } from '@tuturuuu/utils/format';
import type { ReactNode } from 'react';

export function AccentButton({
  children,
  disabled,
  onClick,
  radius,
}: {
  children: ReactNode;
  disabled?: boolean;
  onClick?: () => void;
  radius: string;
}) {
  return (
    <button
      className={cn(
        'inline-flex h-9 items-center justify-center gap-2 px-3 font-medium text-sm transition disabled:pointer-events-none disabled:opacity-50',
        'bg-primary text-primary-foreground hover:bg-primary/90',
        '[--accent-bg:var(--storefront-accent,var(--primary))] [--accent-fg:var(--storefront-accent-foreground,var(--primary-foreground))]',
        'bg-[var(--accent-bg)] text-[var(--accent-fg)] hover:opacity-90',
        radius
      )}
      disabled={disabled}
      onClick={onClick}
      type={onClick ? 'button' : 'submit'}
    >
      {children}
    </button>
  );
}
