import { Check } from '@tuturuuu/icons';
import { DropdownMenuItem } from '@tuturuuu/ui/dropdown-menu';
import { cn } from '@tuturuuu/utils/format';
import type { ReactNode } from 'react';

/** Two-line menu row: icon, label and description, then a hint or check. */
export function ToolbarMenuItem({
  checked,
  description,
  hint,
  icon,
  label,
  onSelect,
}: {
  checked?: boolean;
  description?: string;
  hint?: string;
  icon: ReactNode;
  label: string;
  onSelect: () => void;
}) {
  return (
    <DropdownMenuItem
      aria-checked={checked}
      className={cn('items-start gap-2 py-2', checked && 'bg-accent/60')}
      onSelect={onSelect}
      role="menuitemradio"
    >
      <span className="mt-0.5 text-muted-foreground [&_svg]:size-4">
        {icon}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-sm">{label}</span>
        {description ? (
          <span className="text-muted-foreground text-xs">{description}</span>
        ) : null}
      </span>
      {hint ? (
        <span className="self-start font-mono text-muted-foreground text-xs">
          {hint}
        </span>
      ) : null}
      {checked && !hint ? (
        <Check className="size-4 self-center text-muted-foreground" />
      ) : null}
    </DropdownMenuItem>
  );
}
