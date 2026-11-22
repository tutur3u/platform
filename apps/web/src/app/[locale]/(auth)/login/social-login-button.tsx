'use client';

import { History } from '@tuturuuu/icons/lucide-static';
import { Button } from '@tuturuuu/ui/button';
import { cn } from '@tuturuuu/utils/format';
import type * as React from 'react';

interface SocialLoginButtonProps extends React.ComponentProps<typeof Button> {
  /** A right-edge mark such as the "Last used" chip. */
  badge?: React.ReactNode;
  icon: React.ReactNode;
}

/**
 * The "Last used" mark: a chip from the small breakpoint up, a history icon
 * in the reserved right lane on phones. Its text is read as part of the
 * button name either way.
 */
export function LastUsedChip({ label }: { label: string }) {
  return (
    <>
      <span className="sr-only">, {label}</span>
      <span
        aria-hidden
        className="pointer-events-none absolute top-1/2 right-2.5 hidden h-6 max-w-24 -translate-y-1/2 items-center rounded-full bg-calendar-bg-blue px-2.5 font-bold text-dynamic-blue text-xs sm:inline-flex"
      >
        <span className="truncate">{label}</span>
      </span>
      <History
        aria-hidden
        className="absolute top-1/2 right-4 size-4 -translate-y-1/2 text-dynamic-blue sm:hidden"
      />
    </>
  );
}

export function SocialLoginButton({
  badge,
  children,
  className,
  icon,
  type = 'button',
  variant = 'outline',
  ...props
}: SocialLoginButtonProps) {
  return (
    <Button
      type={type}
      variant={variant}
      className={cn(
        // px-12 keeps fixed lanes for the left provider icon and a right-edge
        // mark, so a long or translated label truncates instead of meeting them.
        'group relative h-12 w-full rounded-full bg-card px-12 font-semibold text-[15px] transition-colors hover:bg-accent',
        // A chip keeps the label centred by trimming both lanes equally.
        badge ? 'sm:px-28' : null,
        className
      )}
      {...props}
    >
      <span className="absolute left-[18px] flex items-center justify-center text-foreground">
        {icon}
      </span>
      <span className="min-w-0 truncate">{children}</span>
      {badge}
    </Button>
  );
}
