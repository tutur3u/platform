import { Button } from '@tuturuuu/ui/button';
import { Bell } from '@tuturuuu/ui/icons';
import { Popover, PopoverContent, PopoverTrigger } from '@tuturuuu/ui/popover';
import { ScrollArea } from '@tuturuuu/ui/scroll-area';
import { Separator } from '@tuturuuu/ui/separator';
import { getWorkspaceInvites } from '@tuturuuu/utils/workspace-helper';
import dayjs from 'dayjs';
import NotificationActionList, {
  type NotificationAction,
} from './notification-action-list';
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
        <span className="font-semibold text-foreground/80">
          {dayjs(invite.created_at).fromNow()}
        </span>
        {' • '}
        {t('invited-to')}{' '}
        <span className="font-semibold text-primary/80 underline">
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
          className="group relative flex flex-none transition-all"
        >
          <Bell className="h-6 w-6" />
          {notifications.length > 0 && (
            <div className="absolute top-1 right-2 flex h-1.5 w-1.5 flex-none items-center justify-center rounded-full bg-foreground p-1 text-center text-xs font-semibold text-foreground transition-all group-hover:-top-2 group-hover:-right-1 group-hover:h-4 group-hover:w-auto group-hover:text-background">
              <div className="relative opacity-0 group-hover:opacity-100">
                {notifications.length}
              </div>
            </div>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-11/12 px-2 py-3.5 shadow-xl md:w-80 md:px-3 md:py-4 lg:w-96 lg:px-4.5"
        align="start"
      >
        <div className="px-4 py-2 text-xl font-semibold md:text-lg md:font-bold lg:text-xl">
          {t('notifications')}
          {notifications.length > 0 && ` (${notifications.length})`}
        </div>
        <Separator className="mb-3 lg:mb-4" />
        <ScrollArea
          className={`p-4 md:p-2 ${
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
                className="mb-5 rounded-lg border bg-foreground/5 px-3 py-4 last:mb-0 md:mb-4 md:px-3.5 md:py-4.5"
              >
                <div className="text-base leading-none font-medium">
                  {notification.title}
                </div>
                <div className="mt-1 mb-2.5 text-sm text-foreground/80 md:mb-3">
                  {notification.description}
                </div>

                <NotificationActionList actions={notification.actions} />
              </div>
            ))
          ) : (
            <div className="flex min-h-16 flex-col items-center justify-center">
              <div className="text-xs text-foreground/80">
                {noNotifications}
              </div>
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
