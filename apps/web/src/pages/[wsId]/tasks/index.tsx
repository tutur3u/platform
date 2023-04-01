import { ReactElement, useEffect } from 'react';
import HeaderX from '../../../components/metadata/HeaderX';
import { PageWithLayoutProps } from '../../../types/PageWithLayoutProps';
import { DEV_MODE } from '../../../constants/common';
import SidebarLayout from '../../../components/layouts/SidebarLayout';
import { useSegments } from '../../../hooks/useSegments';

const TasksPage: PageWithLayoutProps = () => {
  const { setRootSegment } = useSegments();

  useEffect(() => {
    setRootSegment({
      content: 'Tasks',
      href: '/finance',
    });
  }, [setRootSegment]);

  if (!DEV_MODE)
    return (
      <>
        <HeaderX label="Tasks" />
        <div className="p-4 md:h-screen md:p-8">
          <div className="flex h-full min-h-full w-full items-center justify-center rounded-lg border border-purple-300/20 bg-purple-300/10 p-8 text-center text-2xl font-semibold text-purple-300 md:text-6xl">
            Under construction 🚧
          </div>
        </div>
      </>
    );

  return (
    <>
      <HeaderX label="Tasks" />
      <div className="flex h-full w-full flex-col p-6"></div>
    </>
  );
};

TasksPage.getLayout = function getLayout(page: ReactElement) {
  return <SidebarLayout>{page}</SidebarLayout>;
};

export default TasksPage;
