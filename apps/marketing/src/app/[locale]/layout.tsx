import { PublicSatelliteProviders } from '@tuturuuu/satellite/public';
import '@tuturuuu/ui/globals.css';
import '@tuturuuu/marketing-shell/fonts.css';
import './(marketing)/(landing)/landing.css';
import { Toaster } from '@tuturuuu/ui/sonner';
import { font, generateCommonMetadata } from '@tuturuuu/utils/common/nextjs';
import { cn } from '@tuturuuu/utils/format';
import { resolveRootLocale } from '@tuturuuu/utils/i18n-root-locale';
import type { Metadata } from 'next';
import { locale as getRootLocale } from 'next/root-params';
import type { ReactNode } from 'react';
import { siteConfig } from '@/constants/configs';
import { supportedLocales } from '@/i18n/routing';

export { viewport } from '@tuturuuu/utils/common/nextjs';

interface Props {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return generateCommonMetadata({
    config: {
      description: {
        en: 'Connect team tasks, calendars, documents, and business tools in one open-source workspace with AI assistance.',
        vi: 'Kết nối công việc nhóm, lịch, tài liệu và công cụ kinh doanh trong một không gian làm việc mã nguồn mở với trợ lý AI.',
      },
      indexable: true,
      keywords: [
        'business management platform',
        'AI productivity',
        'team collaboration',
        'workflow automation',
        'workspace management',
      ],
      name: siteConfig.name,
      url: siteConfig.url,
      ogImage: siteConfig.ogImage,
    },
    params,
  });
}

export function generateStaticParams() {
  return supportedLocales.map((locale) => ({ locale }));
}

// No session, actor or account providers: every response is anonymous, so it
// can be cached at the edge.
export default async function RootLayout({ children }: Props) {
  const locale = await resolveRootLocale(
    supportedLocales,
    await getRootLocale()
  );

  return (
    <html data-scroll-behavior="smooth" lang={locale} suppressHydrationWarning>
      <body
        className={cn(
          'overflow-y-auto overflow-x-hidden bg-root-background antialiased',
          font.className
        )}
      >
        <PublicSatelliteProviders>
          {children}
          <Toaster />
        </PublicSatelliteProviders>
      </body>
    </html>
  );
}
