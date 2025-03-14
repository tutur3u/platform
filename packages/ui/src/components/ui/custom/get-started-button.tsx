'use client';

import { Button } from '../button';
import { cn } from '@tuturuuu/utils/format';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function GetStartedButton({ text }: { text: string }) {
  const pathname = usePathname();
  const hidden = pathname === '/login';

  return (
    <Link
      href={
        hidden
          ? '/login'
          : `/login${pathname !== '/' ? `?nextUrl=${encodeURIComponent(pathname)}` : ''}`
      }
    >
      <Button
        className={cn(
          hidden &&
            'text-foreground/50 pointer-events-none select-none bg-transparent opacity-50'
        )}
      >
        {text}
      </Button>
    </Link>
  );
}
