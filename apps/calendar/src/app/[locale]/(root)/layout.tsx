import ClientLayoutWrapper from './client-layout-wrapper';
import Navbar from './navbar';
import React from 'react';

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  return (
    <ClientLayoutWrapper>
      <Navbar hideMetadata />
      <div id="main-content" className="flex h-64 flex-col overflow-hidden">
        {children}
      </div>
    </ClientLayoutWrapper>
  );
}
