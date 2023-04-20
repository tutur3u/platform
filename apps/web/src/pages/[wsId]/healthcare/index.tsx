import { ReactElement, useEffect } from 'react';
import HeaderX from '../../../components/metadata/HeaderX';
import { PageWithLayoutProps } from '../../../types/PageWithLayoutProps';
import { enforceHasWorkspaces } from '../../../utils/serverless/enforce-has-workspaces';
import NestedLayout from '../../../components/layouts/NestedLayout';
import { useWorkspaces } from '../../../hooks/useWorkspaces';
import { useSegments } from '../../../hooks/useSegments';
import StatisticCard from '../../../components/cards/StatisticCard';
import useSWR from 'swr';

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

  const checkupsCountApi = ws?.id
    ? `/api/workspaces/${ws.id}/healthcare/checkups/count`
    : null;

  const diagnosesCountApi = ws?.id
    ? `/api/workspaces/${ws.id}/healthcare/diagnoses/count`
    : null;

  const vitalsCountApi = ws?.id
    ? `/api/workspaces/${ws.id}/healthcare/vitals/count`
    : null;

  const groupsCountApi = ws?.id
    ? `/api/workspaces/${ws.id}/healthcare/vital-groups/count`
    : null;

  const { data: checkups } = useSWR<number>(checkupsCountApi);
  const { data: diagnoses } = useSWR<number>(diagnosesCountApi);
  const { data: vitals } = useSWR<number>(vitalsCountApi);
  const { data: groups } = useSWR<number>(groupsCountApi);

  return (
    <>
      <HeaderX label="Tổng quan – Khám bệnh" />
      <div className="flex min-h-full w-full flex-col pb-8">
        <div className="mt-2 grid items-end gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatisticCard
            title="Kiểm tra sức khoẻ"
            color="blue"
            value={checkups}
            href={`/${ws?.id}/healthcare/checkups`}
          />

          <StatisticCard
            title="Chẩn đoán"
            value={diagnoses}
            href={`/${ws?.id}/healthcare/diagnoses`}
          />

          <StatisticCard
            title="Chỉ số"
            value={vitals}
            href={`/${ws?.id}/healthcare/vitals`}
          />

          <StatisticCard
            title="Nhóm chỉ số"
            value={groups}
            href={`/${ws?.id}/healthcare/vital-groups`}
          />
        </div>
      </div>
    </>
  );
};

MiscOverviewPage.getLayout = function getLayout(page: ReactElement) {
  return <NestedLayout mode="healthcare">{page}</NestedLayout>;
};

export default MiscOverviewPage;
