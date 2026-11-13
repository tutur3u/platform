import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import type { ReactNode } from 'react';

export default async function DashboardIntlLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <NextIntlClientProvider messages={await getMessages()}>
      {children}
    </NextIntlClientProvider>
  );
}
