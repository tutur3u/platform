'use client';

import { ArrowLeft, Loader2 } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { useState } from 'react';
import { Link } from '@/i18n/navigation';

export function ReturnToStoreButton({
  href,
  label,
  pendingLabel,
}: {
  href: string;
  label: string;
  pendingLabel: string;
}) {
  const [isNavigating, setIsNavigating] = useState(false);

  return (
    <Button
      aria-busy={isNavigating}
      asChild
      className="mt-5 h-11 w-full"
      variant="outline"
    >
      <Link
        aria-disabled={isNavigating}
        className={isNavigating ? 'pointer-events-none' : undefined}
        href={href}
        onClick={(event) => {
          if (isNavigating) {
            event.preventDefault();
            return;
          }
          setIsNavigating(true);
        }}
        prefetch
      >
        {isNavigating ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <ArrowLeft className="size-4" />
        )}
        {isNavigating ? pendingLabel : label}
      </Link>
    </Button>
  );
}
