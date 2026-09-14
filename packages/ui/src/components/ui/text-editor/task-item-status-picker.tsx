'use client';

import { Check, Minus, Square } from '@tuturuuu/icons';
import { useTranslations } from 'next-intl';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { Popover, PopoverAnchor, PopoverContent } from '../popover';
import type { TriStateChecked } from './task-item-checkbox';

export function TaskItemStatusPicker({
  children,
  state,
  disabled,
  onSelect,
}: {
  children: ReactNode;
  state: TriStateChecked;
  disabled: boolean;
  onSelect: (state: TriStateChecked) => void;
}) {
  const t = useTranslations('common.checklist');
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const keyboardOpen = useRef(false);
  const anchor = useRef<HTMLDivElement>(null);
  const cancelTimer = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );
  const closeSoon = () => {
    cancelTimer();
    if (keyboardOpen.current) return;
    timer.current = setTimeout(() => setOpen(false), 200);
  };
  const options = [
    { value: false, label: t('unchecked'), Icon: Square },
    { value: 'indeterminate', label: t('in_progress'), Icon: Minus },
    { value: true, label: t('completed'), Icon: Check },
  ] as const;

  return (
    <Popover open={open && !disabled} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <div
          ref={anchor}
          onPointerEnter={(event) => {
            if (disabled || event.pointerType === 'touch') return;
            cancelTimer();
            keyboardOpen.current = false;
            timer.current = setTimeout(() => setOpen(true), 500);
          }}
          onContextMenu={(event) => {
            if (disabled) return;
            event.preventDefault();
            cancelTimer();
            keyboardOpen.current = true;
            setOpen(true);
          }}
          onPointerLeave={closeSoon}
          onKeyDown={(event) => {
            if (disabled || event.key !== 'ArrowDown') return;
            event.preventDefault();
            event.stopPropagation();
            cancelTimer();
            keyboardOpen.current = true;
            setOpen(true);
          }}
        >
          {children}
        </div>
      </PopoverAnchor>
      <PopoverContent
        side="top"
        align="start"
        sideOffset={6}
        className="w-auto max-w-[calc(100vw-2rem)] p-1"
        contentEditable={false}
        aria-label={t('status')}
        onPointerEnter={cancelTimer}
        onPointerLeave={closeSoon}
        onFocusCapture={cancelTimer}
        onInteractOutside={() => {
          keyboardOpen.current = false;
          cancelTimer();
        }}
        onOpenAutoFocus={(event) => {
          if (!keyboardOpen.current) event.preventDefault();
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          if (keyboardOpen.current)
            anchor.current?.querySelector('button')?.focus();
        }}
      >
        <div className="flex items-center gap-0.5">
          {options.map(({ value, label, Icon }) => (
            <button
              key={String(value)}
              type="button"
              aria-label={label}
              aria-pressed={state === value}
              className="flex min-h-9 items-center gap-1.5 rounded-sm px-2 text-muted-foreground text-xs hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-pressed:bg-accent aria-pressed:text-accent-foreground"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onSelect(value);
                cancelTimer();
                setOpen(false);
              }}
            >
              <Icon className="size-3.5 shrink-0" />
              {label}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
