import Sidebar from './Sidebar';
import React, { FC } from 'react';
import Header from './Header';
import styles from './layout.module.css';

interface LayoutProps {
  children: React.ReactNode;
}

const Layout: FC<LayoutProps> = ({ children }) => {
  return (
    <div className="flex w-full h-screen min-h-screen">
      <Sidebar className="w-[4rem] hover:w-[16rem] transition-all duration-300" />
      <main
        className={`${styles.scrollbar} bg-[#111113] flex flex-col p-7 gap-5 h-screen fixed left-[4rem] right-0 top-0 min-h-full overflow-scroll`}
      >
        <Header />
        <div>{children}</div>
      </main>
    </div>
  );
};

export default Layout;
