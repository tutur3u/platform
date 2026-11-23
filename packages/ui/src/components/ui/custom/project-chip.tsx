'use client';

import { FolderKanban, X } from '@tuturuuu/icons';
import { cn } from '@tuturuuu/utils/format';
import { Badge } from '../badge';

export type ProjectChipProps = {
  name: string;
  /** Opens the project. Plain anchors keep the chip framework-independent. */
  href?: string;
  /** Renders a remove control when provided. */
  onRemove?: () => void;
  removeLabel?: string;
  disabled?: boolean;
  className?: string;
};

/** A workspace Project shown on a meeting, event or task. */
export function ProjectChip({
  name,
  href,
  onRemove,
  removeLabel,
  disabled = false,
  className,
}: ProjectChipProps) {
  const label = (
    <>
      <FolderKanban aria-hidden="true" />
      <span className="max-w-48 truncate">{name}</span>
    </>
  );

  return (
    <span
      className={cn('inline-flex max-w-full items-center gap-0.5', className)}
      data-slot="project-chip"
    >
      {href ? (
        <Badge asChild variant="outline">
          <a href={href}>{label}</a>
        </Badge>
      ) : (
        <Badge variant="outline">{label}</Badge>
      )}
      {onRemove ? (
        <button
          aria-label={removeLabel ?? name}
          className="inline-flex size-5 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50"
          disabled={disabled}
          onClick={onRemove}
          type="button"
        >
          <X aria-hidden="true" className="size-3" />
        </button>
      ) : null}
    </span>
  );
}
