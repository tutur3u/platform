import NotificationActionList, {
  NotificationAction,
} from './notification-action-list';
import { getWorkspaceInvites } from '@/lib/workspace-helper';
import { Button } from '@ncthub/ui/button';
import { Bell } from '@ncthub/ui/icons';
import { Popover, PopoverContent, PopoverTrigger } from '@ncthub/ui/popover';
import { ScrollArea } from '@ncthub/ui/scroll-area';
import { Separator } from '@ncthub/ui/separator';
import dayjs from 'dayjs';
import 'dayjs/locale/vi';
import relativeTime from 'dayjs/plugin/relativeTime';
import { getLocale, getTranslations } from 'next-intl/server';

export default async function NotificationPopover() {
  const locale = await getLocale();
  const t = await getTranslations('notifications');

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
        <Button
          variant="ghost"
          size="icon"
          className="group relative hidden flex-none transition-all md:flex"
        >
          <Bell className="h-6 w-6" />
          {notifications.length > 0 && (
            <div className="bg-foreground text-foreground group-hover:text-background absolute right-2 top-1 flex h-1.5 w-1.5 flex-none items-center justify-center rounded-full p-1 text-center text-xs font-semibold transition-all group-hover:-right-1 group-hover:-top-2 group-hover:h-4 group-hover:w-auto">
              <div className="relative opacity-0 group-hover:opacity-100">
                {notifications.length}
              </div>
            </div>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
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
                <div className="text-sm font-medium leading-none">
                  {notification.title}
                </div>
                <div className="text-foreground/80 mb-2 mt-1 text-sm">
                  {notification.description}
                </div>

                <NotificationActionList actions={notification.actions} />
              </div>
            ))
          ) : (
            <div className="flex min-h-16 flex-col items-center justify-center">
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
