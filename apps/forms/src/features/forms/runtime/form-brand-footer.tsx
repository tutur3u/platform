'use client';

import { TuturuuuWordmark } from '@tuturuuu/ui/custom/tuturuuu-wordmark';
import { cn } from '@tuturuuu/utils/format';
import Link from 'next/link';

export function FormBrandFooter({ className }: { className?: string }) {
  return (
    <Link
      href="/home"
      aria-label="Tuturuuu Forms"
      className={cn(
        'group mx-auto flex w-fit items-center rounded-full px-2 py-1 text-muted-foreground transition-all hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        className
      )}
    >
      <TuturuuuWordmark
        className="transition-transform duration-200 group-hover:scale-[1.02]"
        product="Forms"
      />
    </Link>
  );
}
