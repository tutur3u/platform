'use client';

import { Button } from '@tuturuuu/ui/button';
import { cn } from '@tuturuuu/utils/format';
import type * as React from 'react';

interface SocialLoginButtonProps extends React.ComponentProps<typeof Button> {
  icon: React.ReactNode;
}

export function SocialLoginButton({
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
        // px-12 keeps fixed lanes for the left provider icon and a right-edge mark,
        // so a long or translated label truncates instead of meeting them.
        'group relative h-12 w-full rounded-2xl border-border bg-background px-12 font-medium transition-colors hover:bg-muted/40',
        className
      )}
      {...props}
    >
      <div className="absolute left-4 flex items-center justify-center text-foreground">
        {icon}
      </div>
      <span className="min-w-0 truncate">{children}</span>
    </Button>
  );
}
