import Navbar from '../navbar';
import NavbarPadding from '../navbar-padding';
import Footer from '@/components/layouts/Footer';
import React from 'react';

interface LayoutProps {
  children: React.ReactNode;
}

export default async function Layout({ children }: LayoutProps) {
  return (
    <>
      <Navbar hideMetadata />
      <NavbarPadding>
        <div
          id="main-content"
          className="flex h-screen max-h-screen flex-col overflow-y-auto"
        >
          {children}
          <Footer />
        </div>
      </NavbarPadding>
    </>
  );
}
