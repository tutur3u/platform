import { setRequestLocale } from 'next-intl/server';
import type React from 'react';
import type { Locale } from '@/i18n/routing';
import ServerLayout from './server-layout';

interface LayoutProps {
  params: Promise<{
    locale: string;
  }>;
  children: React.ReactNode;
}

export default async function Layout({ params, children }: LayoutProps) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  return <ServerLayout>{children}</ServerLayout>;
}
