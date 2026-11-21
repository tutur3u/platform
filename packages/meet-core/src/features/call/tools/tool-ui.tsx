'use client';

import { Loader2, X } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { cn } from '@tuturuuu/utils/format';
import type { ComponentProps, ComponentType, ReactNode } from 'react';

type Icon = ComponentType<{ className?: string }>;

/** The one in-call action style: a pill with a 16px icon before a short label. */
export const toolActionClass = 'h-8 gap-1.5 rounded-full px-3.5';

export function ToolAction({
  icon: Icon,
  label,
  busy,
  variant = 'outline',
  className,
  ...props
}: Omit<ComponentProps<typeof Button>, 'children' | 'size'> & {
  icon: Icon;
  label: string;
  busy?: boolean;
}) {
  return (
    <Button
      type="button"
      size="sm"
      variant={variant}
      className={cn(toolActionClass, className)}
      aria-busy={busy || undefined}
      {...props}
      disabled={props.disabled || busy}
    >
      {busy ? (
        <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />
      ) : (
        <Icon className="size-4" />
      )}
      {label}
    </Button>
  );
}

export function ToolIconAction({
  icon: Icon,
  label,
  className,
  ...props
}: Omit<ComponentProps<typeof Button>, 'children' | 'size' | 'variant'> & {
  icon: Icon;
  label: string;
}) {
  return (
    <Button
      type="button"
      size="icon"
      variant="ghost"
      aria-label={label}
      title={label}
      className={cn(
        'size-8 shrink-0 rounded-full pointer-coarse:size-11',
        className
      )}
      {...props}
    >
      <Icon className="size-4" />
    </Button>
  );
}

/** Shared header for every in-call side panel: icon, title and a close action. */
export function CallPanelHeader({
  icon: Icon,
  title,
  subtitle,
  closeLabel,
  onClose,
  actions,
}: {
  icon: Icon;
  title: string;
  subtitle?: ReactNode;
  closeLabel: string;
  onClose: () => void;
  actions?: ReactNode;
}) {
  return (
    <header className="flex items-center gap-3 border-b px-4 py-2.5">
      <span
        aria-hidden="true"
        className="grid size-8 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground"
      >
        <Icon className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="truncate font-semibold text-foreground text-sm">
          {title}
        </h2>
        {subtitle ? (
          <p className="flex items-center gap-1.5 text-muted-foreground text-xs">
            {subtitle}
          </p>
        ) : null}
      </div>
      {actions}
      <ToolIconAction icon={X} label={closeLabel} onClick={onClose} />
    </header>
  );
}
