'use client';

import { Bell } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { PopoverTrigger } from '@tuturuuu/ui/popover';
import { type Ref, useEffect, useState } from 'react';
import { fillCount } from './notification-labels';
import { useSidebarFooter } from './sidebar-footer-context';

interface NotificationPopoverTriggerProps {
  notificationsText: string;
  unreadCount: number;
  /** `{count} unread`; appended to the accessible name when non-zero. */
  unreadCountText?: string;
  /** Fires on hover or focus so the panel chunk and first page can preload. */
  onIntent?: () => void;
  triggerRef?: Ref<HTMLButtonElement>;
}

export function NotificationPopoverTriggerButton({
  notificationsText,
  unreadCount,
  unreadCountText = '{count} unread',
  onIntent,
  triggerRef,
}: NotificationPopoverTriggerProps) {
  const [isHydrated, setIsHydrated] = useState(false);
  // In the expanded sidebar footer the trigger becomes a labelled row whose
  // bell sits exactly where the rail's bell does.
  const row = useSidebarFooter().expanded;

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  const label =
    unreadCount > 0
      ? `${notificationsText}, ${fillCount(unreadCountText, unreadCount)}`
      : notificationsText;

  return (
    <PopoverTrigger asChild>
      <Button
        ref={triggerRef}
        variant="ghost"
        size="icon"
        aria-label={label}
        title={notificationsText}
        disabled={!isHydrated}
        onPointerEnter={onIntent}
        onFocus={onIntent}
        className={
          row
            ? 'group relative flex h-10 w-full flex-none justify-start gap-0 px-0'
            : 'group relative flex size-10 flex-none'
        }
      >
        <span
          className={
            row
              ? 'relative flex h-10 w-[var(--sidebar-rail-slot,2.9375rem)] shrink-0 items-center justify-center'
              : 'contents'
          }
        >
          <Bell aria-hidden className="size-5" />
          {unreadCount > 0 && (
            <span
              aria-hidden
              className={`absolute min-w-4 rounded-full bg-dynamic-red px-1 text-center font-semibold text-[10px] text-background leading-4 tabular-nums ${row ? 'top-1 right-[7.5px]' : 'top-1 right-1'}`}
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </span>
        {row && (
          <span className="-ml-1.5 min-w-0 flex-1 truncate pr-2 text-start font-medium text-sm">
            {notificationsText}
          </span>
        )}
      </Button>
    </PopoverTrigger>
  );
}
