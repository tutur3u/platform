'use client';

import type { AuditLog } from '@tuturuuu/types/primitives/audit-log';
import { Accordion } from '@tuturuuu/ui/accordion';
import { useState } from 'react';
import AuditLogCard from '@/components/cards/AuditLogCard';

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
