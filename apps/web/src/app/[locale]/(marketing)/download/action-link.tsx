import { ExternalLink } from '@tuturuuu/icons/lucide-static';
import { cn } from '@tuturuuu/utils/format';
import type { ReactNode } from 'react';
import type { DownloadAction } from './download-option';

export function ActionLink({
  action,
  newTabLabel,
  className,
  compact = false,
  children,
}: {
  action: DownloadAction;
  newTabLabel: string;
  className?: string;
  compact?: boolean;
  children?: ReactNode;
}) {
  return (
    <a
      href={action.href}
      aria-label={
        compact && action.shortLabel
          ? `${action.label}${action.external ? ` ${newTabLabel}` : ''}`
          : undefined
      }
      className={cn(
        'focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2',
        className
      )}
      {...(action.external
        ? { target: '_blank', rel: 'noopener noreferrer' }
        : {})}
    >
      {children}
      {compact && action.shortLabel ? action.shortLabel : action.label}
      {action.external && (
        <>
          <ExternalLink className="size-4 shrink-0" aria-hidden="true" />
          <span className="sr-only">{newTabLabel}</span>
        </>
      )}
    </a>
  );
}
