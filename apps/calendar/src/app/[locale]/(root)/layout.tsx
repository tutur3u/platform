import Navbar from './navbar';
import React from 'react';

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  return (
    <>
      <Navbar hideMetadata />
      <div id="main-content" className="flex flex-col">
        {children}
      </div>
    </>
  );
}
