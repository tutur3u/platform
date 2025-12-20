import FinanceLayout from '@tuturuuu/ui/finance/finance-layout';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { NextIntlClientProvider } from 'next-intl';
import type React from 'react';
import { Suspense } from 'react';
import { supportedLocales } from '@/i18n/routing';

interface LayoutProps {
  params: Promise<{
    locale: string;
    wsId: string;
  }>;
  children: React.ReactNode;
}

export function generateStaticParams() {
  return supportedLocales.map((locale) => ({
    locale,
    wsId: ROOT_WORKSPACE_ID,
  }));
}

export default async function Layout({ children, params }: LayoutProps) {
  return (
    <Suspense>
      <NextIntlClientProvider>
        <FinanceLayout params={params}>{children}</FinanceLayout>
      </NextIntlClientProvider>
    </Suspense>
  );
}
