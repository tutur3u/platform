import type { Metadata } from 'next';
import NotificationsCard from './notifications-card';

export const metadata: Metadata = {
  title: 'Notifications',
  description:
    'Manage Notifications in the Account area of your Tuturuuu workspace.',
};

export default async function NotificationsPage() {
  return <NotificationsCard />;
}
