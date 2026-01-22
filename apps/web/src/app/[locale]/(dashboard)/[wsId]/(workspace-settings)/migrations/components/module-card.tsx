'use client';

import {
  AlertCircle,
  CheckCircle2,
  Eye,
  Pause,
  Play,
  RefreshCcw,
  StopCircle,
  Trash2,
} from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { Checkbox } from '@tuturuuu/ui/checkbox';
import { Progress } from '@tuturuuu/ui/progress';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { useState } from 'react';
import type { MigrationMode } from '../hooks/use-migration-state';
import type { MigrationModule, ModulePackage } from '../modules';
import type { ModuleState } from '../utils/types';
import { DataPreviewDialog } from './data-preview-dialog';

interface ModuleCardProps {
  module: ModulePackage;
  moduleState: ModuleState;
  healthCheckMode: boolean;
  mode: MigrationMode;
  isSkipped: boolean;
  onToggleSkip: (module: MigrationModule) => void;
  onMigrate: (module: ModulePackage) => void;
  onPause: (module: MigrationModule) => void;
  onResume: (module: MigrationModule) => void;
  onStop: (module: MigrationModule) => void;
  onClear: (module: MigrationModule) => void;
}

export function ModuleCard({
  module,
  moduleState,
  healthCheckMode,
  mode,
  isSkipped,
  onToggleSkip,
  onMigrate,
  onPause,
  onResume,
  onStop,
  onClear,
}: ModuleCardProps) {
  const { name, skip, disabled, tuturuuuOnly, legacyOnly } = module;
  // Module is effectively disabled if explicitly disabled OR if tuturuuuOnly in legacy mode OR if legacyOnly in tuturuuu mode
  const isDisabled =
    disabled ||
    (tuturuuuOnly && mode !== 'tuturuuu') ||
    (legacyOnly && mode === 'tuturuuu');
  const {
    externalData,
    internalData,
    externalTotal,
    existingInternalTotal,
    loading: isLoading,
    paused: isPaused,
    completed: isCompleted,
    error,
    duplicates,
    updates,
    newRecords,
    stage,
  } = moduleState;

  const [previewOpen, setPreviewOpen] = useState(false);

  const hasExternalData = externalData !== null;
  const externalDataLength = (externalData as unknown[] | null)?.length ?? 0;
  const internalDataLength = (internalData as unknown[] | null)?.length ?? 0;

  const externalProgress = hasExternalData
    ? externalDataLength === 0
      ? 100
      : (externalDataLength / externalTotal) * 100
    : 0;

  const syncProgress = hasExternalData
    ? skip
      ? 100
      : externalDataLength > 0
        ? (internalDataLength / externalDataLength) * 100
        : externalTotal === 0
          ? 100 // Nothing to sync (0/0) - show 100%
          : 0
    : 0;

  return (
    <Card className={isDisabled || isSkipped ? 'opacity-50' : ''}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center">
                  <Checkbox
                    id={`skip-${module.module}`}
                    checked={!isSkipped}
                    onCheckedChange={() => onToggleSkip(module.module)}
                    disabled={isDisabled || isLoading}
                    className="mr-2"
                  />
                </div>
              </TooltipTrigger>
              <TooltipContent>
                {isSkipped ? 'Enable this module' : 'Skip this module'}
              </TooltipContent>
            </Tooltip>
            <CardTitle
              className={`text-base capitalize ${isSkipped ? 'text-muted-foreground line-through' : ''}`}
            >
              {name.replace(/-/g, ' ')}
            </CardTitle>
            {skip && (
              <span className="rounded bg-dynamic-yellow/10 px-2 py-0.5 font-medium text-dynamic-yellow text-xs">
                Auto-Skip
              </span>
            )}
            {isSkipped && !skip && (
              <span className="rounded bg-muted px-2 py-0.5 font-medium text-muted-foreground text-xs">
                Skipped
              </span>
            )}
            {tuturuuuOnly && mode !== 'tuturuuu' && (
              <span className="rounded bg-muted px-2 py-0.5 font-medium text-muted-foreground text-xs">
                Tuturuuu Only
              </span>
            )}
            {legacyOnly && mode === 'tuturuuu' && (
              <span className="rounded bg-muted px-2 py-0.5 font-medium text-muted-foreground text-xs">
                Legacy Only
              </span>
            )}
            {isLoading && isPaused && (
              <span className="flex items-center gap-1 rounded bg-dynamic-orange/10 px-2 py-0.5 font-medium text-dynamic-orange text-xs">
                <Pause className="h-3 w-3" />
                Paused
              </span>
            )}
            {isLoading && !isPaused && stage && (
              <span className="flex items-center gap-1 rounded bg-dynamic-blue/10 px-2 py-0.5 font-medium text-dynamic-blue text-xs">
                <div className="h-2 w-2 animate-pulse rounded-full bg-dynamic-blue" />
                {stage === 'external' && 'Fetching External'}
                {stage === 'internal' && 'Fetching Internal'}
                {stage === 'reconciling' && 'Reconciling'}
                {stage === 'syncing' && 'Syncing'}
              </span>
            )}
            {isLoading && !isPaused && !stage && (
              <span className="flex items-center gap-1 rounded bg-dynamic-blue/10 px-2 py-0.5 font-medium text-dynamic-blue text-xs">
                <div className="h-2 w-2 animate-pulse rounded-full bg-dynamic-blue" />
                Running
              </span>
            )}
            {isCompleted && !isLoading && (
              <span className="flex items-center gap-1 rounded bg-green-100 px-2 py-0.5 font-medium text-green-700 text-xs">
                <CheckCircle2 className="h-3 w-3" />
                Completed
                {healthCheckMode && ' (Health Check)'}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1">
            {hasExternalData && (
              <div className="flex items-center gap-1 rounded-md border bg-muted px-2 py-1 font-mono font-semibold text-xs">
                <span className="text-muted-foreground">
                  {internalDataLength ?? 0}
                </span>
                <span className="text-muted-foreground">/</span>
                <span>
                  {healthCheckMode && externalTotal > 1001
                    ? '1001+'
                    : externalTotal}
                </span>
                {healthCheckMode && externalTotal > 1001 && (
                  <Tooltip>
                    <TooltipTrigger>
                      <AlertCircle className="h-3 w-3 text-dynamic-orange" />
                    </TooltipTrigger>
                    <TooltipContent>
                      Health check mode limited to 1001 entries. Full count:{' '}
                      {externalTotal.toLocaleString()}
                    </TooltipContent>
                  </Tooltip>
                )}
              </div>
            )}

            {hasExternalData && (
              <>
                <Button
                  onClick={() => setPreviewOpen(true)}
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  title="Preview data"
                >
                  <Eye className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                </Button>
                <Button
                  onClick={() => onClear(module.module)}
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  disabled={isLoading}
                  title="Clear data"
                >
                  <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                </Button>
              </>
            )}

            {isLoading && (
              <>
                <Button
                  onClick={() =>
                    isPaused ? onResume(module.module) : onPause(module.module)
                  }
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  title={isPaused ? 'Resume' : 'Pause'}
                >
                  {isPaused ? (
                    <Play className="h-4 w-4 text-green-600" />
                  ) : (
                    <Pause className="h-4 w-4 text-orange-600" />
                  )}
                </Button>

                <Button
                  onClick={() => onStop(module.module)}
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  title="Stop migration"
                >
                  <StopCircle className="h-4 w-4 text-destructive" />
                </Button>
              </>
            )}

            <Button
              onClick={() => onMigrate(module)}
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              disabled={isDisabled || isLoading}
              title={hasExternalData ? 'Re-run migration' : 'Start migration'}
            >
              {hasExternalData ? (
                <RefreshCcw className="h-4 w-4" />
              ) : (
                <Play className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>

        {error
          ? (() => {
              const err = error as Record<string, unknown>;
              const errorObj = err?.error as Record<string, string> | undefined;
              const errorMessage =
                errorObj?.message ||
                (err?.message as string) ||
                'Migration failed';
              const errorDetails = errorObj?.details;

              return (
                <div className="mt-2 flex items-start gap-2 rounded-md border border-dynamic-red/20 bg-dynamic-red/5 p-2">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-dynamic-red" />
                  <div className="flex-1">
                    <p className="font-medium text-dynamic-red text-xs">
                      {errorMessage}
                    </p>
                    {errorDetails && (
                      <p className="mt-1 text-muted-foreground text-xs">
                        {errorDetails}
                      </p>
                    )}
                  </div>
                </div>
              );
            })()
          : null}
      </CardHeader>

      {!isDisabled && hasExternalData && (
        <CardContent className="space-y-3 pt-0">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">External fetch</span>
              <span className="font-medium">
                {externalDataLength} / {externalTotal}
              </span>
            </div>
            <Progress value={externalProgress} className="h-1.5" />
          </div>

          {/* Show reconciliation results */}
          {(existingInternalTotal > 0 ||
            newRecords > 0 ||
            updates > 0 ||
            duplicates > 0) && (
            <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
              <div className="flex items-center justify-between">
                <span className="font-medium text-xs">Reconciliation</span>
                <span className="text-muted-foreground text-xs">
                  {existingInternalTotal > 0
                    ? `${existingInternalTotal} existing`
                    : 'First migration'}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1 rounded-md bg-green-50 p-2 dark:bg-green-950/30">
                  <div className="flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3 text-green-600" />
                    <span className="text-[10px] text-green-600 uppercase tracking-wide">
                      New
                    </span>
                  </div>
                  <div className="font-bold text-green-700 text-lg dark:text-green-400">
                    {newRecords}
                  </div>
                </div>

                <div className="space-y-1 rounded-md bg-blue-50 p-2 dark:bg-blue-950/30">
                  <div className="flex items-center gap-1">
                    <RefreshCcw className="h-3 w-3 text-blue-600" />
                    <span className="text-[10px] text-blue-600 uppercase tracking-wide">
                      Updates
                    </span>
                  </div>
                  <div className="font-bold text-blue-700 text-lg dark:text-blue-400">
                    {updates}
                  </div>
                </div>

                <div className="space-y-1 rounded-md bg-yellow-50 p-2 dark:bg-yellow-950/30">
                  <div className="flex items-center gap-1">
                    <AlertCircle className="h-3 w-3 text-yellow-600" />
                    <span className="text-[10px] text-yellow-600 uppercase tracking-wide">
                      Dups
                    </span>
                  </div>
                  <div className="font-bold text-lg text-yellow-700 dark:text-yellow-400">
                    {duplicates}
                  </div>
                </div>
              </div>
            </div>
          )}

          {!skip && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Synchronized</span>
                <span className="font-medium">
                  {internalDataLength} / {externalDataLength}
                </span>
              </div>
              <Progress
                value={syncProgress}
                className="h-1.5"
                indicatorClassName={
                  syncProgress === 100 ? 'bg-green-500' : undefined
                }
              />
            </div>
          )}
        </CardContent>
      )}

      <DataPreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        title={name.replace(/-/g, ' ')}
        data={externalData as unknown[] | null}
        totalCount={externalTotal}
      />
    </Card>
  );
}
