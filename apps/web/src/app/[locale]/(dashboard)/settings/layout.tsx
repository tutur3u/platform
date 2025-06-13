import Navbar from '../../navbar';
import NavbarPadding from '../../navbar-padding';
import { Separator } from '@ncthub/ui/separator';
import React from 'react';

interface LayoutProps {
  children: React.ReactNode;
}

export default async function Layout({ children }: LayoutProps) {
  // const navLinks: NavLink[] = [
  //   {
  //     name: 'Account',
  //     href: '/settings/account',
  //   },
  //   {
  //     name: 'Appearance',
  //     href: '/settings/appearance',
  //     disabled: true,
  //   },
  //   {
  //     name: 'Workspaces',
  //     href: '/settings/workspaces',
  //     disabled: true,
  //   },
  //   {
  //     name: 'Activities',
  //     href: '/settings/activities',
  //     disabled: true,
  //   },
  // ];

  return (
    <>
      <Navbar hideMetadata />
      <NavbarPadding>
        <Separator />
        <div
          id="main-content"
          className="flex items-center justify-center p-4 md:px-8 lg:px-16 xl:px-32"
        >
          {children}
        </div>
      </NavbarPadding>
    </>
  );
}
