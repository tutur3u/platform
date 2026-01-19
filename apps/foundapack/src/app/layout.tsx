import '@tuturuuu/ui/globals.css';
import './pack.css';
import { cn } from '@tuturuuu/utils/format';
import { VercelAnalytics, VercelInsights } from '@tuturuuu/vercel';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import type { ReactNode } from 'react';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Foundapack - Where No Student Founder Builds Alone',
  description:
    'A peer-driven community for students and early-stage founders to grow together through shared support and real-world experience. Find your founder pack.',
  keywords: [
    'student founders',
    'startup community',
    'peer support',
    'early-stage founders',
    'founder community',
    'entrepreneurship',
  ],
  authors: [{ name: 'Tuturuuu' }],
  openGraph: {
    title: 'Foundapack - Where No Student Founder Builds Alone',
    description:
      'A peer-driven community for students and early-stage founders to grow together through shared support and real-world experience.',
    type: 'website',
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" className="dark">
      <body
        className={cn(
          'bg-pack-void text-pack-frost antialiased',
          inter.className
        )}
      >
        {children}
        <VercelAnalytics />
        <VercelInsights />
      </body>
    </html>
  );
}
