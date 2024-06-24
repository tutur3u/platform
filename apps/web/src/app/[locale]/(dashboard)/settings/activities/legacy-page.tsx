'use client';

import AuditLogCard from '../../../../../components/cards/AuditLogCard';
import { AuditLog } from '@/types/primitives/audit-log';
import { Accordion, Divider } from '@mantine/core';
import { useLocalStorage } from '@mantine/hooks';
import useTranslation from 'next-translate/useTranslation';
import { Suspense, useState } from 'react';
import useSWR from 'swr';

export default function UserActivitiesPage() {
  const { t } = useTranslation('settings-tabs');
  const user = { id: 'TO-BE-REFACTORED' };

  const activitiesLabel = t('activities');

  const [activePage] = useState(1);

  const [ops] = useState<string[]>([]);
  const [wsIds] = useState<string[]>([]);

  const [itemsPerPage] = useLocalStorage({
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

  const [selectedLog, setSelectedLog] = useState<string | null>(null);

  return (
    <Suspense>
      {user?.id && (
        <>
          <div className="border-border bg-foreground/5 rounded-lg border p-4">
            <h1 className="text-2xl font-bold">{activitiesLabel}</h1>
            <p className="text-foreground/80">
              {t('ws-activities:description')}
            </p>
          </div>
          <Divider className="my-4" />
        </>
      )}

      <div className="flex min-h-full w-full flex-col">
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
          className={`grid gap-2 ${'md:grid-cols-2 xl:grid-cols-4'}`}
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
    </Suspense>
  );
}
