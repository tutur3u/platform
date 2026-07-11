import { TuturuuLogo } from '@tuturuuu/ui/custom/tuturuuu-logo';
import { cn } from '@tuturuuu/utils/format';
import Link from 'next/link';

interface MailBrandProps {
  centralHref: string;
  className?: string;
  mailHref: string;
}

export function MailBrand({
  centralHref,
  className,
  mailHref,
}: MailBrandProps) {
  return (
    <div className={cn('flex min-w-0 items-center gap-2.5', className)}>
      <Link
        aria-label="Tuturuuu"
        className="flex size-9 shrink-0 items-center justify-center rounded-xl transition hover:bg-foreground/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        href={centralHref}
      >
        <TuturuuLogo alt="" className="size-8" height={32} width={32} />
      </Link>
      <span aria-hidden className="h-5 w-px shrink-0 bg-foreground/15" />
      <Link
        className="truncate rounded-md font-semibold text-lg tracking-tight transition hover:text-foreground/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        href={mailHref}
      >
        Mail
      </Link>
    </div>
  );
}
