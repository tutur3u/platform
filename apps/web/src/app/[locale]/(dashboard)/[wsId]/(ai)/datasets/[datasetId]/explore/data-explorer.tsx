'use client';

import { Button } from '@repo/ui/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@repo/ui/components/ui/select';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

interface Props {
  wsId: string;
  datasetId: string;
}

// eslint-disable-next-line no-empty-pattern
export function DataExplorer({}: Props) {
  const t = useTranslations();
  const [pageSize, setPageSize] = useState('10');
  const [,] = useState(1);
  const [data] = useState<any[]>([]);
  const [headers] = useState<string[]>([]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground text-sm">
            {t('common.rows-per-page')}:
          </span>
          <Select value={pageSize} onValueChange={setPageSize}>
            <SelectTrigger className="w-[100px]">
              <SelectValue placeholder="10" />
            </SelectTrigger>
            <SelectContent>
              {[10, 20, 50, 100].map((size) => (
                <SelectItem key={size} value={size.toString()}>
                  {size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => {
              // Add refresh logic
            }}
          >
            {t('common.refresh')}
          </Button>
        </div>
      </div>

      <div className="rounded-lg border">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-muted/50 border-b">
                {headers.map((header, index) => (
                  <th key={index} className="p-2 text-left text-sm">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((row, rowIndex) => (
                <tr key={rowIndex} className="border-b">
                  {headers.map((header, colIndex) => (
                    <td key={colIndex} className="p-2 text-sm">
                      {row[header]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
