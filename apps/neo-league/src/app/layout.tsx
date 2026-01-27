import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'NEO League 2026 | Innovation Humanity Challenge',
  description: 'NEO League Season 2: A student-led IoT competition by RMIT NEO Culture Technology Club. Engineer integrated IoT solutions addressing UN Sustainable Development Goals. March 2 – May 29, 2026.',
  keywords: ['NEO League', 'IoT competition', 'RMIT', 'SDG', 'technology', 'innovation', 'Ho Chi Minh City', 'student competition'],
  authors: [{ name: 'RMIT NEO Culture Technology Club' }],
  openGraph: {
    title: 'NEO League 2026 | Innovation Humanity Challenge',
    description: 'Engineer integrated IoT solutions addressing UN Sustainable Development Goals. Join the student-led competition by RMIT NEO Culture Technology Club.',
    type: 'website',
    locale: 'en_US',
    siteName: 'NEO League',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'NEO League 2026 | Innovation Humanity Challenge',
    description: 'Engineer integrated IoT solutions addressing UN Sustainable Development Goals.',
  },
};

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
        {children}
      </body>
    </html>
  );
}
