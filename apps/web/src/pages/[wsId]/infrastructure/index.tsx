import { ReactElement, useEffect } from 'react';
import { useSegments } from '../../../hooks/useSegments';
import { PageWithLayoutProps } from '../../../types/PageWithLayoutProps';
import NestedLayout from '../../../components/layouts/NestedLayout';
import HeaderX from '../../../components/metadata/HeaderX';
import { useWorkspaces } from '../../../hooks/useWorkspaces';
import useTranslation from 'next-translate/useTranslation';
import { enforceRootWorkspace } from '../../../utils/serverless/enforce-root-workspace';

export const getServerSideProps = enforceRootWorkspace;

const InfrastructureOverviewPage: PageWithLayoutProps = () => {
  const { setRootSegment } = useSegments();
  const { ws } = useWorkspaces();

  const { t } = useTranslation('infrastructure-tabs');

  const infrastructureLabel = t('infrastructure');
  const overviewLabel = t('overview');

  useEffect(() => {
    setRootSegment(
      ws
        ? [
            {
              content: ws?.name || 'Tổ chức không tên',
              href: `/${ws.id}`,
            },
            { content: infrastructureLabel, href: `/${ws.id}/infrastructure` },
            { content: overviewLabel, href: `/${ws.id}/infrastructure` },
          ]
        : []
    );

    return () => setRootSegment([]);
  }, [infrastructureLabel, overviewLabel, ws, setRootSegment]);

  return (
    <>
      <HeaderX label={`${overviewLabel} – ${infrastructureLabel}`} />
      <div className="flex min-h-full w-full flex-col pb-8">
        <div className="mt-2 grid items-end gap-4 md:grid-cols-2 xl:grid-cols-4"></div>
      </div>
    </>
  );
};

InfrastructureOverviewPage.getLayout = function getLayout(page: ReactElement) {
  return <NestedLayout mode="infrastructure">{page}</NestedLayout>;
};

export default InfrastructureOverviewPage;
