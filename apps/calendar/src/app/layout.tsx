import '@tuturuuu/ui/globals.css';
import { cn } from '@tuturuuu/utils/format';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';

const font = Inter({ subsets: ['latin', 'vietnamese'], display: 'block' });

export const metadata: Metadata = {
  title: 'Tuturuuu Calendar',
  description: 'A calendar application to manage your events easily.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={cn(
          'overflow-y-scroll bg-background antialiased',
          font.className
        )}
      >
        {children}
      </body>
    </html>
  );
}
