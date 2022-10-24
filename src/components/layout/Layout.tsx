import LeftSidebar from './LeftSidebar';
import React, { FC } from 'react';
import Header from './Header';
import RightSidebar from './RightSidebar';
import { useAppearance } from '../../hooks/useAppearance';

interface LayoutProps {
  label?: string;
  children: React.ReactNode;
}

const Layout: FC<LayoutProps> = ({ label, children }) => {
  const { contentWidth } = useAppearance();

  return (
    <div className="flex w-full h-screen min-h-screen">
      <LeftSidebar className="w-[4rem] hover:w-[16rem] transition-all duration-300" />
      <main
        className={`bg-[#111113] scrollbar-thin scrollbar-track-zinc-800 scrollbar-thumb-zinc-700 flex flex-col p-7 gap-5 h-screen fixed left-0 right-0 md:left-16 md:right-16 top-0 min-h-full overflow-auto ${
          contentWidth === 'padded' && 'md:px-56'
        }`}
      >
        <Header label={label} />
        <div>{children}</div>
      </main>
      <RightSidebar className="w-[4rem] hover:w-[16rem] transition-all duration-300" />
    </div>
  );
};

export default Layout;
