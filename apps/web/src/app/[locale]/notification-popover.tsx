import {
  getUnresolvedInquiriesCount,
  getWorkspaceInvites,
} from '@tuturuuu/utils/workspace-helper';
import dayjs from 'dayjs';
import 'dayjs/locale/vi';
import relativeTime from 'dayjs/plugin/relativeTime';
import { getLocale, getTranslations } from 'next-intl/server';
import type { NotificationAction } from './notification-action-list';
import NotificationPopoverClient from './notification-popover-client';

export default async function NotificationPopover() {
  const locale = await getLocale();
  const t = await getTranslations('notifications');

  // Configure dayjs
  dayjs.locale(locale);
  dayjs.extend(relativeTime);

  const noNotifications = t('no-notifications');

  const invites = await getWorkspaceInvites();
  const { count: unresolvedInquiriesCount, latestDate: latestInquiryDate } =
    await getUnresolvedInquiriesCount();

  const notifications = [
    ...invites.map((invite) => ({
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
    })),
    ...(unresolvedInquiriesCount > 0
      ? [
          {
            id: 'unresolved-inquiries',
            title: t('unresolved-inquiries'),
            description: (
              <div>
                {latestInquiryDate && (
                  <>
                    <span className="font-semibold text-foreground/80">
                      {dayjs(latestInquiryDate).fromNow()}
                    </span>
                    {' • '}
                  </>
                )}
                <span className="font-semibold text-dynamic-orange">
                  {unresolvedInquiriesCount}
                </span>{' '}
                {t('inquiries-need-attention')}
              </div>
            ),
            actions: [
              {
                id: 'view-inquiries',
                label: t('view-inquiries'),
                type: 'LINK',
                payload: { href: `/internal/inquiries` },
              },
            ] as NotificationAction[],
          },
        ]
      : []),
  ];

  return (
    <NotificationPopoverClient
      notifications={notifications}
      noNotificationsText={noNotifications}
      notificationsText={t('notifications')}
    />
  );
}
