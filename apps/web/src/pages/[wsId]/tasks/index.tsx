import { ReactElement, useEffect } from 'react';
import HeaderX from '../../../components/metadata/HeaderX';
import { PageWithLayoutProps } from '../../../types/PageWithLayoutProps';
import { DEV_MODE } from '../../../constants/common';
import SidebarLayout from '../../../components/layouts/SidebarLayout';
import { useSegments } from '../../../hooks/useSegments';
import UnderConstructionTag from '../../../components/common/UnderConstructionTag';

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
        <UnderConstructionTag />
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
