import type { Metadata } from 'next';
import SessionsCard from './sessions-card';

export const metadata: Metadata = {
  title: 'Sessions',
  description:
    'Manage Sessions in the Account area of your Tuturuuu workspace.',
};

export default async function SessionsPage() {
  return <SessionsCard />;
}
