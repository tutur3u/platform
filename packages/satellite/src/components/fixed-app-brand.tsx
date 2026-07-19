import { TuturuuLogo } from '@tuturuuu/ui/custom/tuturuuu-logo';
import { cn } from '@tuturuuu/utils/format';
import Link from 'next/link';
import type { ReactNode } from 'react';

interface FixedAppBrandProps {
  actions?: ReactNode;
  appHref: string;
  appName: ReactNode;
  centralHref: string;
  className?: string;
}

export function FixedAppBrand({
  actions,
  appHref,
  appName,
  centralHref,
  className,
}: FixedAppBrandProps) {
  return (
    <div className={cn('flex min-w-0 flex-1 items-center gap-2.5', className)}>
      <Link
        aria-label="Tuturuuu"
        className="flex size-9 shrink-0 items-center justify-center rounded-xl transition hover:bg-foreground/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        href={centralHref}
      >
        <TuturuuLogo alt="" className="size-8" height={32} width={32} />
      </Link>
      <span aria-hidden className="h-5 w-px shrink-0 bg-foreground/15" />
      <Link
        className="min-w-0 truncate rounded-md font-semibold text-lg tracking-tight transition hover:text-foreground/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        href={appHref}
      >
        {appName}
      </Link>
      {actions ? <div className="ml-auto flex-none">{actions}</div> : null}
    </div>
  );
}
