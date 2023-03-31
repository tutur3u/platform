import { ReactElement, useEffect } from 'react';
import HeaderX from '../../../components/metadata/HeaderX';
import { PageWithLayoutProps } from '../../../types/PageWithLayoutProps';
import { enforceHasWorkspaces } from '../../../utils/serverless/enforce-has-workspaces';
import NestedLayout from '../../../components/layouts/NestedLayout';
import { useWorkspaces } from '../../../hooks/useWorkspaces';
import { useSegments } from '../../../hooks/useSegments';

export const getServerSideProps = enforceHasWorkspaces;

const MiscOverviewPage: PageWithLayoutProps = () => {
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
            { content: 'Khám bệnh', href: `/${ws.id}/healthcare` },
            {
              content: 'Tổng quan',
              href: `/${ws.id}/healthcare`,
            },
          ]
        : []
    );

    return () => setRootSegment([]);
  }, [ws, setRootSegment]);

  return (
    <>
      <HeaderX label="Tổng quan – Khám bệnh" />
      <div className="flex min-h-full w-full flex-col pb-8"></div>
    </>
  );
};

MiscOverviewPage.getLayout = function getLayout(page: ReactElement) {
  return <NestedLayout mode="healthcare">{page}</NestedLayout>;
};

export default MiscOverviewPage;
