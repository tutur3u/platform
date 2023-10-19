import '../../styles/globals.css';

import { ThemeProvider } from '@/components/theme-provider';
import { Toaster } from '@/components/ui/toaster';
import { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { siteConfig } from '@/constants/configs';
import { Metadata } from 'next';
import { Analytics as VercelAnalytics } from '@vercel/analytics/react';
import GoogleAnalytics from '@/components/google-analytics';
import Navbar from './navbar';
import NavbarPadding from './navbar-padding';
import { StaffToolbar } from './staff-toolbar';
import { TailwindIndicator } from '@/components/tailwind-indicator';

interface Props {
  children: ReactNode;
  params: {
    lang: string;
  };
}

export async function generateMetadata({
  params: { lang },
}: Props): Promise<Metadata> {
  const enDescription = 'Take control of your workflow, supercharged by AI.';
  const viDescription = 'Quản lý công việc của bạn, siêu tốc độ cùng AI.';

  const description =
    lang === 'en'
      ? enDescription
      : lang === 'vi'
      ? viDescription
      : enDescription;

  return {
    title: {
      default: siteConfig.name,
      template: `%s - ${siteConfig.name}`,
    },
    metadataBase: new URL(siteConfig.url),
    description,
    keywords: [
      'Next.js',
      'React',
      'Tailwind CSS',
      'Server Components',
      'Radix UI',
    ],
    authors: [
      {
        name: 'vohoangphuc',
        url: 'https://www.vohoangphuc.com',
      },
    ],
    creator: 'vohoangphuc',
    themeColor: [
      { media: '(prefers-color-scheme: light)', color: 'white' },
      { media: '(prefers-color-scheme: dark)', color: 'black' },
    ],
    openGraph: {
      type: 'website',
      locale: 'en_US',
      url: siteConfig.url,
      title: siteConfig.name,
      description,
      siteName: siteConfig.name,
      images: [
        {
          url: siteConfig.ogImage,
          width: 1200,
          height: 630,
          alt: siteConfig.name,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: siteConfig.name,
      description,
      images: [siteConfig.ogImage],
      creator: '@tutur3u',
    },
    viewport:
      'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=yes, shrink-to-fit=no',
    icons: {
      icon: '/favicon.ico',
      shortcut: '/favicon-16x16.png',
      apple: '/apple-touch-icon.png',
    },
    manifest: `${siteConfig.url}/site.webmanifest`,
  };
}

export async function generateStaticParams() {
  return [{ lang: 'en' }, { lang: 'vi' }];
}

export default async function RootLayout({ children, params }: Props) {
  return (
    <html lang={params.lang}>
      <body
        className={cn(
          'bg-background min-h-screen font-sans antialiased'
          // fontSans.variable
        )}
      >
        <VercelAnalytics />
        <GoogleAnalytics />
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          disableTransitionOnChange
          enableSystem
        >
          <Navbar />
          <NavbarPadding>{children}</NavbarPadding>
        </ThemeProvider>
        <TailwindIndicator />
        <StaffToolbar />
        <Toaster />
      </body>
    </html>
  );
}
