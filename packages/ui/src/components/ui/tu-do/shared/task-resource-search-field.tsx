'use client';

import { Search } from '@tuturuuu/icons';
import { Input } from '@tuturuuu/ui/input';
import { cn } from '@tuturuuu/utils/format';

export interface TaskResourceSearchFieldProps {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  className?: string;
  inputClassName?: string;
  /** When true, prevents parent menus/popovers from stealing keyboard or pointer events (dropdown + popover). */
  stopEventBubbling?: boolean;
}

/**
 * Shared search row used by task resource pickers (labels, projects, assignees)
 * in the kanban card menu and the task edit dialog for consistent UX and styling.
 */
export function TaskResourceSearchField({
  value,
  onChange,
  placeholder,
  className,
  inputClassName,
  stopEventBubbling = true,
}: TaskResourceSearchFieldProps) {
  return (
    <div className={cn('border-b p-2', className)}>
      <div className="relative">
        <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={stopEventBubbling ? (e) => e.stopPropagation() : undefined}
          onPointerDownCapture={
            stopEventBubbling ? (e) => e.stopPropagation() : undefined
          }
          className={cn(
            'h-8 border-0 bg-muted/50 pl-9 text-sm focus-visible:ring-0',
            inputClassName
          )}
        />
      </div>
    </div>
  );
}
