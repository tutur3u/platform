'use client';

import {
  TUTURUUU_LOCAL_LOGO_URL,
  TuturuuLogo,
} from '@tuturuuu/ui/custom/tuturuuu-logo';
import { cn } from '@tuturuuu/utils/format';
import Link from 'next/link';

export function FormBrandFooter({ className }: { className?: string }) {
  return (
    <Link
      href="/home"
      aria-label="Go to Tuturuuu home"
      className={cn(
        'group mx-auto flex w-fit items-center gap-3 rounded-full px-2 py-1 text-muted-foreground transition-all hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        className
      )}
    >
      <TuturuuLogo
        src={TUTURUUU_LOCAL_LOGO_URL}
        width={32}
        height={32}
        alt="Tuturuuu"
        className="h-8 w-8 object-contain transition-transform duration-200 group-hover:scale-[1.04]"
      />
      <div className="flex translate-y-0.5 flex-col text-left leading-none">
        <span className="text-[10px] uppercase tracking-[0.24em] transition-colors group-hover:text-foreground/80">
          Tuturuuu
        </span>
        <span className="font-semibold text-lg uppercase tracking-[0.08em]">
          Forms
        </span>
      </div>
    </Link>
  );
}
