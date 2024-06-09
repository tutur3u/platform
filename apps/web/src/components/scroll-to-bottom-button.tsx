'use client';

import { Button, type ButtonProps } from '@/components/ui/button';
import { IconArrowDown } from '@/components/ui/icons';
import { useAtBottom } from '@/lib/hooks/use-at-bottom';
import { cn } from '@/lib/utils';
import * as React from 'react';

export function ScrollToBottomButton({ className, ...props }: ButtonProps) {
  const isAtBottom = useAtBottom();

  return (
    <Button
      className={cn(
        'bg-background/20 backdrop-blur-lg transition-opacity duration-300',
        isAtBottom ? 'pointer-events-none opacity-0' : 'opacity-100',
        className
      )}
      onClick={() => {
        window.scrollTo({
          top: document.body.offsetHeight,
          behavior: 'smooth',
        });
      }}
      size="icon"
      variant="outline"
      {...props}
    >
      <IconArrowDown />
      <span className="sr-only">Scroll to bottom</span>
    </Button>
  );
}
