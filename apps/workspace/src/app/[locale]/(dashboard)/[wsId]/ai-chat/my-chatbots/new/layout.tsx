import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'New',
  description: 'Manage New in the My Chatbots area of your Tuturuuu workspace.',
};

export default function NewLayout({ children }: { children: ReactNode }) {
  return children;
}
