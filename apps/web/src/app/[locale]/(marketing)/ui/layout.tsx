import type { ReactNode } from 'react';
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

  return <UiDocsShell locale={normalizedLocale}>{children}</UiDocsShell>;
}
