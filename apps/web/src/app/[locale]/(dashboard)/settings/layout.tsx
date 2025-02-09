import Navbar from '../../navbar';
import NavbarPadding from '../../navbar-padding';
import React from 'react';

interface LayoutProps {
  children: React.ReactNode;
}

export default async function Layout({ children }: LayoutProps) {
  return (
    <>
      <Navbar hideMetadata />
      <NavbarPadding />
      <div
        id="main-content"
        className="flex items-center justify-center p-4 md:px-8 lg:px-16 xl:px-32"
      >
        {children}
      </div>
    </>
  );
}
