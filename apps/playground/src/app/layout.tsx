import '@tuturuuu/ui/globals.css';
import { Providers } from '@tuturuuu/satellite/providers';
import { createCommonMetadata } from '@tuturuuu/utils/common/metadata';
import { Geist, Geist_Mono } from 'next/font/google';
import Link from 'next/link';

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
      en: 'Internal Tuturuuu playground for testing product components, tool calling, and integration experiments.',
    },
    indexable: false,
    keywords: [
      'Tuturuuu playground',
      'tool calling',
      'component testing',
      'integration experiments',
    ],
    name: 'Tuturuuu Playground',
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
        <Providers appName="Playground">
          <div className="flex flex-col gap-4 p-4 md:p-8">
            <div className="flex gap-4 font-semibold">
              <Link href="/" className="hover:underline">
                Home
              </Link>
              <Link href="/tool-calling" className="hover:underline">
                Tool Calling
              </Link>
            </div>
            <h1 className="font-bold text-2xl">Playground</h1>
            {children}
          </div>
        </Providers>
      </body>
    </html>
  );
}
