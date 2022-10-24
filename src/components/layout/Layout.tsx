import LeftSidebar from './LeftSidebar';
import React, { FC } from 'react';
import Header from './Header';
import styles from './layout.module.css';
import RightSidebar from './RightSidebar';

interface LayoutProps {
  label?: string;
  children: React.ReactNode;
}

const Layout: FC<LayoutProps> = ({ label, children }) => {
  return (
    <div className="flex w-full h-screen min-h-screen">
      <LeftSidebar className="w-[4rem] hover:w-[16rem] transition-all duration-300" />
      <main
        className={`${styles.scrollbar} bg-[#111113] md:px-56 flex flex-col p-7 gap-5 h-screen fixed left-0 right-0 md:left-16 md:right-16 top-0 min-h-full overflow-scroll`}
      >
        <Header label={label} />
        <div>{children}</div>
      </main>
      <RightSidebar className="w-[4rem] hover:w-[16rem] transition-all duration-300" />
    </div>
  );
};

export default Layout;
