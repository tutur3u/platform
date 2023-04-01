import { ReactElement, useEffect } from 'react';
import HeaderX from '../../../components/metadata/HeaderX';
import { PageWithLayoutProps } from '../../../types/PageWithLayoutProps';
import { enforceHasWorkspaces } from '../../../utils/serverless/enforce-has-workspaces';
import { useSegments } from '../../../hooks/useSegments';
import { useWorkspaces } from '../../../hooks/useWorkspaces';
import SidebarLayout from '../../../components/layouts/SidebarLayout';

export const getServerSideProps = enforceHasWorkspaces;

const HistoryPage: PageWithLayoutProps = () => {
  const { setRootSegment } = useSegments();
  const { ws } = useWorkspaces();

  useEffect(() => {
    setRootSegment(
      ws
        ? [
            {
              content: ws?.name || 'Tổ chức không tên',
              href: `/${ws.id}`,
            },
            { content: 'Lịch sử', href: `/${ws.id}/activities` },
          ]
        : []
    );

    return () => setRootSegment([]);
  }, [ws, setRootSegment]);

  //   if (!DEV_MODE)
  return (
    <>
      <HeaderX label="Classes" />
      <div className="p-4 md:h-screen md:p-8">
        <div className="flex h-full min-h-full w-full items-center justify-center rounded-lg border border-purple-300/20 bg-purple-300/10 p-8 text-center text-2xl font-semibold text-purple-300 md:text-6xl">
          Under construction 🚧
        </div>
      </div>
    </>
  );

  //   return (
  //     <>
  //       <HeaderX label="Classes" />
  //       <div className="flex-col p-6 flex h-full w-full"></div>
  //     </>
  //   );
};

HistoryPage.getLayout = function getLayout(page: ReactElement) {
  return <SidebarLayout>{page}</SidebarLayout>;
};

export default HistoryPage;
