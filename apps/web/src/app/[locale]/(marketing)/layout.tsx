import Footer from '@/components/layouts/Footer';
import type React from 'react';
import Navbar from '../navbar';

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  return (
    <>
      <Navbar hideMetadata />
      <div id="main-content" className="flex flex-col pt-[53px]">
        {children}
      </div>
      <Footer />
    </>
  );
}
