import Navbar from '../navbar';
import NavbarPadding from '../navbar-padding';
import React from 'react';

interface LayoutProps {
  children: React.ReactNode;
}

export default async function Layout({ children }: LayoutProps) {
  return (
    <>
      <Navbar hideMetadata />
      <NavbarPadding>
        <div id="main-content" className="h-full overflow-y-auto">
          {children}
        </div>
      </NavbarPadding>
    </>
  );
}
