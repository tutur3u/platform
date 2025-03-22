import ClientLayoutWrapper from './client-layout-wrapper';
import Navbar from './navbar';
import { useTranslations } from 'next-intl';
import React from 'react';

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const t = useTranslations('calendar');

  // Create the default labels object for the calendar
  const defaultLabels = {
    day: t('day'),
    '4-days': t('4-days'),
    week: t('week'),
    month: t('month'),
  };

  return (
    <ClientLayoutWrapper defaultLabels={defaultLabels}>
      <Navbar hideMetadata />
      <div id="main-content" className="flex flex-col">
        {children}
      </div>
    </ClientLayoutWrapper>
  );
}
