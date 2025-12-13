'use client';

import { AlertCircle, CheckCircle2, Download } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import type { ModulePackage } from '../modules';
import type { MigrationData } from '../utils/types';

interface MigrationSummaryProps {
  modules: ModulePackage[];
  migrationData: MigrationData;
  onExport: () => void;
}

export function MigrationSummary({
  modules,
  migrationData,
  onExport,
}: MigrationSummaryProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Migration Summary</CardTitle>
            <CardDescription>
              Overview of all migration modules and their status
            </CardDescription>
          </div>
          <Button onClick={onExport} variant="outline" size="sm">
            <Download className="mr-2 h-4 w-4" />
            Export CSV
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="pr-4 pb-3 text-left font-medium">Module</th>
                <th className="px-4 pb-3 text-left font-medium">Status</th>
                <th className="px-4 pb-3 text-right font-medium">External</th>
                <th className="px-4 pb-3 text-right font-medium">Synced</th>
                <th className="px-4 pb-3 text-right font-medium">New</th>
                <th className="px-4 pb-3 text-right font-medium">Updates</th>
                <th className="px-4 pb-3 text-right font-medium">Duplicates</th>
                <th className="pb-3 pl-4 text-left font-medium">Stage</th>
              </tr>
            </thead>
            <tbody>
              {modules
                .filter((m) => !m.disabled && migrationData[m.module])
                .map((m) => {
                  const data = migrationData[m.module];
                  const isError = !!data?.error;
                  const isCompleted = data?.completed;
                  const isRunning = data?.loading;
                  const isPaused = data?.paused;

                  return (
                    <tr key={m.module} className="border-b last:border-0">
                      <td className="py-3 pr-4 font-medium">
                        {m.name.replace(/-/g, ' ')}
                      </td>
                      <td className="px-4 py-3">
                        {isCompleted && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-green-700 text-xs">
                            <CheckCircle2 className="h-3 w-3" />
                            Completed
                          </span>
                        )}
                        {isRunning && !isCompleted && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-dynamic-blue/10 px-2 py-0.5 text-dynamic-blue text-xs">
                            <div className="h-2 w-2 animate-pulse rounded-full bg-dynamic-blue" />
                            {isPaused ? 'Paused' : 'Running'}
                          </span>
                        )}
                        {isError && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-dynamic-red/10 px-2 py-0.5 text-dynamic-red text-xs">
                            <AlertCircle className="h-3 w-3" />
                            Error
                          </span>
                        )}
                        {!isCompleted && !isRunning && !isError && (
                          <span className="text-muted-foreground text-xs">
                            Pending
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {data?.externalTotal?.toLocaleString() ?? '-'}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {(
                          data?.internalData as unknown[] | undefined
                        )?.length?.toLocaleString() ?? '-'}
                      </td>
                      <td className="px-4 py-3 text-right text-green-600 tabular-nums">
                        {data?.newRecords?.toLocaleString() ?? '-'}
                      </td>
                      <td className="px-4 py-3 text-right text-dynamic-blue tabular-nums">
                        {data?.updates?.toLocaleString() ?? '-'}
                      </td>
                      <td className="px-4 py-3 text-right text-dynamic-yellow tabular-nums">
                        {data?.duplicates?.toLocaleString() ?? '-'}
                      </td>
                      <td className="py-3 pl-4 text-muted-foreground text-xs">
                        {data?.stage
                          ? data.stage.charAt(0).toUpperCase() +
                            data.stage.slice(1)
                          : '-'}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
