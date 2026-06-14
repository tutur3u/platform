import { setRequestLocale } from 'next-intl/server';
import type { ReactNode } from 'react';
import { buildSidebarData } from './ui-docs-nav-data';
import { UiDocsShell } from './ui-docs-shell';

interface Props {
  children: ReactNode;
  params: Promise<{
    locale: string;
  }>;
}

export default async function UiDocsLayout({ children, params }: Props) {
  const { locale } = await params;
  const normalizedLocale = locale === 'vi' ? 'vi' : 'en';
  setRequestLocale(normalizedLocale);

  const data = await buildSidebarData(normalizedLocale);

  return (
    <UiDocsShell data={data} locale={normalizedLocale}>
      {children}
    </UiDocsShell>
  );
}
