'use client';

import { Pencil, X } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import type { ReactNode } from 'react';

export function CompactEditButton({
  editing,
  label,
  onClick,
}: {
  editing: boolean;
  label: string;
  onClick: () => void;
}) {
  const Icon = editing ? X : Pencil;
  return (
    <Button
      aria-label={label}
      className="size-8 shrink-0 rounded-md"
      onClick={onClick}
      size="icon"
      title={label}
      type="button"
      variant="outline"
    >
      <Icon className="size-3.5" />
    </Button>
  );
}

export function ReadOnlyField({
  label,
  value,
}: {
  label: ReactNode;
  value: ReactNode;
}) {
  return (
    <div className="min-w-0 bg-card px-4 py-3">
      <p className="text-muted-foreground text-xs">{label}</p>
      <div className="mt-1 truncate font-medium text-sm">{value}</div>
    </div>
  );
}
