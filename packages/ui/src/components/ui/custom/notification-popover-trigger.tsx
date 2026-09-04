'use client';

import { Bell } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { PopoverTrigger } from '@tuturuuu/ui/popover';
import { useEffect, useState } from 'react';

interface NotificationPopoverTriggerProps {
  notificationsText: string;
  unreadCount: number;
}

export function NotificationPopoverTriggerButton({
  notificationsText,
  unreadCount,
}: NotificationPopoverTriggerProps) {
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  return (
    <PopoverTrigger asChild>
      <Button
        variant="ghost"
        size="icon"
        aria-label={notificationsText}
        title={notificationsText}
        disabled={!isHydrated}
        className="group relative flex size-10 flex-none transition-all"
      >
        <Bell className="h-6 w-6" />
        {unreadCount > 0 && (
          <div className="absolute top-1 right-2 flex h-1.5 w-1.5 flex-none items-center justify-center rounded-full bg-dynamic-red p-1 text-center font-semibold text-xs transition-all group-hover:-top-2 group-hover:-right-1 group-hover:h-5 group-hover:w-auto group-hover:px-1.5 group-hover:text-background">
            <div className="relative opacity-0 group-hover:opacity-100">
              {unreadCount > 99 ? '99+' : unreadCount}
            </div>
          </div>
        )}
      </Button>
    </PopoverTrigger>
  );
}
