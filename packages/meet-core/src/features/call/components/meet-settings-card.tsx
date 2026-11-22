'use client';
import { Label } from '@tuturuuu/ui/label';
import { Switch } from '@tuturuuu/ui/switch';
import { cn } from '@tuturuuu/utils/format';
import type { ComponentProps, ReactNode } from 'react';

/**
 * Shared spacing for Meet settings pages and the in-room panels that reuse
 * their cards: 12px between stacked cards, 16px (20px from `sm`) inside a card
 * and 16px between a card's header and its controls.
 */
export function MeetSettingsStack({
  className,
  ...props
}: ComponentProps<'div'>) {
  return <div className={cn('flex flex-col gap-3', className)} {...props} />;
}

export function MeetSettingsCard({
  className,
  ...props
}: ComponentProps<'section'>) {
  return (
    <section
      data-slot="meet-settings-card"
      className={cn(
        'flex min-w-0 flex-col gap-4 rounded-xl border bg-card p-4 sm:p-5',
        className
      )}
      {...props}
    />
  );
}

/** A card or group heading: title, then a one-line description 4px below. */
export function MeetSettingsHeading({
  icon,
  title,
  description,
  action,
  id,
}: {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  /** Trailing control, such as a badge. */
  action?: ReactNode;
  id?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="grid min-w-0 gap-1">
        <h3
          id={id}
          className="flex min-w-0 items-center gap-2 font-semibold text-sm"
        >
          {icon && (
            <span className="shrink-0 text-muted-foreground">{icon}</span>
          )}
          {title}
        </h3>
        {description && (
          <p className="text-muted-foreground text-sm">{description}</p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

/** One labelled switch with its hint; the label names the switch. */
export function MeetSettingsToggle({
  id,
  icon,
  label,
  hint,
  checked,
  disabled,
  onCheckedChange,
  className,
}: {
  id: string;
  icon?: ReactNode;
  label: ReactNode;
  hint?: ReactNode;
  checked: boolean;
  disabled?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  className?: string;
}) {
  const hintId = hint ? `${id}-hint` : undefined;
  return (
    <div className={cn('flex items-start justify-between gap-3', className)}>
      <div className="grid min-w-0 gap-1">
        <Label
          htmlFor={id}
          className="flex min-w-0 items-center gap-2 font-medium text-sm leading-5"
        >
          {icon && (
            <span className="shrink-0 text-muted-foreground">{icon}</span>
          )}
          {label}
        </Label>
        {hint && (
          <p id={hintId} className="text-muted-foreground text-sm">
            {hint}
          </p>
        )}
      </div>
      <Switch
        id={id}
        aria-describedby={hintId}
        checked={checked}
        disabled={disabled}
        onCheckedChange={onCheckedChange}
        className="mt-0.5 shrink-0"
      />
    </div>
  );
}
