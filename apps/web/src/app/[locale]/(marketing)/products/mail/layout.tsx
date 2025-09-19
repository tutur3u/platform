import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Mail Product',
  description: 'Power outreach and shared inboxes with Tuturuuu Mail.',
};

export default function MailLayout({ children }: { children: ReactNode }) {
  return children;
}
