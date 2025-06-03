import Navbar from './navbar';
import Footer from '@/components/Footer';
import React from 'react';

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  return (
    <>
      <Navbar hideMetadata />
      <div id="main-content" className="flex flex-col pt-8">
        {children}
      </div>
      <Footer />
    </>
  );
}
