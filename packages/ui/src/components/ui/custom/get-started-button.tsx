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
      href={`/login${pathname !== '/' ? `?nextUrl=${encodeURIComponent(pathname)}` : ''}`}
    >
      <Button
        className={cn(
          hidden &&
            'pointer-events-none text-foreground/50 opacity-50 select-none'
        )}
      >
        {text}
      </Button>
    </Link>
  );
}
