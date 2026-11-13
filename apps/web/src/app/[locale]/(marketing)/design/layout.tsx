import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { type ReactNode, Suspense } from 'react';
import {
  getClientMessages,
  UI_CLIENT_MESSAGE_NAMESPACES,
} from '@/i18n/client-messages';
import { DesignFrameFallback } from '../../ui/design-frame';
import '../../ui/shiki.css';
import { buildSidebarData } from '../../ui/ui-docs-nav-data';
import { UiDocsShell } from '../../ui/ui-docs-shell';

interface Props {
  children: ReactNode;
  params: Promise<{
    locale: string;
  }>;
}

export async function DesignRuntime({ children, params }: Props) {
  const { locale } = await params;
  const normalizedLocale = locale === 'vi' ? 'vi' : 'en';
  const data = await buildSidebarData(normalizedLocale);
  const messages = getClientMessages(
    await getMessages(),
    UI_CLIENT_MESSAGE_NAMESPACES
  );

  return (
    <NextIntlClientProvider messages={messages}>
      <UiDocsShell data={data} frame="marketing" locale={normalizedLocale}>
        {children}
      </UiDocsShell>
    </NextIntlClientProvider>
  );
}

export default function DesignLayout(props: Props) {
  return (
    <Suspense fallback={<DesignFrameFallback />}>
      <DesignRuntime {...props} />
    </Suspense>
  );
}
