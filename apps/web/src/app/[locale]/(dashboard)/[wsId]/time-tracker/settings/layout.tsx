import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Settings',
  description: 'Manage Settings in the Time Tracker area of your Tuturuuu workspace.',
};

export default function SettingsLayout({ children }: { children: ReactNode }) {
  return children;
}
