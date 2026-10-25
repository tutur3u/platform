import NotificationPopoverView from '@tuturuuu/satellite/components/notification-popover-view';

/** The central Tuturuuu web app URL, resolved from env or defaults */
function getTtrUrl(): string {
  const prod = process.env.NODE_ENV === 'production';
  return (
    process.env.TTR_URL ||
    (prod
      ? 'https://tuturuuu.com'
      : `http://localhost:${process.env.CENTRAL_PORT || 7803}`)
  );
}

export default function NotificationPopover({
  userId,
}: {
  userId?: string;
} = {}) {
  return <NotificationPopoverView userId={userId} webAppUrl={getTtrUrl()} />;
}
