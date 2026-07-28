'use client';

import type { ComponentType, KeyboardEvent, SVGProps } from 'react';
import { useEffect, useId, useRef, useState } from 'react';
import type { RichTextStyleOption } from './types.js';

export function StyleToolbarControl({
  activeValue,
  clearLabel,
  icon: Icon,
  label,
  onClear,
  onSelect,
  options,
}: {
  activeValue?: string;
  clearLabel: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  label: string;
  onClear: () => void;
  onSelect: (value: string) => void;
  options: readonly RichTextStyleOption[];
}) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const seenValues = new Set<string>();
  const uniqueOptions = options.filter(({ value }) => {
    if (seenValues.has(value)) return false;
    seenValues.add(value);
    return true;
  });

  useEffect(() => {
    if (open)
      menuRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target;
      if (
        target instanceof Node &&
        !menuRef.current?.contains(target) &&
        !triggerRef.current?.contains(target)
      )
        setOpen(false);
    };
    document.addEventListener('pointerdown', closeOnOutsidePointer);
    return () =>
      document.removeEventListener('pointerdown', closeOnOutsidePointer);
  }, [open]);

  if (!uniqueOptions.length) return null;

  const close = (restoreFocus = false) => {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  };

  const handleMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const buttons = Array.from(
      menuRef.current?.querySelectorAll<HTMLButtonElement>(
        'button:not(:disabled)'
      ) ?? []
    );
    const current = buttons.indexOf(
      document.activeElement as HTMLButtonElement
    );
    let next: number;

    if (event.key === 'Escape') {
      event.preventDefault();
      close(true);
      return;
    }
    if (event.key === 'ArrowDown') next = (current + 1) % buttons.length;
    else if (event.key === 'ArrowUp')
      next = (current - 1 + buttons.length) % buttons.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = buttons.length - 1;
    else return;

    event.preventDefault();
    buttons[next]?.focus();
  };

  return (
    <div className="tuturuuu-editor-style-control tuturuuu-editor-tool">
      <button
        aria-controls={menuId}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={label}
        aria-pressed={Boolean(activeValue)}
        onClick={() => setOpen((currentOpen) => !currentOpen)}
        ref={triggerRef}
        type="button"
      >
        <Icon aria-hidden="true" />
        <span
          aria-hidden="true"
          className="tuturuuu-editor-style-indicator"
          style={{
            backgroundColor: activeValue || 'currentcolor',
          }}
        />
      </button>
      <span aria-hidden="true" className="tuturuuu-editor-tooltip">
        {label}
      </span>
      {open ? (
        <div
          aria-label={label}
          className="tuturuuu-editor-style-menu"
          id={menuId}
          onBlur={(event) => {
            if (
              !event.currentTarget.contains(event.relatedTarget as Node | null)
            )
              close();
          }}
          onKeyDown={handleMenuKeyDown}
          ref={menuRef}
          role="menu"
        >
          <div className="tuturuuu-editor-style-swatches">
            {uniqueOptions.map((option) => (
              <button
                aria-checked={option.value === activeValue}
                aria-label={option.label}
                key={`${label}-${option.value}`}
                onClick={() => {
                  onSelect(option.value);
                  close(true);
                }}
                role="menuitemradio"
                style={{ backgroundColor: option.value }}
                title={option.label}
                type="button"
              />
            ))}
          </div>
          <button
            className="tuturuuu-editor-style-clear"
            onClick={() => {
              onClear();
              close(true);
            }}
            role="menuitem"
            type="button"
          >
            {clearLabel}
          </button>
        </div>
      ) : null}
    </div>
  );
}
