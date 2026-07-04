'use client';

import { useState } from 'react';
import { CustomDataTable } from '@/components/custom-data-table';
import { type EmailAuditRecord, getEmailAuditColumns } from './columns';
import { EmailDetailsDialog } from './email-details-dialog';

interface Props {
  data: EmailAuditRecord[];
  count: number;
  locale: string;
  filters: React.ReactNode;
}

export function EmailAuditTable({ data, count, locale, filters }: Props) {
  const [selectedRecord, setSelectedRecord] = useState<EmailAuditRecord | null>(
    null
  );

  return (
    <>
      <CustomDataTable
        data={data}
        namespace="email-audit-data-table"
        columnGenerator={getEmailAuditColumns}
        extraData={{
          locale,
          onViewDetails: setSelectedRecord,
        }}
        count={count}
        defaultVisibility={{
          id: false,
          content_hash: false,
          ip_address: false,
          user_agent: false,
          updated_at: false,
          cc_addresses: false,
          bcc_addresses: false,
          reply_to_addresses: false,
          entity_type: false,
          entity_id: false,
        }}
        filters={filters}
        onRowClick={setSelectedRecord}
      />
      <EmailDetailsDialog
        entry={selectedRecord}
        open={!!selectedRecord}
        onOpenChange={(open) => !open && setSelectedRecord(null)}
      />
    </>
  );
}
