import NotificationPopoverView from '@tuturuuu/satellite/notification-popover-view';

export default function NotificationPopover({
  userId,
  webAppUrl,
}: {
  userId?: string;
  webAppUrl: string;
}) {
  return <NotificationPopoverView userId={userId} webAppUrl={webAppUrl} />;
}
