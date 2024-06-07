'use client';

import { Button, type ButtonProps } from '@/components/ui/button';
import { IconArrowDown } from '@/components/ui/icons';
import { useAtTop } from '@/lib/hooks/use-at-bottom';
import { cn } from '@/lib/utils';
import * as React from 'react';

export function ScrollToTopButton({ className, ...props }: ButtonProps) {
  const isAtTop = useAtTop();

  return (
    <Button
      className={cn(
        'bg-background/20 backdrop-blur-lg transition-opacity duration-300',
        isAtTop ? 'pointer-events-none opacity-0' : 'opacity-100',
        className
      )}
      onClick={() => {
        window.scrollTo({
          top: 0,
          behavior: 'smooth',
        });
      }}
      size="icon"
      variant="outline"
      {...props}
    >
      <IconArrowDown className="rotate-180" />
      <span className="sr-only">Scroll to top</span>
    </Button>
  );
}
