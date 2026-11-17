'use client';
import Link from 'next/link';
import { useParams, usePathname, useRouter } from 'next/navigation';
import {
  NotificationPage,
  type NotificationPageProps,
} from './notification-page';
import { NotificationRuntime } from './notification-runtime';

/** Next.js adapter for the full notifications page. */
export default function NotificationPageClient(props: NotificationPageProps) {
  const params = useParams();
  const pathname = usePathname();
  const router = useRouter();
  return (
    <NotificationRuntime
      value={{ params, pathname, router, Link, realtime: true }}
    >
      <NotificationPage {...props} />
    </NotificationRuntime>
  );
}
