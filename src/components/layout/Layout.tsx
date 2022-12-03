import LeftSidebar from './LeftSidebar';
import { FC } from 'react';
import Header from './Header';
import RightSidebar from './RightSidebar';
import { SidebarPreference, useAppearance } from '../../hooks/useAppearance';
import { useUserList } from '../../hooks/useUserList';

interface LayoutProps {
  children: React.ReactNode;
}

const Layout: FC<LayoutProps> = ({ children }: LayoutProps) => {
  const { contentWidth, leftSidebar, rightSidebar } = useAppearance();
  const { users } = useUserList();

  const generateSidebarWidth = (pref: SidebarPreference) => {
    switch (pref) {
      case 'closed':
        return 'w-16';

      case 'open':
        return 'w-64';

      case 'auto':
        return 'w-16 hover:w-64';

      case 'hidden':
        return 'md:hidden';

      default:
        return '';
    }
  };

  return (
    <div className="flex h-screen min-h-screen w-full bg-[#111113]">
      <LeftSidebar
        className={`transition-all duration-300 ${generateSidebarWidth(
          leftSidebar
        )}`}
      />

      <main
        className={`fixed left-0 right-0 top-0 flex h-screen min-h-full flex-col gap-5 overflow-auto bg-[#111113] p-7 scrollbar-none ${
          contentWidth === 'padded' && 'lg:px-56'
        } ${
          leftSidebar === 'hidden' ||
          (leftSidebar === 'open' ? 'md:left-64' : 'md:left-16')
        } ${
          rightSidebar === 'hidden' ||
          users.length === 0 ||
          (rightSidebar === 'open' ? 'md:right-64' : 'md:right-16')
        } transition-all duration-300`}
      >
        <Header />
        <div className="h-full">{children}</div>
      </main>

      <RightSidebar
        className={`transition-all duration-300 ${generateSidebarWidth(
          rightSidebar
        )}`}
      />
    </div>
  );
};

export default Layout;
