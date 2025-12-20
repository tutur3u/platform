import type { Metadata } from 'next';
import type { JSX } from 'react';
import { AccountManagementCard } from './account-management-card';

export const metadata: Metadata = {
  title: 'Manage Accounts',
  description:
    'Manage multiple accounts in the Account area of your Tuturuuu workspace.',
};

export default function AccountsPage(): JSX.Element {
  return <AccountManagementCard />;
}
