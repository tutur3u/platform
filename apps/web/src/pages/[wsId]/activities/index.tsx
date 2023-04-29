import { ReactElement, useEffect, useState } from 'react';
import HeaderX from '../../../components/metadata/HeaderX';
import { PageWithLayoutProps } from '../../../types/PageWithLayoutProps';
import { enforceHasWorkspaces } from '../../../utils/serverless/enforce-has-workspaces';
import { useSegments } from '../../../hooks/useSegments';
import { useWorkspaces } from '../../../hooks/useWorkspaces';
import NestedLayout from '../../../components/layouts/NestedLayout';
import PaginationIndicator from '../../../components/pagination/PaginationIndicator';
import { Accordion, Divider } from '@mantine/core';
import PaginationSelector from '../../../components/selectors/PaginationSelector';
import ModeSelector, { Mode } from '../../../components/selectors/ModeSelector';
import { useLocalStorage } from '@mantine/hooks';
import AuditLogCard from '../../../components/cards/AuditLogCard';
import useSWR from 'swr';
import OperationMultiSelector from '../../../components/selectors/OperationMultiSelector';
import WorkspaceMemberMultiSelector from '../../../components/selectors/WorkspaceMemberMultiSelector';
import { AuditLog } from '../../../types/primitives/AuditLog';
import useTranslation from 'next-translate/useTranslation';

export const getServerSideProps = enforceHasWorkspaces;

const HistoryPage: PageWithLayoutProps = () => {
  const { t } = useTranslation('sidebar-tabs');

  const { setRootSegment } = useSegments();
  const { ws } = useWorkspaces();

  const activitiesLabel = t('activities');

  useEffect(() => {
    setRootSegment(
      ws
        ? [
            {
              content: ws?.name || 'Tổ chức không tên',
              href: `/${ws.id}`,
            },
            { content: activitiesLabel, href: `/${ws.id}/activities` },
          ]
        : []
    );

    return () => setRootSegment([]);
  }, [ws, activitiesLabel, setRootSegment]);

  const [activePage, setPage] = useState(1);

  const [ops, setOps] = useState<string[]>([]);
  const [userIds, setUserIds] = useState<string[]>([]);

  const [itemsPerPage, setItemsPerPage] = useLocalStorage({
    key: 'activities-items-per-page',
    defaultValue: 15,
  });

  const apiPath = ws?.id
    ? `/api/workspaces/${ws?.id}/activities?ops=${
        ops.length > 0 ? ops.join(',') : ''
      }&userIds=${
        userIds.length > 0 ? userIds.join(',') : ''
      }&page=${activePage}&itemsPerPage=${itemsPerPage}`
    : null;

  const { data: logsData } = useSWR<{ data: AuditLog[]; count: number }>(
    apiPath
  );

  const [mode, setMode] = useLocalStorage<Mode>({
    key: 'activities-mode',
    defaultValue: 'list',
  });

  const [selectedLog, setSelectedLog] = useState<string | null>(null);

  return (
    <>
      <HeaderX label={activitiesLabel} />
      <div className="flex min-h-full w-full flex-col pb-20">
        <div className="mt-2 grid items-end gap-4 md:grid-cols-2 xl:grid-cols-4">
          <ModeSelector mode={mode} setMode={setMode} />
          <PaginationSelector
            items={itemsPerPage}
            setItems={(size) => {
              setPage(1);
              setItemsPerPage(size);
            }}
          />
          <OperationMultiSelector ops={ops} setOps={setOps} />
          <WorkspaceMemberMultiSelector
            userIds={userIds}
            setUserIds={setUserIds}
          />
        </div>

        <Divider className="mt-4" />
        <PaginationIndicator
          activePage={activePage}
          setActivePage={setPage}
          itemsPerPage={itemsPerPage}
          totalItems={logsData?.count}
        />

        <Accordion
          value={selectedLog}
          onChange={setSelectedLog}
          className={`grid gap-2 ${
            mode === 'grid' && 'md:grid-cols-2 xl:grid-cols-4'
          }`}
          variant="contained"
          classNames={{
            content: 'border-t border-zinc-300/10 bg-zinc-900 pt-4 rounded-b',
            control: 'rounded bg-zinc-800/70 transition hover:bg-zinc-800/70',
            item: 'rounded',
          }}
        >
          {logsData &&
            logsData.data?.map((log) => (
              <AuditLogCard
                data={log}
                key={`log-${log.id}`}
                isExpanded={selectedLog === `log-${log.id}`}
              />
            ))}
        </Accordion>
      </div>
    </>
  );
};

HistoryPage.getLayout = function getLayout(page: ReactElement) {
  return <NestedLayout>{page}</NestedLayout>;
};

export default HistoryPage;
