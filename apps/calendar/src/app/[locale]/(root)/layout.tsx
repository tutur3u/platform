import ClientLayoutWrapper from './client-layout-wrapper';
import Navbar from './navbar';
import React from 'react';

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  // Create the default labels object for the calendar
  // const defaultLabels = {
  //   day: t('day'),
  //   '4-days': t('4-days'),
  //   week: t('week'),
  //   month: t('month'),
  // };

  return (
    <ClientLayoutWrapper>
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50/30 dark:from-gray-900 dark:to-gray-800">
        <Navbar hideMetadata />
        <div id="main-content" className="flex flex-col">
          {children}
        </div>
      </div>
    </ClientLayoutWrapper>
  );
}
