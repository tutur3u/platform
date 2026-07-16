import type { ReactNode } from 'react';
import { createMarketingMetadata } from '@/lib/seo/marketing-metadata';

export const generateMetadata = createMarketingMetadata({
  title: 'Team Email and Shared Inboxes',
  description: 'Power outreach and shared inboxes with Tuturuuu Mail.',
  pathname: '/products/mail',
});

export default function MailLayout({ children }: { children: ReactNode }) {
  return children;
}
