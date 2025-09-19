import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

export const metadata: Metadata = {
  title: 'Settings',
  description:
    'Manage Settings in the Dashboard area of your Tuturuuu workspace.',
};

export default function SettingsPage() {
  redirect('/settings/account');
}
