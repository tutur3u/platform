import { SatelliteVersionBadge } from '@tuturuuu/satellite/version-badge';
import { ProductionIndicator } from '@tuturuuu/ui/custom/production-indicator';
import { StaffToolbar } from '@tuturuuu/ui/custom/staff-toolbar';
import { TailwindIndicator } from '@tuturuuu/ui/custom/tailwind-indicator';
import { Toaster } from '@tuturuuu/ui/sonner';
import { font, generateCommonMetadata } from '@tuturuuu/utils/common/nextjs';
import { cn } from '@tuturuuu/utils/format';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { NextIntlClientProvider } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { NuqsAdapter } from 'nuqs/adapters/next/app';
import { type ReactNode, Suspense } from 'react';
import { ContactsQueryProvider } from '@/components/contacts-query-provider';
import { ContactsThemeProvider } from '@/components/contacts-theme-provider';
import { BASE_URL } from '@/constants/common';
import { type Locale, routing, supportedLocales } from '@/i18n/routing';
import '@tuturuuu/ui/globals.css';

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
        en: 'Contacts is the Tuturuuu CRM surface for managing workspace users, groups, reports, attendance, and outreach.',
        vi: 'Contacts là bề mặt CRM của Tuturuuu để quản lý người dùng workspace, nhóm, báo cáo, điểm danh và tiếp cận.',
      },
      indexable: false,
      keywords: [
        'customer relationship management',
        'workspace contacts',
        'CRM',
        'contact management',
      ],
      name: 'Contacts',
      url: BASE_URL,
    },
    params,
  });
}

export function generateStaticParams() {
  return supportedLocales.map((locale) => ({ locale }));
}

export default async function RootLayout({ children, params }: Props) {
  const { locale } = await params;

  if (!routing.locales.includes(locale as Locale)) {
    notFound();
  }

  setRequestLocale(locale as Locale);

  return (
    <html lang={locale} suppressHydrationWarning>
      <body
        className={cn(
          'overflow-y-auto bg-root-background text-foreground antialiased',
          font.className
        )}
      >
        <Suspense fallback={null}>
          <NextIntlClientProvider>
            <NuqsAdapter>
              <ContactsThemeProvider>
                <ContactsQueryProvider>
                  {children}
                  <Suspense fallback={null}>
                    <SatelliteVersionBadge appName="Contacts" />
                  </Suspense>
                </ContactsQueryProvider>
              </ContactsThemeProvider>
            </NuqsAdapter>
          </NextIntlClientProvider>
        </Suspense>
        <TailwindIndicator />
        <ProductionIndicator />
        <StaffToolbar />
        <Toaster />
      </body>
    </html>
  );
}
