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

export default async function NotificationPopover() {
  const { t, lang: locale } = useTranslation('notifications');

  // Configure dayjs
  dayjs.locale(locale);
  dayjs.extend(relativeTime);

  const noNotifications = t('no-notifications');
  const desc = t('no-notifications-desc');

  const invites = await getWorkspaceInvites();
  const notifications = invites.map((invite) => ({
    title: `${t('workspace-invite')} • ${dayjs(invite.created_at).fromNow()}.`,
    description: (
      <div>
        {t('invited-to')}{' '}
        <span className="text-primary/70 font-semibold underline">
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
      <PopoverContent className="w-full md:w-96">
        <div className="font-semibold">
          {t('notifications')}
          {notifications.length > 0 && ` (${notifications.length})`}
        </div>
        <Separator className="mb-4 mt-1" />
        <div className="grid gap-4">
          {notifications.length > 0 ? (
            notifications.map((notification, index) => (
              <div
                key={index}
                className="grid grid-cols-[25px_1fr] items-start pb-2 last:mb-0 last:pb-0"
              >
                <span className="flex h-2 w-2 translate-y-1 rounded-full bg-sky-500" />
                <div>
                  <p className="text-sm font-medium leading-none">
                    {notification.title}
                  </p>
                  <p className="text-muted-foreground mb-2 mt-1 text-sm">
                    {notification.description}
                  </p>

                  <NotificationActionList actions={notification.actions} />
                </div>
              </div>
            ))
          ) : (
            <div className="flex flex-col items-center justify-center">
              <div className="text-muted-foreground text-sm font-medium">
                {noNotifications}
              </div>
              <div className="text-muted-foreground text-xs">{desc}</div>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
