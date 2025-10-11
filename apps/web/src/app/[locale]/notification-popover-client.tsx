'use client';

import { Bell } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@tuturuuu/ui/popover';
import { ScrollArea } from '@tuturuuu/ui/scroll-area';
import { Separator } from '@tuturuuu/ui/separator';
import { useState } from 'react';
import NotificationActionList, {
  type NotificationAction,
} from './notification-action-list';

interface NotificationPopoverClientProps {
  notifications: Array<{
    id: string;
    title: string;
    description: React.ReactNode;
    actions: NotificationAction[];
  }>;
  noNotificationsText: string;
  notificationsText: string;
}

export default function NotificationPopoverClient({
  notifications,
  noNotificationsText,
  notificationsText,
}: NotificationPopoverClientProps) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="group relative hidden flex-none transition-all md:flex"
        >
          <Bell className="h-6 w-6" />
          {notifications.length > 0 && (
            <div className="group-hover:-top-2 group-hover:-right-1 absolute top-1 right-2 flex h-1.5 w-1.5 flex-none items-center justify-center rounded-full bg-foreground p-1 text-center font-semibold text-foreground text-xs transition-all group-hover:h-4 group-hover:w-auto group-hover:text-background">
              <div className="relative opacity-0 group-hover:opacity-100">
                {notifications.length}
              </div>
            </div>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        <div className="px-4 py-2 font-semibold">
          {notificationsText}
          {notifications.length > 0 && ` (${notifications.length})`}
        </div>
        <Separator />
        <ScrollArea
          className={`p-2 ${
            notifications.length === 0
              ? 'h-20'
              : notifications.length > 3
                ? 'h-96'
                : ''
          }`}
        >
          {notifications.length > 0 ? (
            notifications.map((notification) => (
              <div
                key={notification.id}
                className="mb-2 rounded-lg border bg-foreground/5 p-2 pb-2 last:mb-0"
              >
                <div className="font-medium text-sm leading-none">
                  {notification.title}
                </div>
                <div className="mt-1 mb-2 text-foreground/80 text-sm">
                  {notification.description}
                </div>

                <NotificationActionList
                  actions={notification.actions}
                  onActionComplete={() => setOpen(false)}
                />
              </div>
            ))
          ) : (
            <div className="flex min-h-16 flex-col items-center justify-center">
              <div className="text-foreground/80 text-xs">
                {noNotificationsText}
              </div>
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
