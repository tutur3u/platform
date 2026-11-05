import { Inter } from 'next/font/google';
import type { ReactNode } from 'react';

const inter = Inter({
  subsets: ['latin', 'vietnamese'],
  display: 'swap',
  variable: '--font-legal-inter',
  fallback: ['Noto Sans', 'sans-serif'],
});
export default function LegalChangesLayout({
  children,
}: {
  children: ReactNode;
}) {
  return <div className={inter.variable}>{children}</div>;
}
