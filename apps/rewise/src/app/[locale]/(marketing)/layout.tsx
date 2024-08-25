import React from 'react';

interface LayoutProps {
  children: React.ReactNode;
}

export default async function Layout({ children }: LayoutProps) {
  return (
    <div
      id="main-content"
      className="flex h-screen max-h-screen min-h-screen flex-col overflow-y-auto"
    >
      {children}
    </div>
  );
}
