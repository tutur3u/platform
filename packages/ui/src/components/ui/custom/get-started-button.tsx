'use client';

import { Button } from '../button';
import { cn } from '@tuturuuu/utils/format';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function GetStartedButton({
  text,
  href,
}: {
  text: string;
  href: string;
}) {
  const pathname = usePathname();
  const hidden = pathname === '/login';

  return (
    <Link href={href}>
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
