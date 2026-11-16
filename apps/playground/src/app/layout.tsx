import '@tuturuuu/ui/globals.css';
import { createCommonMetadata } from '@tuturuuu/utils/common/metadata';
import type { ReactNode } from 'react';

export const metadata = createCommonMetadata({
  config: {
    name: 'Playground',
    description: {
      en: 'Try Tuturuuu products with an interactive demo workspace.',
    },
    url: 'https://playground.tuturuuu.com',
    indexable: true,
    keywords: ['product demos', 'interactive workspace'],
  },
  locale: 'en',
});

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" data-ui="sorbet">
      <body>{children}</body>
    </html>
  );
}
