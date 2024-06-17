'use client';

import { useAtTop } from '@/lib/hooks/use-at-bottom';
import { Button, type ButtonProps } from '@repo/ui/components/ui/button';
import { IconArrowDown } from '@repo/ui/components/ui/icons';
import { cn } from '@repo/ui/lib/utils';

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
