import { cn } from '@tuturuuu/utils/format';
import type { ReactNode } from 'react';

interface SettingsSectionProps {
  title?: ReactNode;
  description?: ReactNode;
  /** Control aligned with the section heading. */
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Flat collections provide their own row dividers. */
  surface?: 'card' | 'plain';
}

/**
 * Groups related settings into one card, with `SettingItemTab` rows divided by
 * hairlines. A `<form>` wrapping the rows inside the card keeps the dividers.
 */
export function SettingsSection({
  title,
  description,
  action,
  children,
  className,
  surface = 'card',
}: SettingsSectionProps) {
  const hasHeader = title || description || action;

  return (
    <section className={cn('space-y-3', className)}>
      {hasHeader && (
        <div className="flex items-end justify-between gap-4">
          <div className="min-w-0 space-y-0.5">
            {title && (
              <h3 className="font-semibold text-base tracking-tight">
                {title}
              </h3>
            )}
            {description && (
              <p className="text-muted-foreground text-sm">{description}</p>
            )}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      <div
        className={
          surface === 'card'
            ? 'divide-y rounded-xl border bg-card [&>form]:divide-y'
            : undefined
        }
        data-slot={surface === 'card' ? 'settings-card' : 'settings-content'}
      >
        {children}
      </div>
    </section>
  );
}

/** Free-form content in a card, aligned with the rows around it. */
export function SettingsSectionBlock({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn('px-4 py-4 md:px-5', className)}>{children}</div>;
}

/** Trailing actions of a card, such as its save button. */
export function SettingsSectionFooter({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-wrap justify-end gap-2 px-4 py-3 md:px-5',
        className
      )}
    >
      {children}
    </div>
  );
}

const MESSAGE_TONES = {
  default: 'text-foreground',
  error: 'text-dynamic-red',
  muted: 'text-muted-foreground',
} as const;

/** Empty, loading or error state in a card, with an optional retry action. */
export function SettingsSectionMessage({
  action,
  children,
  className,
  icon,
  role,
  tone = 'muted',
}: {
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  icon?: ReactNode;
  /** Set for a non-error tone that must still be announced. */
  role?: 'alert';
  tone?: keyof typeof MESSAGE_TONES;
}) {
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-4 px-4 py-6 text-sm md:px-5',
        className
      )}
      role={role ?? (tone === 'error' ? 'alert' : undefined)}
    >
      <div
        className={cn('flex min-w-0 items-center gap-2', MESSAGE_TONES[tone])}
      >
        {icon}
        <div className="min-w-0">{children}</div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
