'use client';

import { cn } from '@tuturuuu/utils/format';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Button } from '../button';

export function GetStartedButton({
  text,
  href,
  disabled = false,
}: {
  text: string;
  href: string;
  disabled?: boolean;
}) {
  const pathname = usePathname();
  const hidden = pathname === '/login';

  return (
    // Signed-out visitors rarely follow this link, so prefetching it on every
    // page view only adds uncached sign-in requests.
    <Link href={href} prefetch={false}>
      <Button
        disabled={disabled}
        className={cn(
          hidden &&
            'pointer-events-none select-none bg-transparent text-foreground/50 opacity-50'
        )}
      >
        {text}
      </Button>
    </Link>
  );
}
