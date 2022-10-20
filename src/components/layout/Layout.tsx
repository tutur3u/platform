import Navbar from './Navbar';
import React, { FC } from 'react';
import Sidebar from './Sidebar';
import { useSidebar } from '../../hooks/useSidebar';

interface LayoutProps {
  children: React.ReactNode;
}

const Layout: FC<LayoutProps> = ({ children }) => {
  const { isCollapsed } = useSidebar();

  const mainCSS = `p-10 flex-1 scrollbar-thin scrollbar-track-zinc-800 scrollbar-thumb-zinc-700 overflow-x-hidden ${
    isCollapsed ? 'md:ml-[4rem]' : 'md:ml-[16rem]'
  }`;

  const sidebarCSS = isCollapsed
    ? 'hidden md:block md:w-[4rem] md:hover:w-[16rem] transition-all duration-300'
    : 'w-screen md:w-[16rem]';

  const navbarCSS = `overflow-x-hidden ${
    isCollapsed ? 'md:pl-[4rem]' : 'md:pl-[16rem]'
  }`;

  return (
    <div className="flex w-full h-screen min-h-screen">
      <Sidebar className={sidebarCSS} />
      <div className="w-full min-h-full flex flex-col">
        <Navbar className={navbarCSS} />
        <div className="bg-[#111113] flex h-full flex-col">
          <main className={mainCSS}>{children}</main>
        </div>
      </div>
    </div>
  );
};

export default Layout;
