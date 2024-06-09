import NotificationActionList, {
  NotificationAction,
} from './notification-action-list';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { getWorkspaceInvites } from '@/lib/workspace-helper';
import dayjs from 'dayjs';
import 'dayjs/locale/vi';
import relativeTime from 'dayjs/plugin/relativeTime';
import { Bell } from 'lucide-react';
import useTranslation from 'next-translate/useTranslation';

export default async function NotificationPopover() {
  const { t, lang: locale } = useTranslation('notifications');

  // Configure dayjs
  dayjs.locale(locale);
  dayjs.extend(relativeTime);

  const noNotifications = t('no-notifications');

  const invites = await getWorkspaceInvites();
  const notifications = invites.map((invite) => ({
    id: `workspace-invite-${invite.id}`,
    title: `${t('workspace-invite')}`,
    description: (
      <div>
        <span className="text-foreground/80 font-semibold">
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
        id: `decline-workspace-${invite.id}`,
        label: t('decline'),
        variant: 'outline',
        type: 'WORKSPACE_INVITE_DECLINE',
        payload: { wsId: invite.id },
      },
      {
        id: `accept-workspace-${invite.id}`,
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
              <span className="bg-foreground absolute -right-1.5 -top-1.5 h-2 w-2 rounded-full" />
            )}
          </div>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="end">
        <div className="px-4 py-2 font-semibold">
          {t('notifications')}
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
                className="bg-foreground/5 mb-2 rounded-lg border p-2 pb-2 last:mb-0"
              >
                <p className="text-sm font-medium leading-none">
                  {notification.title}
                </p>
                <p className="text-foreground/80 mb-2 mt-1 text-sm">
                  {notification.description}
                </p>

                <NotificationActionList actions={notification.actions} />
              </div>
            ))
          ) : (
            <div className="flex min-h-[4rem] flex-col items-center justify-center">
              <div className="text-foreground/80 text-xs">
                {noNotifications}
              </div>
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
