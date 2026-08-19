import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { type ReactNode, Suspense } from 'react';
import Footer from '@/components/layouts/Footer';
import {
  getClientMessages,
  UI_CLIENT_MESSAGE_NAMESPACES,
} from '@/i18n/client-messages';
import './shiki.css';
import { buildSidebarData } from './ui-docs-nav-data';
import { UiDocsShell } from './ui-docs-shell';
import { UiDocsTopbar } from './ui-docs-topbar';

interface Props {
  children: ReactNode;
  params: Promise<{
    locale: string;
  }>;
}

export async function UiDocsRuntime({ children, params }: Props) {
  const { locale } = await params;
  const normalizedLocale = locale === 'vi' ? 'vi' : 'en';

  const data = await buildSidebarData(normalizedLocale);
  const messages = getClientMessages(
    await getMessages(),
    UI_CLIENT_MESSAGE_NAMESPACES
  );

  return (
    <NextIntlClientProvider messages={messages}>
      <UiDocsShell
        data={data}
        footer={<Footer />}
        locale={normalizedLocale}
        topbar={<UiDocsTopbar />}
      >
        {children}
      </UiDocsShell>
    </NextIntlClientProvider>
  );
}

export default function UiDocsLayout(props: Props) {
  return (
    <Suspense fallback={<div className="min-h-screen bg-root-background" />}>
      <UiDocsRuntime {...props} />
    </Suspense>
  );
}
