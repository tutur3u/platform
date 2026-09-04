import type { ReactNode } from 'react';
import { createLocalizedMarketingMetadata } from '@/lib/seo/marketing-metadata';

export const generateMetadata = createLocalizedMarketingMetadata({
  namespace: 'products.mail.seo',
  pathname: '/products/mail',
});

export default function MailLayout({ children }: { children: ReactNode }) {
  return children;
}
