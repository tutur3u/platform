'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { useAtBottom } from '@/lib/hooks/use-at-bottom';
import { Button, type ButtonProps } from '@/components/ui/button';
import { IconArrowDown } from '@/components/ui/icons';

export function ButtonScrollToBottom({ className, ...props }: ButtonProps) {
  const isAtBottom = useAtBottom();

  return (
    <Button
      className={cn(
        'bg-background/20 absolute bottom-20 right-4 z-10 backdrop-blur-lg transition-opacity duration-300 md:bottom-28 md:right-8',
        isAtBottom ? 'opacity-0' : 'opacity-100',
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
