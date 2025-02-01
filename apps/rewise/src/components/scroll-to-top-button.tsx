'use client';

import { useAtTop } from '@/lib/hooks/use-at-bottom';
import { Button, type ButtonProps } from '@repo/ui/components/ui/button';
import { IconArrowDown } from '@repo/ui/components/ui/icons';
import { cn } from '@repo/ui/lib/utils';
import { useEffect, useState } from 'react';

export function ScrollToTopButton({ className, ...props }: ButtonProps) {
  const isAtTop = useAtTop();
  const [element, setElement] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setElement(document.getElementById('main-content'));
    return () => {
      setElement(null);
    };
  }, []);

  if (!element) return null;

  return (
    <Button
      className={cn(
        'flex-none bg-background/20 backdrop-blur-lg transition-opacity duration-300',
        className
      )}
      onClick={() => {
        element.scrollTo({
          top: 0,
          behavior: 'smooth',
        });
      }}
      size="icon"
      variant="outline"
      disabled={isAtTop}
      {...props}
    >
      <IconArrowDown className="rotate-180" />
      <span className="sr-only">Scroll to top</span>
    </Button>
  );
}
