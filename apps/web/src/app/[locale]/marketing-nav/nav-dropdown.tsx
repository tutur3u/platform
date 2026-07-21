'use client';

import { ChevronDownIcon } from '@tuturuuu/icons/lucide-static';
import { cn } from '@tuturuuu/utils/format';
import { type ReactNode, useEffect, useId, useRef, useState } from 'react';

interface NavDropdownProps {
  label: ReactNode;
  children: ReactNode;
  /** Panel width class. Defaults to a compact single-column panel. */
  panelClassName?: string;
  align?: 'start' | 'end';
}

/**
 * Hover- and keyboard-operable navbar dropdown.
 *
 * The previous marketing menu opened purely on `:hover`/`:focus-within`, which
 * left the panel unreachable for keyboard and touch users. This keeps the hover
 * affordance while making the trigger a real disclosure button.
 */
export function NavDropdown({
  label,
  children,
  panelClassName,
  align = 'start',
}: NavDropdownProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  useEffect(
    () => () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    },
    []
  );

  const cancelClose = () => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };

  // Small grace period so the pointer can cross the gap to the panel.
  const scheduleClose = () => {
    cancelClose();
    closeTimer.current = setTimeout(() => setOpen(false), 120);
  };

  return (
    <div
      className="relative"
      onMouseEnter={() => {
        cancelClose();
        setOpen(true);
      }}
      onMouseLeave={scheduleClose}
      ref={containerRef}
    >
      <button
        aria-controls={panelId}
        aria-expanded={open}
        className={cn(
          'inline-flex h-9 items-center gap-1 rounded-lg px-3 font-medium text-sm transition-colors',
          'text-foreground/70 hover:bg-foreground/5 hover:text-foreground',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          open && 'bg-foreground/5 text-foreground'
        )}
        onClick={() => setOpen((value) => !value)}
        onFocus={cancelClose}
        type="button"
      >
        {label}
        <ChevronDownIcon className="h-3.5 w-3.5" />
      </button>

      <div
        className={cn(
          'absolute top-full z-50 pt-2 transition-all duration-150',
          align === 'end' ? 'right-0' : 'left-0',
          open
            ? 'visible translate-y-0 opacity-100'
            : 'invisible -translate-y-1 opacity-0'
        )}
        id={panelId}
      >
        <div
          className={cn(
            'overflow-hidden rounded-2xl border border-foreground/10 bg-popover/95 text-popover-foreground shadow-foreground/5 shadow-xl backdrop-blur-xl',
            panelClassName
          )}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
