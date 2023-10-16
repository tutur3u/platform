import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Bell } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { getWorkspaceInvites } from '@/lib/workspace-helper';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import NotificationActionList, {
  NotificationAction,
} from './notification-action-list';
import useTranslation from 'next-translate/useTranslation';
import 'dayjs/locale/vi';
import { ScrollArea } from '@/components/ui/scroll-area';

export default async function NotificationPopover() {
  const { t, lang: locale } = useTranslation('notifications');

  // Configure dayjs
  dayjs.locale(locale);
  dayjs.extend(relativeTime);

  const noNotifications = t('no-notifications');

  const invites = await getWorkspaceInvites();
  const notifications = invites.map((invite) => ({
    title: `${t('workspace-invite')}`,
    description: (
      <div>
        <span className="font-semibold text-sky-600 dark:text-sky-200">
          {dayjs(invite.created_at).fromNow()}
        </span>
        {' • '}
        {t('invited-to')}{' '}
        <span className="text-primary/80 font-semibold underline">
          {invite.name}
        </span>
        .
      </div>
    ),
    actions: [
      {
        label: t('decline'),
        variant: 'outline',
        type: 'WORKSPACE_INVITE_DECLINE',
        payload: { wsId: invite.id },
      },
      {
        label: t('accept'),
        type: 'WORKSPACE_INVITE_ACCEPT',
        payload: { wsId: invite.id },
      },
    ] as NotificationAction[],
  }));

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon">
          <div className="relative">
            <Bell className="h-5 w-5" />
            {notifications.length > 0 && (
              <span className="absolute -right-1.5 -top-1.5 h-2 w-2 rounded-full bg-sky-500" />
            )}
          </div>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="end">
        <div className="p-2 font-semibold">
          {t('notifications')}
          {notifications.length > 0 && ` (${notifications.length})`}
        </div>
        <Separator />
        <ScrollArea
          className={`gap-2 p-2 ${
            notifications.length === 0
              ? 'h-20'
              : notifications.length > 4
              ? 'h-96'
              : ''
          }`}
        >
          {notifications.length > 0 ? (
            notifications.map((notification, index) => (
              <div key={index}>
                <p className="text-sm font-medium leading-none">
                  {notification.title}
                </p>
                <p className="text-muted-foreground mb-2 mt-1 text-sm">
                  {notification.description}
                </p>

                <NotificationActionList actions={notification.actions} />

                {index !== notifications.length - 1 ? (
                  <Separator className="my-2 w-full" />
                ) : null}
              </div>
            ))
          ) : (
            <div className="flex min-h-[4rem] flex-col items-center justify-center">
              <div className="text-muted-foreground text-xs">
                {noNotifications}
              </div>
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
