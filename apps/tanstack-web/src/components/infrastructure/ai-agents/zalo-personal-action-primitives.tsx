'use client';

import { Loader2 } from '@tuturuuu/icons';
import type { AiAgentZaloPersonalAction } from '@tuturuuu/internal-api/infrastructure/ai';
import { Button } from '@tuturuuu/ui/button';
import { cn } from '@tuturuuu/utils/format';
import type * as React from 'react';

export function StatusLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-md border border-border bg-background px-3 py-2">
      <div className="text-muted-foreground text-xs">{label}</div>
      <div className="truncate font-mono text-xs">{value}</div>
    </div>
  );
}

export function ActionButton({
  disabled,
  icon,
  label,
  loading,
  onClick,
  pendingAction,
  targetAction,
  variant = 'outline',
}: {
  disabled?: boolean;
  icon: React.ReactNode;
  label: string;
  loading?: boolean;
  onClick: () => void;
  pendingAction?: AiAgentZaloPersonalAction;
  targetAction: AiAgentZaloPersonalAction;
  variant?: React.ComponentProps<typeof Button>['variant'];
}) {
  const active = loading && pendingAction === targetAction;

  return (
    <Button
      className={cn('min-w-28')}
      disabled={disabled}
      onClick={onClick}
      type="button"
      variant={variant}
    >
      {active ? <Loader2 className="size-4 animate-spin" /> : icon}
      {label}
    </Button>
  );
}
