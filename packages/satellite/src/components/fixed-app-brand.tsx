import { ChevronDown } from '@tuturuuu/icons';
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
  launcherLabel?: string;
  onAppClick?: () => void;
}

export function FixedAppBrand({
  actions,
  appHref,
  appName,
  centralHref,
  className,
  launcherLabel = 'Open apps',
  onAppClick,
}: FixedAppBrandProps) {
  const appControl = onAppClick ? (
    <button
      aria-haspopup="dialog"
      aria-label={launcherLabel}
      className="group flex min-w-0 items-center gap-1.5 rounded-lg px-1.5 py-1 font-semibold text-lg tracking-tight transition hover:bg-foreground/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      onClick={onAppClick}
      type="button"
    >
      <span className="truncate">{appName}</span>
      <ChevronDown
        aria-hidden
        className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-y-0.5"
      />
    </button>
  ) : (
    <Link
      className="min-w-0 truncate rounded-md font-semibold text-lg tracking-tight transition hover:text-foreground/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      href={appHref}
    >
      {appName}
    </Link>
  );

  return (
    <div className={cn('flex min-w-0 flex-1 items-center gap-2.5', className)}>
      <Link
        aria-label="Tuturuuu"
        className="flex size-9 shrink-0 items-center justify-center rounded-xl transition hover:bg-foreground/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        href={centralHref}
      >
        <TuturuuLogo alt="" className="size-8" height={32} width={32} />
      </Link>
      <span
        aria-hidden
        className="h-5 w-px shrink-0 self-center rounded-full bg-foreground/10"
      />
      {appControl}
      {actions ? <div className="ml-auto flex-none">{actions}</div> : null}
    </div>
  );
}
