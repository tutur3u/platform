import { SidebarPreference, useAppearance } from '../../hooks/useAppearance';
import Header from './Header';
import LeftSidebar from './LeftSidebar';
import RightSidebar from './RightSidebar';

interface SidebarLayoutProps {
  children: React.ReactNode;
}

const SidebarLayout = ({ children }: SidebarLayoutProps) => {
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
        className={`scrollbar-none fixed inset-0 flex h-full flex-col overflow-auto bg-[#111113] ${generateContentMargin(
          leftSidebarPref,
          rightSidebarPref
        )} transition-all duration-300`}
      >
        <Header />
        <div className="mt-16 md:mt-0">{children}</div>
      </main>

      <RightSidebar
        className={`transition-all duration-300 ${generateSidebarWidth(
          rightSidebarPref
        )}`}
      />
    </div>
  );
};

export default SidebarLayout;
