'use client';

import {
  CheckSquare,
  MoreVertical,
  Play,
  RefreshCcw,
  Square,
  StopCircle,
  Trash2,
} from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@tuturuuu/ui/tooltip';
import { usePlatform } from '@tuturuuu/utils/hooks/use-platform';
import { ConfirmationDialog } from './components/confirmation-dialog';
import { MigrationConfig } from './components/migration-config';
import { MigrationStats } from './components/migration-stats';
import { MigrationSummary } from './components/migration-summary';
import { ModuleCard } from './components/module-card';
import { useMigrationActions } from './hooks/use-migration-actions';
import { useMigrationState } from './hooks/use-migration-state';

interface MigrationDashboardProps {
  wsId: string;
}

export default function MigrationDashboard({ wsId }: MigrationDashboardProps) {
  const state = useMigrationState(wsId);
  const actions = useMigrationActions({ state });
  const { modKey } = usePlatform();

  const {
    config,
    configLoading,
    setMode,
    setLegacyApiEndpoint,
    setLegacyApiKey,
    setTuturuuuApiEndpoint,
    setTuturuuuApiKey,
    setSourceWorkspaceId,
    setTargetWorkspaceId,
    setHealthCheckMode,
    configComplete,
    sourceWorkspaceName,
    loadingSourceWorkspaceName,
    targetWorkspaceName,
    loadingTargetWorkspaceName,
    migrationData,
    loading,
    hasData,
    confirmDialog,
    setConfirmDialog,
    getModuleState,
    isModuleSkipped,
    toggleSkipModule,
    skipAllModules,
    unskipAllModules,
    skippedModules,
    stats,
  } = state;

  const {
    modules,
    handleMigrate,
    handleMigrateAll,
    handlePause,
    handleResume,
    handleStop,
    handleStopAll,
    handleClearData,
    handleClearAll,
    exportSummary,
  } = actions;

  return (
    <TooltipProvider>
      <div className="flex flex-col gap-6">
        {/* Configuration Section */}
        <MigrationConfig
          mode={config.mode}
          configLoading={configLoading}
          legacyApiEndpoint={config.legacyApiEndpoint}
          legacyApiKey={config.legacyApiKey}
          tuturuuuApiEndpoint={config.tuturuuuApiEndpoint}
          tuturuuuApiKey={config.tuturuuuApiKey}
          sourceWorkspaceId={config.sourceWorkspaceId}
          targetWorkspaceId={config.targetWorkspaceId}
          healthCheckMode={config.healthCheckMode}
          sourceWorkspaceName={sourceWorkspaceName}
          loadingSourceWorkspaceName={loadingSourceWorkspaceName}
          targetWorkspaceName={targetWorkspaceName}
          loadingTargetWorkspaceName={loadingTargetWorkspaceName}
          onModeChange={setMode}
          onLegacyApiEndpointChange={setLegacyApiEndpoint}
          onLegacyApiKeyChange={setLegacyApiKey}
          onTuturuuuApiEndpointChange={setTuturuuuApiEndpoint}
          onTuturuuuApiKeyChange={setTuturuuuApiKey}
          onSourceWorkspaceIdChange={setSourceWorkspaceId}
          onTargetWorkspaceIdChange={setTargetWorkspaceId}
          onHealthCheckModeChange={setHealthCheckMode}
        />

        {/* Confirmation Dialog */}
        <ConfirmationDialog
          open={confirmDialog.open}
          title={confirmDialog.title}
          description={confirmDialog.description}
          onConfirm={confirmDialog.action}
          onCancel={() => setConfirmDialog({ ...confirmDialog, open: false })}
        />

        {/* Migration Summary */}
        {hasData && (
          <MigrationSummary
            modules={modules}
            migrationData={migrationData}
            onExport={exportSummary}
          />
        )}

        {/* Migration Statistics */}
        {hasData && (
          <MigrationStats
            totalExternal={stats.totalExternal}
            totalSynced={stats.totalSynced}
            totalNewRecords={stats.totalNewRecords}
            totalUpdates={stats.totalUpdates}
            totalDuplicates={stats.totalDuplicates}
            totalRecordsToSync={stats.totalRecordsToSync}
            efficiencyPercent={stats.efficiencyPercent}
            modulesWithData={stats.modulesWithData}
            completedModules={stats.completedModules}
            runningModules={stats.runningModules}
            pausedModules={stats.pausedModules}
          />
        )}

        {/* Migration Overview Header */}
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <h2 className="flex items-center gap-2 font-semibold text-2xl">
              Migration Modules
              {!hasData && configComplete && (
                <span className="font-normal text-muted-foreground text-sm">
                  ({modules.filter((m) => !m.disabled).length} modules
                  available)
                </span>
              )}
            </h2>
            <div className="flex items-center gap-2">
              <p className="text-muted-foreground text-sm">
                {configComplete ? (
                  config.mode === 'tuturuuu' ? (
                    <>
                      Migrate data from{' '}
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="cursor-help font-medium text-foreground underline decoration-dotted underline-offset-2">
                            {loadingSourceWorkspaceName
                              ? '...'
                              : sourceWorkspaceName || config.sourceWorkspaceId}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="font-mono text-xs">
                            {config.sourceWorkspaceId}
                          </p>
                        </TooltipContent>
                      </Tooltip>{' '}
                      to{' '}
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="cursor-help font-medium text-foreground underline decoration-dotted underline-offset-2">
                            {loadingTargetWorkspaceName
                              ? '...'
                              : targetWorkspaceName || config.targetWorkspaceId}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="font-mono text-xs">
                            {config.targetWorkspaceId}
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </>
                  ) : (
                    <>
                      Migrate data from external source to{' '}
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="cursor-help font-medium text-foreground underline decoration-dotted underline-offset-2">
                            {loadingTargetWorkspaceName
                              ? '...'
                              : targetWorkspaceName || config.targetWorkspaceId}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="font-mono text-xs">
                            {config.targetWorkspaceId}
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </>
                  )
                ) : (
                  'Configure API settings above to begin migration'
                )}
              </p>
              {(stats.totalDuplicates > 0 || stats.totalUpdates > 0) && (
                <div className="flex items-center gap-1">
                  {stats.totalDuplicates > 0 && (
                    <span className="rounded-full bg-dynamic-yellow/10 px-2 py-0.5 text-dynamic-yellow text-xs">
                      {stats.totalDuplicates} duplicates
                    </span>
                  )}
                  {stats.totalUpdates > 0 && (
                    <span className="rounded-full bg-dynamic-blue/10 px-2 py-0.5 text-dynamic-blue text-xs">
                      {stats.totalUpdates} updates
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Stop All Button - visible when migrations are running */}
            {loading && (
              <Button
                onClick={handleStopAll}
                variant="destructive"
                className="animate-pulse"
              >
                <StopCircle className="mr-2 h-4 w-4" />
                Stop All
              </Button>
            )}

            <Button
              onClick={handleMigrateAll}
              variant="default"
              disabled={loading || !configComplete}
            >
              {Object.values(migrationData ?? {}).filter((v) => v?.externalData)
                .length ? (
                <>
                  <RefreshCcw className="mr-2 h-4 w-4" />
                  Re-run All
                </>
              ) : (
                <>
                  <Play className="mr-2 h-4 w-4" />
                  Start All
                </>
              )}
            </Button>

            {/* Bulk Operations Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem
                  onClick={() =>
                    skipAllModules(
                      modules.filter((m) => !m.disabled).map((m) => m.module)
                    )
                  }
                  disabled={loading}
                >
                  <Square className="mr-2 h-4 w-4" />
                  Skip All Modules
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={unskipAllModules}
                  disabled={loading || skippedModules.length === 0}
                >
                  <CheckSquare className="mr-2 h-4 w-4" />
                  Unskip All Modules
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={handleStopAll}
                  disabled={!loading}
                  className="text-destructive focus:text-destructive"
                >
                  <StopCircle className="mr-2 h-4 w-4" />
                  Stop All Migrations
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={handleClearAll}
                  disabled={loading || !hasData}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Clear All Data
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Module Grid */}
        <div className="grid auto-rows-fr gap-4 md:grid-cols-2 xl:grid-cols-3">
          {modules.map((m) => (
            <ModuleCard
              key={m.name}
              module={m}
              moduleState={getModuleState(m.module)}
              healthCheckMode={config.healthCheckMode}
              mode={config.mode}
              isSkipped={isModuleSkipped(m.module)}
              onToggleSkip={toggleSkipModule}
              onMigrate={handleMigrate}
              onPause={handlePause}
              onResume={handleResume}
              onStop={handleStop}
              onClear={handleClearData}
            />
          ))}
        </div>

        {/* Keyboard Shortcuts Helper */}
        <div className="fixed right-4 bottom-4">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className="h-10 w-10 rounded-full shadow-lg"
              >
                <span className="font-mono text-xs">?</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="left" className="max-w-xs">
              <div className="space-y-2">
                <p className="font-semibold text-sm">Keyboard Shortcuts</p>
                <div className="space-y-1 text-xs">
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-muted-foreground">
                      Start all migrations
                    </span>
                    <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono">
                      {modKey}+Shift+S
                    </kbd>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-muted-foreground">
                      Stop all migrations
                    </span>
                    <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono">
                      {modKey}+Shift+X
                    </kbd>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-muted-foreground">
                      Clear all data
                    </span>
                    <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono">
                      {modKey}+Shift+C
                    </kbd>
                  </div>
                </div>
              </div>
            </TooltipContent>
          </Tooltip>
        </div>
      </div>
    </TooltipProvider>
  );
}
