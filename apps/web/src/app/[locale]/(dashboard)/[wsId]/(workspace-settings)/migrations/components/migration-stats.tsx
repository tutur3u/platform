'use client';

import {
  CheckCircle2,
  Play,
  RefreshCcw,
  SkipForward,
  Zap,
} from '@tuturuuu/icons';
import { Card, CardContent } from '@tuturuuu/ui/card';
import { Progress } from '@tuturuuu/ui/progress';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';

interface MigrationStatsProps {
  totalExternal: number;
  totalSynced: number;
  totalNewRecords: number;
  totalUpdates: number;
  totalDuplicates: number;
  totalRecordsToSync: number;
  efficiencyPercent: number;
  modulesWithData: number;
  completedModules: number;
  runningModules: number;
  pausedModules: number;
}

export function MigrationStats({
  totalExternal,
  totalSynced,
  totalNewRecords,
  totalUpdates,
  totalDuplicates,
  totalRecordsToSync,
  efficiencyPercent,
  modulesWithData,
  completedModules,
  runningModules,
  pausedModules,
}: MigrationStatsProps) {
  // Calculate sync progress based on records to sync (not total external)
  const effectiveSyncTarget =
    totalRecordsToSync > 0 ? totalRecordsToSync : totalExternal;
  const syncProgress =
    effectiveSyncTarget > 0 ? (totalSynced / effectiveSyncTarget) * 100 : 0;

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
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
              <Tooltip>
                <TooltipTrigger asChild>
                  <p className="cursor-help font-bold text-2xl">
                    {totalSynced.toLocaleString()}
                    {totalRecordsToSync > 0 && (
                      <span className="ml-1 font-normal text-muted-foreground text-sm">
                        / {totalRecordsToSync.toLocaleString()}
                      </span>
                    )}
                  </p>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs">
                    {totalNewRecords.toLocaleString()} new +{' '}
                    {totalUpdates.toLocaleString()} updates
                  </p>
                </TooltipContent>
              </Tooltip>
            </div>
            <div className="rounded-full bg-dynamic-green/10 p-3">
              <RefreshCcw className="h-5 w-5 text-dynamic-green" />
            </div>
          </div>
          <div className="mt-2">
            <Progress
              value={syncProgress}
              className="h-1"
              indicatorClassName="bg-dynamic-green"
            />
          </div>
        </CardContent>
      </Card>

      {/* Efficiency Card - Only show when duplicates exist */}
      {totalDuplicates > 0 && (
        <Card className="border-dynamic-green/20 bg-dynamic-green/5">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-muted-foreground text-xs">
                  Duplicates Skipped
                </p>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <p className="cursor-help font-bold text-2xl text-dynamic-green">
                      {totalDuplicates.toLocaleString()}
                      <span className="ml-1 font-normal text-dynamic-green/80 text-sm">
                        ({efficiencyPercent}%)
                      </span>
                    </p>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="text-xs">
                      {efficiencyPercent}% of records were unchanged and skipped
                    </p>
                  </TooltipContent>
                </Tooltip>
              </div>
              <div className="rounded-full bg-dynamic-green/10 p-3">
                <SkipForward className="h-5 w-5 text-dynamic-green" />
              </div>
            </div>
            <div className="mt-2 flex items-center gap-1 text-dynamic-green text-xs">
              <Zap className="h-3 w-3" />
              <span>
                {efficiencyPercent}% efficiency gain - only{' '}
                {totalRecordsToSync.toLocaleString()} records synced
              </span>
            </div>
          </CardContent>
        </Card>
      )}

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
                  <span className="text-dynamic-green">Idle</span>
                )}
              </p>
            </div>
            <div
              className={`rounded-full p-3 ${runningModules > 0 ? 'bg-dynamic-blue/10' : 'bg-dynamic-green/10'}`}
            >
              {runningModules > 0 ? (
                <div className="h-2 w-2 animate-pulse rounded-full bg-dynamic-blue" />
              ) : (
                <CheckCircle2 className="h-5 w-5 text-dynamic-green" />
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
