import { cn } from '@tuturuuu/utils/format';
import type { ReactNode } from 'react';
import { type OpsTone, opsToneClasses } from './status-tone';

export interface StatePanelProps {
  /** Recovery control(s), e.g. a link to the fix or a retry button. */
  action?: ReactNode;
  className?: string;
  detail?: ReactNode;
  icon?: ReactNode;
  title: ReactNode;
  tone?: OpsTone;
}

/**
 * Empty, error, and unknown states. Lead with what is true and what to do
 * next; never imply data exists when it does not.
 */
export function StatePanel({
  action,
  className,
  detail,
  icon,
  title,
  tone = 'neutral',
}: StatePanelProps) {
  const classes = opsToneClasses[tone];

  return (
    <div
      className={cn(
        'flex flex-col items-start gap-3 rounded-lg border p-4 sm:flex-row sm:items-center',
        classes.soft,
        className
      )}
      data-tone={tone}
      role={tone === 'critical' ? 'alert' : 'status'}
    >
      {icon ? (
        <div className={cn('shrink-0 [&_svg]:size-5', classes.text)}>
          {icon}
        </div>
      ) : null}
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="font-medium text-foreground text-sm">{title}</p>
        {detail ? (
          <div className="text-muted-foreground text-sm">{detail}</div>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
