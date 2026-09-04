'use client';

import { Search } from '@tuturuuu/icons';
import { Input } from '@tuturuuu/ui/input';
import { cn } from '@tuturuuu/utils/format';
import { useEffect, useRef } from 'react';

export interface TaskResourceSearchFieldProps {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  className?: string;
  inputClassName?: string;
  /** When true, prevents parent menus/popovers from stealing keyboard or pointer events (dropdown + popover). */
  stopEventBubbling?: boolean;
  autoFocus?: boolean;
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
  autoFocus = true,
}: TaskResourceSearchFieldProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const popup =
      root.closest<HTMLElement>(
        '[data-slot="dropdown-menu-sub-content"], [data-slot="popover-content"], [role="dialog"]'
      ) ?? root.parentElement;
    if (!popup) return;

    const getOptions = () =>
      Array.from(
        popup.querySelectorAll<HTMLElement>(
          '[data-slot="dropdown-menu-item"]:not([data-disabled]), button:not(:disabled)'
        )
      ).filter(
        (option) =>
          option.getAttribute('aria-hidden') !== 'true' &&
          Boolean(
            root.compareDocumentPosition(option) &
              Node.DOCUMENT_POSITION_FOLLOWING
          )
      );

    const handleNavigation = (event: KeyboardEvent) => {
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;

      const options = getOptions();
      if (options.length === 0) return;

      const activeIndex = options.indexOf(event.target as HTMLElement);
      const nextIndex =
        event.key === 'ArrowDown'
          ? activeIndex < 0
            ? 0
            : (activeIndex + 1) % options.length
          : activeIndex < 0
            ? options.length - 1
            : (activeIndex - 1 + options.length) % options.length;

      event.preventDefault();
      event.stopPropagation();
      options[nextIndex]?.focus();
    };

    popup.addEventListener('keydown', handleNavigation, true);
    return () => popup.removeEventListener('keydown', handleNavigation, true);
  }, []);

  return (
    <div ref={rootRef} className={cn('border-b p-2', className)}>
      <div className="relative">
        <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          ref={inputRef}
          autoFocus={autoFocus}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={
            stopEventBubbling
              ? (e) => {
                  if (e.key === 'Escape' && value) {
                    e.preventDefault();
                    onChange('');
                  }
                  e.stopPropagation();
                }
              : undefined
          }
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
