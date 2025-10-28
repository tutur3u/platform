'use client';

import { Bell, ChevronRight } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@tuturuuu/ui/popover';
import { ScrollArea } from '@tuturuuu/ui/scroll-area';
import { Separator } from '@tuturuuu/ui/separator';
import { cn } from '@tuturuuu/utils/format';
import Link from 'next/link';
import { useParams } from 'next/navigation';
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
  viewAllText: string;
}

export default function NotificationPopoverClient({
  notifications,
  noNotificationsText,
  notificationsText,
  viewAllText,
}: NotificationPopoverClientProps) {
  const [open, setOpen] = useState(false);
  const { wsId } = useParams();
  const hasNotifications = notifications.length > 0;
  const notificationsPageUrl = wsId ? `/${wsId}/notifications` : '/notifications';

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="group relative hidden flex-none transition-all md:flex"
        >
          <Bell className="h-6 w-6" />
          {hasNotifications && (
            <div className="group-hover:-top-2 group-hover:-right-1 absolute top-1 right-2 flex h-1.5 w-1.5 flex-none items-center justify-center rounded-full bg-dynamic-red p-1 text-center font-semibold text-xs transition-all group-hover:h-5 group-hover:w-auto group-hover:px-1.5 group-hover:text-background">
              <div className="relative opacity-0 group-hover:opacity-100">
                {notifications.length}
              </div>
            </div>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0 shadow-lg" align="start">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h3 className="font-semibold text-base">
            {notificationsText}
          </h3>
          {hasNotifications && (
            <span className="rounded-full bg-dynamic-red/10 px-2 py-0.5 font-medium text-dynamic-red text-xs">
              {notifications.length}
            </span>
          )}
        </div>

        {/* Notifications List */}
        <ScrollArea
          className={cn(
            'px-2 py-1',
            notifications.length === 0
              ? 'h-32'
              : notifications.length > 3
                ? 'h-96'
                : 'max-h-96'
          )}
        >
          {hasNotifications ? (
            <div className="space-y-1.5 py-1">
              {notifications.map((notification) => (
                <div
                  key={notification.id}
                  className="group rounded-lg border bg-foreground/[0.02] p-3 transition-all hover:border-foreground/20 hover:bg-foreground/[0.04] hover:shadow-sm"
                >
                  <div className="mb-1 font-medium text-sm leading-snug">
                    {notification.title}
                  </div>
                  <div className="mb-2.5 text-foreground/70 text-xs leading-relaxed">
                    {notification.description}
                  </div>

                  <NotificationActionList
                    actions={notification.actions}
                    onActionComplete={() => setOpen(false)}
                  />
                </div>
              ))}
            </div>
          ) : (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <Bell className="mb-2 h-10 w-10 text-foreground/20" />
              <p className="text-foreground/60 text-sm">
                {noNotificationsText}
              </p>
            </div>
          )}
        </ScrollArea>

        {/* Footer with View All link */}
        {wsId && (
          <>
            <Separator />
            <Link
              href={notificationsPageUrl}
              onClick={() => setOpen(false)}
              className="flex items-center justify-center gap-1 px-4 py-2.5 font-medium text-sm transition-colors hover:bg-foreground/5"
            >
              {viewAllText}
              <ChevronRight className="h-4 w-4" />
            </Link>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
