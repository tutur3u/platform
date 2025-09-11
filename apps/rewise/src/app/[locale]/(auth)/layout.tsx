import type React from 'react';
import Navbar from '../navbar';
import NavbarPadding from '../navbar-padding';

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
          className="h-screen max-h-screen min-h-screen overflow-y-auto"
        >
          {children}
        </div>
      </NavbarPadding>
    </>
  );
}
