'use client';

import AuditLogCard from '@/components/cards/AuditLogCard';
import { AuditLog } from '@/types/primitives/audit-log';
import { Accordion } from '@mantine/core';
import { useState } from 'react';

interface Props {
  logs: AuditLog[];
}

export default function LogList({ logs }: Props) {
  const [selectedLog, setSelectedLog] = useState<string | null>(null);

  return (
    <Accordion
      value={selectedLog}
      onChange={setSelectedLog}
      className="grid gap-2"
      variant="contained"
      classNames={{
        content:
          'border-t dark:border-zinc-300/10 border-zinc-500/10 dark:bg-zinc-900 dark:bg-zinc-500/5 pt-4 rounded-b',
        control:
          'rounded dark:bg-zinc-800/70 transition dark:hover:bg-zinc-800/70 hover:bg-zinc-100',
        item: 'rounded',
      }}
    >
      {logs &&
        logs?.map((log) => (
          <AuditLogCard
            data={log}
            key={`log-${log.id}`}
            isExpanded={selectedLog === `log-${log.id}`}
          />
        ))}
    </Accordion>
  );
}
