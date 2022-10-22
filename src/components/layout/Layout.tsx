import Sidebar from './Sidebar';
import React, { FC } from 'react';
import Header from './Header';

interface LayoutProps {
  children: React.ReactNode;
}

const Layout: FC<LayoutProps> = ({ children }) => {
  return (
    <div className="flex w-full h-screen min-h-screen">
      <Sidebar className="w-[4.5rem] hover:w-[16rem] transition-all duration-300" />
      <div></div>
      <main className="flex flex-col p-7 gap-5 h-screen fixed left-[4.5rem] right-0 top-0 min-h-full overflow-scroll bg-zinc-700">
        <Header />
        <div>{children}</div>
      </main>
    </div>
  );
};

export default Layout;
