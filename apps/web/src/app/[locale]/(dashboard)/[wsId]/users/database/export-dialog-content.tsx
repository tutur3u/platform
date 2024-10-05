'use client';

import { createClient } from '@/utils/supabase/client';
import { Button } from '@repo/ui/components/ui/button';
import {
  DialogClose,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@repo/ui/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@repo/ui/components/ui/select';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

export default function ExportDialogContent({ wsId }: { wsId: string }) {
  const t = useTranslations();

  const [exportFileType, setExportFileType] = useState('excel');

  const downloadCSV = (csv: string, filename: string) => {
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t('common.export')}</DialogTitle>
        <DialogDescription>{t('common.export-content')}</DialogDescription>
        <Select value={exportFileType} onValueChange={setExportFileType}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="File type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="excel">Excel</SelectItem>
            <SelectItem value="csv">CSV</SelectItem>
          </SelectContent>
        </Select>
      </DialogHeader>

      <DialogFooter className="justify-between">
        <DialogClose asChild>
          <Button type="button" variant="secondary">
            {t('common.cancel')}
          </Button>
        </DialogClose>
        <Button
          onClick={async () => {
            const csvData = await getData(wsId, {
              from: 0,
              to: 100,
              limit: 100,
            });
            downloadCSV(csvData, `export_${wsId}.csv`);
          }}
        >
          {t('common.export')}
        </Button>
      </DialogFooter>
    </>
  );
}

async function getData(
  wsId: string,
  {
    q,
    from = 0,
    to = 10,
    limit = 10,
    includedGroups = [],
    excludedGroups = [],
    retry = true,
  }: {
    q?: string;
    includedGroups?: string | string[];
    excludedGroups?: string | string[];
    from?: number;
    to?: number;
    limit?: number;
    retry?: boolean;
  } = {}
): Promise<string> {
  const supabase = await createClient();

  const queryBuilder = supabase
    .rpc(
      'get_workspace_users',
      {
        _ws_id: wsId,
        included_groups: Array.isArray(includedGroups)
          ? includedGroups
          : [includedGroups],
        excluded_groups: Array.isArray(excludedGroups)
          ? excludedGroups
          : [excludedGroups],
        search_query: q || '',
      },
      {
        count: 'exact',
      }
    )
    .select('*')
    .order('full_name', { ascending: true, nullsFirst: false });

  if (from && to) queryBuilder.range(from, to);
  if (limit) queryBuilder.limit(limit);

  const { data, error, count: _ } = await queryBuilder.csv();

  if (error) {
    if (!retry) throw error;
    return getData(wsId, { q, retry: false });
  }

  return data as unknown as string;
}
