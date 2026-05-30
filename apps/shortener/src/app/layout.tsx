import '@tuturuuu/ui/globals.css';
import { Providers } from '@tuturuuu/satellite/providers';
import { VercelAnalytics } from '@tuturuuu/vercel';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Tuturuuu Link Shortener',
  description: 'Shorten your links with Tuturuuu, the best link shortener.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <Providers appName="Shortener">{children}</Providers>
        <VercelAnalytics />
      </body>
    </html>
  );
}
