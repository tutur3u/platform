import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import type React from 'react';
import { supportedLocales } from '@/i18n/routing';

interface LayoutProps {
  params: Promise<{
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

export default async function Layout({ children }: LayoutProps) {
  return <div>{children}</div>;
}
