'use client';

import { Button } from '@tuturuuu/ui/button';
import type { ReactNode } from 'react';
import { Link } from '@/i18n/navigation';

/** Keep Slot's link child in the client graph during streamed navigations. */
export function StorefrontHeaderLink({
  children,
  href,
}: {
  children: ReactNode;
  href: string;
}) {
  return (
    <Button asChild size="sm" variant="outline">
      <Link href={href}>{children}</Link>
    </Button>
  );
}
