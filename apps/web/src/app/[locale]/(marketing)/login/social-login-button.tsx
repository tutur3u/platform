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
        'group relative h-12 w-full rounded-2xl border-border/60 bg-background font-medium shadow-sm transition-colors hover:bg-muted/40',
        className
      )}
      {...props}
    >
      <div className="absolute left-4 flex items-center justify-center text-foreground">
        {icon}
      </div>
      <span>{children}</span>
    </Button>
  );
}
