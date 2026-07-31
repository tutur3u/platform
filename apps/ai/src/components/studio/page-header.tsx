import { Badge } from '@tuturuuu/ui/badge';
import { cn } from '@tuturuuu/utils/format';
import type { ReactNode } from 'react';

/**
 * The single page header for every AI Studio section.
 *
 * Deliberately flat (a rule, not a card) so the section content below is the
 * heaviest surface on the page.
 */
export function StudioPageHeader({
  actions,
  badge,
  className,
  description,
  eyebrow,
  title,
}: {
  actions?: ReactNode;
  badge?: string;
  className?: string;
  description?: ReactNode;
  eyebrow?: string;
  title: string;
}) {
  return (
    <header
      className={cn(
        'flex flex-col gap-4 border-b pb-4 md:flex-row md:items-end md:justify-between md:gap-8',
        className
      )}
    >
      <div className="min-w-0">
        {eyebrow || badge ? (
          <div className="mb-2 flex flex-wrap items-center gap-2">
            {eyebrow ? (
              <span className="font-medium text-muted-foreground text-xs uppercase tracking-[0.08em]">
                {eyebrow}
              </span>
            ) : null}
            {badge ? (
              <Badge className="font-normal text-[0.7rem]" variant="outline">
                {badge}
              </Badge>
            ) : null}
          </div>
        ) : null}
        <h1 className="text-balance font-semibold text-2xl tracking-tight sm:text-[1.75rem]">
          {title}
        </h1>
        {description ? (
          <p className="mt-2 max-w-2xl text-muted-foreground text-sm leading-relaxed">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {actions}
        </div>
      ) : null}
    </header>
  );
}
