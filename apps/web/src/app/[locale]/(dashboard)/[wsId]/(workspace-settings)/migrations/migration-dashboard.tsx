'use client';

import {
  MoreVertical,
  Play,
  RefreshCcw,
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
import { ConfirmationDialog } from './components/confirmation-dialog';
import { MigrationConfig } from './components/migration-config';
import { MigrationStats } from './components/migration-stats';
import { MigrationSummary } from './components/migration-summary';
import { ModuleCard } from './components/module-card';
import { useMigrationActions } from './hooks/use-migration-actions';
import { useMigrationState } from './hooks/use-migration-state';

export default function MigrationDashboard() {
  const state = useMigrationState();
  const actions = useMigrationActions({ state });

  const {
    config,
    setApiEndpoint,
    setApiKey,
    setWorkspaceId,
    setHealthCheckMode,
    configComplete,
    workspaceName,
    loadingWorkspaceName,
    migrationData,
    loading,
    hasData,
    confirmDialog,
    setConfirmDialog,
    getModuleState,
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
          apiEndpoint={config.apiEndpoint}
          apiKey={config.apiKey}
          workspaceId={config.workspaceId}
          healthCheckMode={config.healthCheckMode}
          workspaceName={workspaceName}
          loadingWorkspaceName={loadingWorkspaceName}
          onApiEndpointChange={setApiEndpoint}
          onApiKeyChange={setApiKey}
          onWorkspaceIdChange={setWorkspaceId}
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
                {configComplete
                  ? `Migrate data from external source to workspace ${config.workspaceId}`
                  : 'Configure API settings above to begin migration'}
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
                <Button
                  variant="outline"
                  size="icon"
                  disabled={!hasData && !loading}
                >
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
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
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {modules.map((m) => (
            <ModuleCard
              key={m.name}
              module={m}
              moduleState={getModuleState(m.module)}
              healthCheckMode={config.healthCheckMode}
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
                      Ctrl+Shift+S
                    </kbd>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-muted-foreground">
                      Stop all migrations
                    </span>
                    <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono">
                      Ctrl+Shift+X
                    </kbd>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-muted-foreground">
                      Clear all data
                    </span>
                    <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono">
                      Ctrl+Shift+C
                    </kbd>
                  </div>
                </div>
                <p className="pt-1 text-muted-foreground text-xs">
                  Use{' '}
                  <kbd className="rounded border bg-muted px-1 font-mono">
                    Cmd
                  </kbd>{' '}
                  on macOS
                </p>
              </div>
            </TooltipContent>
          </Tooltip>
        </div>
      </div>
    </TooltipProvider>
  );
}
