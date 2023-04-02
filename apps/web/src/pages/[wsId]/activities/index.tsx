import { ReactElement, useEffect } from 'react';
import HeaderX from '../../../components/metadata/HeaderX';
import { PageWithLayoutProps } from '../../../types/PageWithLayoutProps';
import { enforceHasWorkspaces } from '../../../utils/serverless/enforce-has-workspaces';
import { useSegments } from '../../../hooks/useSegments';
import { useWorkspaces } from '../../../hooks/useWorkspaces';
import SidebarLayout from '../../../components/layouts/SidebarLayout';
import UnderConstructionTag from '../../../components/common/UnderConstructionTag';

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
      <UnderConstructionTag />
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
