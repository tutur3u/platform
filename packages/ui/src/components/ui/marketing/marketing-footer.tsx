import { cn } from '@tuturuuu/utils/format';
import type { ReactNode } from 'react';
import { TuturuuLogo } from '../custom/tuturuuu-logo';

export interface MarketingFooterLink {
  href: string;
  label: string;
  external?: boolean;
}

export interface MarketingFooterColumn {
  id: string;
  title: string;
  links: MarketingFooterLink[];
}

interface MarketingFooterProps {
  appName: string;
  /** One-line positioning statement under the wordmark. */
  tagline: string;
  columns: MarketingFooterColumn[];
  /** Rendered at the bottom left, e.g. "© 2026 Tuturuuu". */
  legal: ReactNode;
  /** Locale switcher or social row, supplied by the host app. */
  utilities?: ReactNode;
  className?: string;
}

/** Shared satellite marketing footer: wordmark column plus link columns. */
export function MarketingFooter({
  appName,
  tagline,
  columns,
  legal,
  utilities,
  className,
}: MarketingFooterProps) {
  return (
    <footer
      className={cn(
        'relative border-foreground/[0.08] border-t px-4 py-16 sm:px-6 lg:px-8',
        className
      )}
    >
      <div className="mx-auto grid w-full max-w-6xl gap-12 lg:grid-cols-[1.5fr_repeat(3,1fr)]">
        <div className="max-w-sm">
          <div className="flex items-center gap-2.5">
            <TuturuuLogo className="h-7 w-7" height={28} width={28} />
            <span className="font-display font-semibold text-[0.95rem] tracking-[-0.01em]">
              {appName}
            </span>
          </div>
          <p className="mt-4 text-foreground/50 text-sm leading-relaxed">
            {tagline}
          </p>
        </div>

        {columns.map((column) => (
          <nav aria-label={column.title} key={column.id}>
            <h3 className="font-mono-ui text-[0.65rem] text-foreground/40 uppercase tracking-[0.2em]">
              {column.title}
            </h3>
            <ul className="mt-4 space-y-2.5">
              {column.links.map((link) => (
                <li key={`${column.id}-${link.href}`}>
                  <a
                    className="text-foreground/55 text-sm transition-colors hover:text-foreground"
                    href={link.href}
                    {...(link.external
                      ? { target: '_blank', rel: 'noopener noreferrer' }
                      : {})}
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>

      <div className="mx-auto mt-14 flex w-full max-w-6xl flex-col items-center justify-between gap-4 border-foreground/[0.06] border-t pt-8 sm:flex-row">
        <p className="text-foreground/40 text-xs">{legal}</p>
        {utilities ? (
          <div className="flex items-center gap-3">{utilities}</div>
        ) : null}
      </div>
    </footer>
  );
}
