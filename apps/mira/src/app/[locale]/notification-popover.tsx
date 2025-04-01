import NotificationActionList, {
  NotificationAction,
} from './notification-action-list';
import { getWorkspaceInvites } from '@/lib/workspace-helper';
import { Button } from '@tuturuuu/ui/button';
import { Bell } from '@tuturuuu/ui/icons';
import { Popover, PopoverContent, PopoverTrigger } from '@tuturuuu/ui/popover';
import { ScrollArea } from '@tuturuuu/ui/scroll-area';
import { Separator } from '@tuturuuu/ui/separator';
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
          className="group relative hidden flex-none transition-all md:flex"
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
                className="mb-2 rounded-lg border bg-foreground/5 p-2 pb-2 last:mb-0"
              >
                <div className="text-sm leading-none font-medium">
                  {notification.title}
                </div>
                <div className="mt-1 mb-2 text-sm text-foreground/80">
                  {notification.description}
                </div>

                <NotificationActionList actions={notification.actions} />
              </div>
            ))
          ) : (
            <div className="flex min-h-[4rem] flex-col items-center justify-center">
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
