import { ProductionIndicator } from '@tuturuuu/ui/custom/production-indicator';
import { StaffToolbar } from '@tuturuuu/ui/custom/staff-toolbar';
import { TailwindIndicator } from '@tuturuuu/ui/custom/tailwind-indicator';
import { siteConfig } from '@/constants/configs';
import { supportedLocales } from '@/i18n/routing';
import '@tuturuuu/ui/globals.css';
import { Toaster } from '@tuturuuu/ui/sonner';
import { font, generateCommonMetadata } from '@tuturuuu/utils/common/nextjs';
import { cn } from '@tuturuuu/utils/format';
import { resolveRootLocale } from '@tuturuuu/utils/i18n-root-locale';
import type { Metadata } from 'next';
import { locale as getRootLocale } from 'next/root-params';
import { NuqsAdapter } from 'nuqs/adapters/next/app';
import type { ReactNode } from 'react';
import { MeetLoading } from '@/features/loading/meet-loading';
import enMessages from '../../../messages/en.json';
import viMessages from '../../../messages/vi.json';
import { Providers } from './providers';

export { viewport } from '@tuturuuu/utils/common/nextjs';

interface Props {
  children: ReactNode;
  params: Promise<{
    locale: string;
  }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return generateCommonMetadata({
    config: {
      description: {
        en: 'Meet with clear audio, live transcription, and meeting notes connected to Tuturuuu Tasks and Calendar.',
        vi: 'Họp với âm thanh rõ ràng, chép lời trực tiếp và ghi chú kết nối với Tuturuuu Tasks và Calendar.',
      },
      indexable: false,
      keywords: [
        'meeting scheduler',
        'availability planner',
        'collaborative scheduling',
        'meeting coordination',
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

export default async function RootLayout({ children }: Props) {
  const locale = await resolveRootLocale(
    supportedLocales,
    await getRootLocale()
  );

  return (
    <html lang={locale} suppressHydrationWarning>
      <body
        className={cn(
          'overflow-y-auto bg-root-background antialiased',
          font.className
        )}
      >
        <NuqsAdapter>
          <Providers
            appName={siteConfig.name}
            loadingFallback={
              <MeetLoading
                labels={
                  (locale === 'vi' ? viMessages : enMessages).meet.loading
                }
              />
            }
          >
            {children}
          </Providers>
        </NuqsAdapter>
        <TailwindIndicator />
        <ProductionIndicator />
        <StaffToolbar />
        <Toaster />
      </body>
    </html>
  );
}
