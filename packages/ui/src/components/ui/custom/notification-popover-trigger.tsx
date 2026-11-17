'use client';

import { Bell } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { PopoverTrigger } from '@tuturuuu/ui/popover';
import { type Ref, useEffect, useState } from 'react';
import { fillCount } from './notification-labels';

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
        className="group relative flex size-10 flex-none"
      >
        <Bell aria-hidden className="size-5" />
        {unreadCount > 0 && (
          <span
            aria-hidden
            className="absolute top-1 right-1 min-w-4 rounded-full bg-dynamic-red px-1 text-center font-semibold text-[10px] text-background leading-4 tabular-nums"
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </Button>
    </PopoverTrigger>
  );
}
