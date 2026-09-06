'use client';
import Link from 'next/link';
import { useParams, usePathname, useRouter } from 'next/navigation';
import { NotificationRuntime } from './notification-runtime';
import SatelliteNotificationPopover, {
  type NotificationPopoverClientProps,
} from './satellite-notification-popover';
export default function NotificationPopoverClient(
  props: NotificationPopoverClientProps
) {
  const params = useParams();
  const pathname = usePathname();
  const router = useRouter();
  return (
    <NotificationRuntime
      value={{ params, pathname, router, Link, realtime: true }}
    >
      <SatelliteNotificationPopover {...props} />
    </NotificationRuntime>
  );
}
