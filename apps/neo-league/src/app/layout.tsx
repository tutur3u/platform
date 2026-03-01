import type { Metadata } from 'next';
import { Poppins } from 'next/font/google';
import '@ncthub/ui/globals.css';
import './globals.css';
import { BASE_URL } from '@/constants/configs';
import JsonLd from '../components/json-ld';

const poppins = Poppins({
  subsets: ['latin'],
  weight: ['400', '700', '800', '900'],
});

export const metadata: Metadata = {
  metadataBase: new URL(BASE_URL),
  title: {
    default:
      'RMIT NEO League 2026 | Innovation Humanity Challenge — IoT Competition',
    template: '%s | RMIT NEO League 2026',
  },
  description:
    'RMIT NEO League Season 2 — the premier IoT competition for university students in Vietnam. Hosted by RMIT NEO Culture Technology Club, teams engineer integrated IoT solutions addressing UN Sustainable Development Goals through hardware prototyping, sensor integration, and smart technologies. March 2 – May 29, 2026, Ho Chi Minh City.',
  keywords: [
    // Brand keywords
    'RMIT NEO League',
    'NEO League',
    'RMIT Neo League 2026',
    'Neo Culture Technology',
    'RMIT NCT',
    // IoT competition keywords (primary target)
    'RMIT IoT competition',
    'RMIT IoT competition 2026',
    'IoT competition',
    'IoT competition Vietnam',
    'IoT hackathon',
    'IoT hackathon Vietnam',
    'IoT challenge',
    'IoT student competition',
    // Hardware & technology keywords
    'hardware competition',
    'hardware hackathon',
    'IoT prototyping competition',
    'sensor integration competition',
    'embedded systems competition',
    'smart technology competition',
    // RMIT competition keywords
    'RMIT competition',
    'RMIT competition 2026',
    'RMIT student competition',
    'RMIT technology competition',
    'RMIT hackathon',
    'RMIT innovation challenge',
    'RMIT club',
    'RMIT Ho Chi Minh',
    // General keywords
    'SDG',
    'sustainable development goals competition',
    'technology competition Vietnam',
    'innovation challenge Vietnam',
    'student competition Vietnam',
    'university competition Vietnam',
    'Ho Chi Minh City',
    // Vietnamese keywords
    'cuộc thi RMIT',
    'cuộc thi IoT',
    'cuộc thi IoT RMIT',
    'cuộc thi công nghệ',
    'cuộc thi công nghệ sinh viên',
    'cuộc thi phần cứng',
    'thi đấu IoT Việt Nam',
    'cuộc thi sáng tạo RMIT',
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
    title: 'RMIT NEO League 2026 | IoT Competition & Innovation Challenge',
    description:
      "Vietnam's premier student IoT competition — engineer integrated hardware and IoT solutions addressing UN Sustainable Development Goals. Hosted by RMIT NEO Culture Technology Club.",
    type: 'website',
    locale: 'en_US',
    url: BASE_URL,
    siteName: 'RMIT NEO League — IoT Competition',
    images: [
      {
        url: '/logo.png',
        width: 1200,
        height: 630,
        alt: 'RMIT NEO League 2026 — IoT Competition & Innovation Humanity Challenge',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'RMIT NEO League 2026 | IoT Competition & Innovation Challenge',
    description:
      "Vietnam's premier student IoT competition — engineer IoT solutions for UN SDGs. Join RMIT NEO Culture Technology Club's hardware innovation challenge.",
    images: ['/logo.png'],
  },
  alternates: {
    canonical: BASE_URL,
    languages: {
      'vi-VN': BASE_URL,
      'en-US': BASE_URL,
    },
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <JsonLd />
      <body className={`${poppins.className} antialiased`}>{children}</body>
    </html>
  );
}
