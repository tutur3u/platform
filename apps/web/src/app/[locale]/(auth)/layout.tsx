import { SorbetRouteScope } from '@tuturuuu/ui/custom/sorbet-route-scope';
import { NO_INDEX_ROBOTS } from '@tuturuuu/utils/common/metadata';
import { resolveRequestLocale } from '@tuturuuu/utils/i18n-root-locale';
import type { Metadata } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import type { ReactNode } from 'react';
import {
  AUTH_CLIENT_MESSAGE_NAMESPACES,
  getClientMessages,
} from '@/i18n/client-messages';
import { defaultLocale, supportedLocales } from '@/i18n/routing';

export const metadata: Metadata = {
  robots: NO_INDEX_ROBOTS,
};

export default async function AuthLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const locale = resolveRequestLocale(
    supportedLocales,
    (await params).locale,
    defaultLocale
  );
  const messages = getClientMessages(
    await getMessages({ locale }),
    AUTH_CLIENT_MESSAGE_NAMESPACES
  );

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      {/* Sign-in pages use the Sorbet design for everyone, signed out too. */}
      <SorbetRouteScope />
      {children}
    </NextIntlClientProvider>
  );
}
