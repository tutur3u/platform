'use client';

import AuditLogCard from '@/components/cards/AuditLogCard';
import { AuditLog } from '@/types/primitives/audit-log';
import { Accordion } from '@repo/ui/components/ui/accordion';
import { useState } from 'react';

interface Props {
  logs: AuditLog[];
}

export default function LogList({ logs }: Props) {
  const [selectedLogs, setSelectedLogs] = useState<string[]>();

  return (
    <Accordion
      type="multiple"
      value={selectedLogs}
      onValueChange={setSelectedLogs}
      className="grid gap-2"
    >
      {logs &&
        logs?.map((log) => (
          <AuditLogCard
            data={log}
            key={`log-${log.id}`}
            isExpanded={selectedLogs?.includes(`log-${log.id}`) || false}
          />
        ))}
    </Accordion>
  );
}
