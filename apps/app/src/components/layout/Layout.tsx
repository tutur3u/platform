import LeftSidebar from './LeftSidebar';
import { FC } from 'react';
import RightSidebar from './RightSidebar';
import { SidebarPreference, useAppearance } from '../../hooks/useAppearance';
import Header from './Header';

interface LayoutProps {
  children: React.ReactNode;
}

const Layout: FC<LayoutProps> = ({ children }: LayoutProps) => {
  const { leftSidebarPref, rightSidebarPref } = useAppearance();

  const generateSidebarWidth = (pref: SidebarPreference) => {
    switch (pref.main) {
      case 'closed': {
        if (pref.secondary === 'hidden') return 'w-0 md:w-16';
        return 'w-full md:w-96';
      }

      case 'open': {
        if (pref.secondary === 'hidden') return 'w-64';
        return 'w-full md:w-96';
      }

      case 'auto': {
        if (pref.secondary === 'hidden') return 'w-16 hover:w-64';
        return 'w-48 hover:w-96';
      }

      case 'hidden': {
        return 'md:hidden';
      }
    }
  };

  const generateLeftMargin = (pref: SidebarPreference) => {
    switch (pref.main) {
      case 'closed': {
        if (pref.secondary === 'hidden') return 'md:ml-16';
        return 'md:ml-96';
      }

      case 'open': {
        if (pref.secondary === 'hidden') return 'md:ml-64';
        return 'md:ml-96';
      }

      case 'auto': {
        if (pref.secondary === 'hidden') return 'md:ml-16 md:hover:ml-64';
        return 'md:ml-48 md:hover:ml-96';
      }

      case 'hidden': {
        return 'md:ml-0';
      }
    }
  };

  const generateRightMargin = (pref: SidebarPreference) => {
    switch (pref.main) {
      case 'closed': {
        if (pref.secondary === 'hidden') return 'md:mr-16';
        return 'md:mr-96';
      }

      case 'open': {
        if (pref.secondary === 'hidden') return 'md:mr-64';
        return 'md:mr-96';
      }

      case 'auto': {
        if (pref.secondary === 'hidden') return 'md:mr-16 md:hover:mr-64';
        return 'md:mr-48 md:hover:mr-96';
      }

      case 'hidden': {
        return 'md:mr-0';
      }
    }
  };

  const generateContentMargin = (
    leftSidebarPref: SidebarPreference,
    rightSidebarPref: SidebarPreference
  ) => {
    return `${generateLeftMargin(leftSidebarPref)} ${generateRightMargin(
      rightSidebarPref
    )}`;
  };

  return (
    <div className="flex h-screen min-h-screen w-full bg-[#111113]">
      <LeftSidebar
        className={`transition-all duration-300 ${generateSidebarWidth(
          leftSidebarPref
        )}`}
      />

      <main
        className={`scrollbar-none fixed left-0 right-0 top-0 flex h-full flex-col overflow-auto bg-[#111113] ${generateContentMargin(
          leftSidebarPref,
          rightSidebarPref
        )} transition-all duration-300`}
      >
        <Header />
        <div className="mt-20 md:mt-0">{children}</div>
      </main>

      <RightSidebar
        className={`transition-all duration-300 ${generateSidebarWidth(
          rightSidebarPref
        )}`}
      />
    </div>
  );
};

export default Layout;
