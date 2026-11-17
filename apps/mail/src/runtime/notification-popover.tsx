import NotificationPopoverView from '@tuturuuu/satellite/notification-popover-view';

export default function NotificationPopover({
  userId,
  webAppUrl,
}: {
  userId?: string;
  webAppUrl: string;
}) {
  return (
    <NotificationPopoverView
      hostApp="mail"
      userId={userId}
      webAppUrl={webAppUrl}
    />
  );
}
