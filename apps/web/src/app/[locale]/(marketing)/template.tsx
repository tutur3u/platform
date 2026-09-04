import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import type { ReactNode } from 'react';
import {
  getClientMessages,
  MARKETING_CLIENT_MESSAGE_NAMESPACES,
  ROOT_CLIENT_MESSAGE_NAMESPACES,
} from '@/i18n/client-messages';

export default async function MarketingIntlTemplate({
  children,
}: {
  children: ReactNode;
}) {
  const messages = getClientMessages(await getMessages(), [
    ...ROOT_CLIENT_MESSAGE_NAMESPACES,
    ...MARKETING_CLIENT_MESSAGE_NAMESPACES,
  ]);

  return (
    <NextIntlClientProvider messages={messages}>
      {children}
    </NextIntlClientProvider>
  );
}
