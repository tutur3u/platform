import '@tuturuuu/ui/globals.css';
import { createCommonMetadata } from '@tuturuuu/utils/common/metadata';
import { VercelAnalytics } from '@tuturuuu/vercel';

export const metadata = createCommonMetadata({
  config: {
    description: {
      en: 'Fast, privacy-aware link redirects powered by Tuturuuu Shortener.',
    },
    indexable: false,
    keywords: [
      'link shortener',
      'short URLs',
      'link redirects',
      'Tuturuuu links',
    ],
    manifest: '/site.webmanifest',
    name: 'Tuturuuu Shortener',
    url: 'https://shortener.tuturuuu.com',
  },
  locale: 'en',
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        {children}
        <VercelAnalytics />
      </body>
    </html>
  );
}
