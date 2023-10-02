'use client';

import { useState } from 'react';
import { Accordion, Divider } from '@mantine/core';
import PaginationSelector from '../../../../../components/selectors/PaginationSelector';
import ModeSelector, {
  Mode,
} from '../../../../../components/selectors/ModeSelector';
import { useLocalStorage } from '@mantine/hooks';
import AuditLogCard from '../../../../../components/cards/AuditLogCard';
import useSWR from 'swr';
import OperationMultiSelector from '../../../../../components/selectors/OperationMultiSelector';
import { AuditLog } from '../../../../../types/primitives/AuditLog';
import useTranslation from 'next-translate/useTranslation';
import { useUser } from '../../../../../hooks/useUser';
import WorkspaceMultiSelector from '../../../../../components/selectors/WorkspaceMultiSelector';

export default function UserActivitiesPage() {
  const { t } = useTranslation('settings-tabs');
  const { user } = useUser();

  const activitiesLabel = t('activities');

  const [activePage, setPage] = useState(1);

  const [ops, setOps] = useState<string[]>([]);
  const [wsIds, setWsIds] = useState<string[]>([]);

  const [itemsPerPage, setItemsPerPage] = useLocalStorage({
    key: 'activities-items-per-page',
    defaultValue: 15,
  });

  const apiPath = user?.id
    ? `/api/user/activities?ops=${ops.length > 0 ? ops.join(',') : ''}&wsIds=${
        wsIds.length > 0 ? wsIds.join(',') : ''
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
      {user?.id && (
        <>
          <div className="rounded-lg border border-zinc-300 bg-zinc-500/5 p-4 dark:border-zinc-800/80 dark:bg-zinc-900">
            <h1 className="text-2xl font-bold">{activitiesLabel}</h1>
            <p className="text-zinc-700 dark:text-zinc-400">
              {t('ws-activities:description')}
            </p>
          </div>
          <Divider className="my-4" />
        </>
      )}

      <div className="flex min-h-full w-full flex-col ">
        <div className="grid items-end gap-4 md:grid-cols-2 xl:grid-cols-4">
          <ModeSelector mode={mode} setMode={setMode} />
          <PaginationSelector
            items={itemsPerPage}
            setItems={(size) => {
              setPage(1);
              setItemsPerPage(size);
            }}
          />
          <OperationMultiSelector
            ops={ops}
            setOps={(newOps) => {
              setPage(1);
              setOps(newOps);
            }}
          />
          <WorkspaceMultiSelector
            wsIds={wsIds}
            setWsIds={(newWsIds) => {
              setPage(1);
              setWsIds(newWsIds);
            }}
          />
        </div>

        <Divider className="mt-4" variant="dashed" />
        {/* <PaginationIndicator
          activePage={activePage}
          setActivePage={setPage}
          itemsPerPage={itemsPerPage}
          totalItems={logsData?.count}
        /> */}

        <Accordion
          value={selectedLog}
          onChange={setSelectedLog}
          className={`grid gap-2 ${
            mode === 'grid' && 'md:grid-cols-2 xl:grid-cols-4'
          }`}
          variant="contained"
          classNames={{
            content:
              'border-t dark:border-zinc-300/10 border-zinc-500/10 dark:bg-zinc-900 dark:bg-zinc-500/5 pt-4 rounded-b',
            control:
              'rounded dark:bg-zinc-800/70 transition dark:hover:bg-zinc-800/70 hover:bg-zinc-100',
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
}
