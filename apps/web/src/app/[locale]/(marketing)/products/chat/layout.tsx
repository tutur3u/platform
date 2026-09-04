import type { ReactNode } from 'react';
import { createLocalizedMarketingMetadata } from '@/lib/seo/marketing-metadata';

export const generateMetadata = createLocalizedMarketingMetadata({
  namespace: 'products.chat.seo',
  pathname: '/products/chat',
});

export default function ChatLayout({ children }: { children: ReactNode }) {
  return children;
}
