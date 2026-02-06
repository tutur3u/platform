import type React from 'react';
import Footer from '@/components/layouts/Footer';
import Navbar from '../navbar';
import { ScrollToTop } from './scroll-to-top';

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  return (
    <>
      <ScrollToTop />
      <Navbar hideMetadata />
      <div
        id="main-content"
        className="flex flex-col overflow-x-clip pt-14.25"
      >
        {children}
      </div>
      <Footer />
    </>
  );
}
