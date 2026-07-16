import { QueryProvider } from '@/providers/query-provider';
import '@tuturuuu/ui/globals.css';
import { createCommonMetadata } from '@tuturuuu/utils/common/metadata';
import { Geist, Geist_Mono } from 'next/font/google';
import { Suspense } from 'react';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata = createCommonMetadata({
  config: {
    description: {
      en: 'Reference application demonstrating secure integrations with the Tuturuuu SDK and workspace APIs.',
    },
    indexable: false,
    keywords: [
      'Tuturuuu SDK',
      'workspace API',
      'integration example',
      'developer reference',
    ],
    name: 'Tuturuuu SDK Example',
    url: 'https://tuturuuu.com',
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
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <Suspense>
          <QueryProvider>{children}</QueryProvider>
        </Suspense>
      </body>
    </html>
  );
}
