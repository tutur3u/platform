'use client';

import { CheckCircle2, Play, RefreshCcw } from '@tuturuuu/icons';
import { Card, CardContent } from '@tuturuuu/ui/card';
import { Progress } from '@tuturuuu/ui/progress';

interface MigrationStatsProps {
  totalExternal: number;
  totalSynced: number;
  totalNewRecords: number;
  modulesWithData: number;
  completedModules: number;
  runningModules: number;
  pausedModules: number;
}

export function MigrationStats({
  totalExternal,
  totalSynced,
  totalNewRecords,
  modulesWithData,
  completedModules,
  runningModules,
  pausedModules,
}: MigrationStatsProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-muted-foreground text-xs">Total Records</p>
              <p className="font-bold text-2xl">
                {totalExternal.toLocaleString()}
              </p>
            </div>
            <div className="rounded-full bg-dynamic-blue/10 p-3">
              <CheckCircle2 className="h-5 w-5 text-dynamic-blue" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-muted-foreground text-xs">Synchronized</p>
              <p className="font-bold text-2xl">
                {totalSynced.toLocaleString()}
              </p>
            </div>
            <div className="rounded-full bg-green-100 p-3">
              <RefreshCcw className="h-5 w-5 text-green-600" />
            </div>
          </div>
          <div className="mt-2">
            <Progress
              value={
                totalExternal > 0 ? (totalSynced / totalExternal) * 100 : 0
              }
              className="h-1"
              indicatorClassName="bg-green-500"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-muted-foreground text-xs">New Records</p>
              <p className="font-bold text-2xl">
                {totalNewRecords.toLocaleString()}
              </p>
            </div>
            <div className="rounded-full bg-green-100 p-3">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-muted-foreground text-xs">Modules Active</p>
              <p className="font-bold text-2xl">
                {completedModules} / {modulesWithData}
              </p>
            </div>
            <div className="rounded-full bg-dynamic-purple/10 p-3">
              <Play className="h-5 w-5 text-dynamic-purple" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-muted-foreground text-xs">Status</p>
              <p className="font-semibold text-sm">
                {runningModules > 0 ? (
                  <span className="text-dynamic-blue">
                    {runningModules} Running
                    {pausedModules > 0 && ` (${pausedModules} Paused)`}
                  </span>
                ) : (
                  <span className="text-green-600">Idle</span>
                )}
              </p>
            </div>
            <div
              className={`rounded-full p-3 ${runningModules > 0 ? 'bg-dynamic-blue/10' : 'bg-green-100'}`}
            >
              {runningModules > 0 ? (
                <div className="h-2 w-2 animate-pulse rounded-full bg-dynamic-blue" />
              ) : (
                <CheckCircle2 className="h-5 w-5 text-green-600" />
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
