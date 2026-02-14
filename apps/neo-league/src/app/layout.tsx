import type { Metadata } from 'next';
import { Poppins } from 'next/font/google';
import '@ncthub/ui/globals.css';
import './globals.css';
import { BASE_URL } from '@/constants/configs';

const poppins = Poppins({
  subsets: ['latin'],
  variable: '--font-poppins',
  weight: ['400', '700', '800', '900'],
});

export const metadata: Metadata = {
  metadataBase: new URL(BASE_URL),
  title: {
    default: 'RMIT NEO League 2026 | Innovation Humanity Challenge',
    template: '%s | RMIT NEO League 2026',
  },
  description:
    'RMIT NEO League Season 2: A student-led IoT competition by RMIT NEO Culture Technology Club. Engineer integrated IoT solutions addressing UN Sustainable Development Goals. March 2 – May 29, 2026 in Ho Chi Minh City.',
  keywords: [
    'RMIT NEO League',
    'NEO League',
    'RMIT Neo League 2026',
    'Neo Culture Technology',
    'RMIT NCT',
    'IoT competition',
    'RMIT',
    'RMIT competition',
    'RMIT competition 2026',
    'RMIT student competition',
    'RMIT club',
    'RMIT Ho Chi Minh',
    'SDG',
    'technology competition',
    'innovation',
    'Ho Chi Minh City',
    'student competition Vietnam',
    'cuộc thi RMIT',
    'cuộc thi IoT',
    'cuộc thi công nghệ',
  ],
  authors: [
    { name: 'RMIT NEO Culture Technology Club', url: 'https://rmitnct.club' },
  ],
  creator: 'RMIT NEO Culture Technology Club',
  publisher: 'RMIT NEO Culture Technology Club',
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  openGraph: {
    title: 'RMIT NEO League 2026 | Innovation Humanity Challenge',
    description:
      'Engineer integrated IoT solutions addressing UN Sustainable Development Goals. Join the student-led competition by RMIT NEO Culture Technology Club.',
    type: 'website',
    locale: 'en_US',
    url: BASE_URL,
    siteName: 'RMIT NEO League',
    images: [
      {
        url: '/logo.png',
        width: 1200,
        height: 630,
        alt: 'RMIT NEO League 2026 - Innovation Humanity Challenge',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'RMIT NEO League 2026 | Innovation Humanity Challenge',
    description:
      "Engineer integrated IoT solutions addressing UN Sustainable Development Goals. Join RMIT NEO Culture Technology Club's competition.",
    images: ['/logo.png'],
  },
  alternates: {
    canonical: BASE_URL,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${poppins.className} antialiased`}>{children}</body>
    </html>
  );
}
