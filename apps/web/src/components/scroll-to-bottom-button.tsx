'use client';

import { useAtBottom } from '@/lib/hooks/use-at-bottom';
import { Button, type ButtonProps } from '@repo/ui/components/ui/button';
import { IconArrowDown } from '@repo/ui/components/ui/icons';
import { cn } from '@repo/ui/lib/utils';

export function ScrollToBottomButton({ className, ...props }: ButtonProps) {
  const isAtBottom = useAtBottom(50);

  return (
    <Button
      className={cn(
        'bg-background/20 backdrop-blur-lg transition-opacity duration-300',
        isAtBottom ? 'pointer-events-none opacity-0' : 'opacity-100',
        className
      )}
      onClick={() => {
        window.scrollTo({
          top: document.body.scrollHeight,
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
