import type React from 'react';

interface LayoutProps {
  children: React.ReactNode;
}

export default async function Layout({ children }: LayoutProps) {
  return (
    <div className="h-screen max-h-screen min-h-screen overflow-y-auto">
      {children}
    </div>
  );
}
