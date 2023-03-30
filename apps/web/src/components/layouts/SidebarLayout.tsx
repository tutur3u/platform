import { SidebarState, useAppearance } from '../../hooks/useAppearance';
import Header from './Header';
import LeftSidebar from './LeftSidebar';

interface SidebarLayoutProps {
  children: React.ReactNode;
}

const SidebarLayout = ({ children }: SidebarLayoutProps) => {
  const { sidebar } = useAppearance();

  const generateSidebarWidth = (state: SidebarState) =>
    state === 'closed' ? 'w-0 md:w-16' : 'w-full md:w-64';

  const generateLeftMargin = (state: SidebarState) =>
    state === 'closed' ? 'md:ml-16' : 'md:ml-64';

  return (
    <div className="flex h-screen min-h-screen w-full bg-[#111113]">
      <LeftSidebar
        className={`transition-all duration-300 ${generateSidebarWidth(
          sidebar
        )}`}
      />

      <main
        className={`scrollbar-none fixed inset-0 flex h-full flex-col overflow-auto bg-[#111113] ${generateLeftMargin(
          sidebar
        )} transition-all duration-300`}
      >
        <Header />
        <div className="mt-16 md:mt-0">{children}</div>
      </main>
    </div>
  );
};

export default SidebarLayout;
