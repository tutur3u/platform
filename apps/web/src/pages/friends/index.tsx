import { ReactElement, useEffect } from 'react';
import HeaderX from '../../components/metadata/HeaderX';
import { useAppearance } from '../../hooks/useAppearance';
import { useUserData } from '../../hooks/useUserData';
import { useUserList } from '../../hooks/useUserList';
import { PageWithLayoutProps } from '../../types/PageWithLayoutProps';
import SidebarLayout from '../../components/layouts/SidebarLayout';

const FriendsPage: PageWithLayoutProps = () => {
  const { setRootSegment, changeLeftSidebarSecondaryPref } = useAppearance();
  const { updateUsers } = useUserList();
  const { data } = useUserData();

  useEffect(() => {
    changeLeftSidebarSecondaryPref('hidden');
    setRootSegment({
      content: 'Friends',
      href: '/expenses',
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (data) updateUsers([data]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  return (
    <>
      <HeaderX label="Friends" />
      <div className="p-4 md:h-screen md:p-8">
        <div className="flex h-full min-h-full w-full items-center justify-center rounded-lg border border-purple-300/20 bg-purple-300/10 p-8 text-center text-2xl font-semibold text-purple-300 md:text-6xl">
          Under construction 🚧
        </div>
      </div>
    </>
  );
};

FriendsPage.getLayout = function getLayout(page: ReactElement) {
  return <SidebarLayout>{page}</SidebarLayout>;
};

export default FriendsPage;
