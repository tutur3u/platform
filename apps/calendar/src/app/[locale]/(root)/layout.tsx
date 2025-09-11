import type React from 'react';
import Navbar from './navbar';

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50/30 dark:from-gray-900 dark:to-gray-800">
      <Navbar hideMetadata />
      <div id="main-content" className="flex flex-col">
        {children}
      </div>
    </div>
  );
}
