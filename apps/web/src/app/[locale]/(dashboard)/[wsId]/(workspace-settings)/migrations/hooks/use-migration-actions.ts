'use client';

import { toast } from '@tuturuuu/ui/sonner';
import { useCallback } from 'react';
import {
  generateModules,
  type MigrationModule,
  type ModulePackage,
} from '../modules';
import { reconcileData, usesCompositeKey } from '../utils/reconciliation';
import type { useMigrationState } from './use-migration-state';

type MigrationState = ReturnType<typeof useMigrationState>;

interface UseMigrationActionsProps {
  state: MigrationState;
}

export function useMigrationActions({ state }: UseMigrationActionsProps) {
  const {
    config,
    cancelRequested,
    setCancelRequested,
    pauseRequested,
    setPauseRequested,
    abortControllersRef,
    setConfirmDialog,
    migrationData,
    setLoading,
    setData,
    setError,
    setPaused,
    setCompleted,
    setDuplicates,
    setUpdates,
    setNewRecords,
    setStage,
    setExistingInternalData,
    resetData,
    getLoading,
  } = state;

  const { apiEndpoint, apiKey, workspaceId, healthCheckMode } = config;

  const modules = generateModules();

  // Fetch external data helper
  const fetchExternalData = useCallback(
    async (
      url: string,
      {
        onSuccess,
        onError,
      }: {
        onSuccess?: (data: unknown) => void;
        onError?: (error: unknown) => void;
      }
    ) => {
      const res = await fetch(url, {
        headers: {
          'Content-Type': 'application/json',
          'TTR-API-KEY': apiKey,
        },
      });

      const data = await res.json();

      if (!res.ok || (data as Record<string, unknown>)?.error) {
        toast.error('API Error', {
          description:
            ((data as Record<string, { message?: string }>)?.error
              ?.message as string) ||
            (data as Record<string, string>)?.message ||
            'Failed to fetch data',
        });
        onError?.(data);
        return;
      }

      onSuccess?.(data);
    },
    [apiKey]
  );

  // Handle pause
  const handlePause = useCallback(
    (module: MigrationModule) => {
      setPauseRequested((prev) => new Set(prev).add(module));
      setPaused(module, true);
      toast.info('Migration paused', {
        description: `${module} migration has been paused`,
      });
    },
    [setPauseRequested, setPaused]
  );

  // Handle resume
  const handleResume = useCallback(
    (module: MigrationModule) => {
      setPauseRequested((prev) => {
        const next = new Set(prev);
        next.delete(module);
        return next;
      });
      setPaused(module, false);
      toast.info('Migration resumed', {
        description: `${module} migration has been resumed`,
      });
    },
    [setPauseRequested, setPaused]
  );

  // Handle stop
  const handleStop = useCallback(
    (module: MigrationModule) => {
      setConfirmDialog({
        open: true,
        title: 'Stop Migration',
        description: `Are you sure you want to stop the migration for ${module.replace(/-/g, ' ')}? This will cancel the current operation and you'll need to start over.`,
        action: () => {
          setCancelRequested((prev) => new Set(prev).add(module));
          abortControllersRef.current.get(module)?.abort();
          setLoading(module, false);
          toast.warning('Migration stopped', {
            description: `${module} migration has been stopped`,
          });
          setConfirmDialog({
            open: false,
            title: '',
            description: '',
            action: () => {},
          });
        },
      });
    },
    [setConfirmDialog, setCancelRequested, abortControllersRef, setLoading]
  );

  // Handle clear data
  const handleClearData = useCallback(
    (module: MigrationModule) => {
      setConfirmDialog({
        open: true,
        title: 'Clear Migration Data',
        description: `Are you sure you want to clear all migration data for ${module.replace(/-/g, ' ')}? This action cannot be undone.`,
        action: () => {
          resetData(module);
          toast.success('Data cleared', {
            description: `All data for ${module} has been cleared`,
          });
          setConfirmDialog({
            open: false,
            title: '',
            description: '',
            action: () => {},
          });
        },
      });
    },
    [setConfirmDialog, resetData]
  );

  // Main migration handler
  const handleMigrate = useCallback(
    async ({
      module,
      externalPath,
      internalPath,
      externalAlias,
      internalAlias,
      mapping,
      skip,
    }: ModulePackage) => {
      const abortController = new AbortController();
      abortControllersRef.current.set(module, abortController);

      setLoading(module, true);
      resetData(module);

      const externalUrl = `${apiEndpoint}${externalPath}`;
      const chunkSize = 500;
      const healthCheckLimit = 501;

      // Stage 1: Fetch external data
      setStage(module, 'external');

      let externalCount = -1;
      let externalData: unknown[] = [];
      let externalError: unknown = null;
      let existingInternalData: unknown[] = [];

      // Fetch internal data in parallel
      const fetchInternalData = async () => {
        if (!skip && internalPath && workspaceId) {
          const internalFetchUrl = internalPath
            .replace('[wsId]', workspaceId)
            .replace('/migrate/', '/');

          console.log(
            `[${module}] Fetching existing internal data from:`,
            internalFetchUrl
          );

          const allInternalData: unknown[] = [];
          let offset = 0;
          const batchSize = 500;
          const maxFetch = healthCheckMode ? healthCheckLimit : 100000;

          try {
            while (offset < maxFetch) {
              const res = await fetch(
                `${internalFetchUrl}?ws_id=${workspaceId}&offset=${offset}&limit=${batchSize}`
              );
              console.log(
                `[${module}] Internal fetch response (offset ${offset}):`,
                res.status,
                res.statusText
              );

              if (res.ok) {
                const data = await res.json();
                const batchData = Array.isArray(data)
                  ? data
                  : (data as Record<string, unknown>)?.data ||
                    (data as Record<string, unknown>)?.items ||
                    (data as Record<string, unknown>)?.records ||
                    [];

                if ((batchData as unknown[]).length === 0) break;

                allInternalData.push(...(batchData as unknown[]));
                console.log(
                  `[${module}] Fetched ${(batchData as unknown[]).length} records (total: ${allInternalData.length})`
                );

                setExistingInternalData(
                  module,
                  allInternalData,
                  allInternalData.length
                );

                if ((batchData as unknown[]).length < batchSize) break;
                offset += batchSize;
                await new Promise((resolve) => setTimeout(resolve, 100));
              } else {
                console.log(
                  `[${module}] Could not fetch internal data: ${res.status}`
                );
                break;
              }
            }

            console.log(
              `[${module}] Found ${allInternalData.length} existing records`
            );
            return allInternalData;
          } catch (error) {
            console.log(
              `[${module}] Error fetching existing internal data:`,
              error
            );
          }
        }
        return [];
      };

      const internalFetchPromise = fetchInternalData();

      // Fetch external data
      while (
        !cancelRequested.has(module) &&
        externalError === null &&
        (externalData.length < externalCount || externalCount === -1) &&
        (!healthCheckMode || externalData.length < healthCheckLimit)
      ) {
        while (pauseRequested.has(module) && !cancelRequested.has(module)) {
          await new Promise((resolve) => setTimeout(resolve, 500));
        }

        if (cancelRequested.has(module)) break;

        await fetchExternalData(
          `${externalUrl}?from=${externalData.length}&limit=${chunkSize}`.replace(
            /\?([^?]*)(\?)/g,
            '?$1&'
          ),
          {
            onSuccess: (newData) => {
              const d = newData as Record<string, unknown>;
              if (externalCount === -1) externalCount = d.count as number;
              externalData = [
                ...externalData,
                ...((d?.[
                  externalAlias ?? internalAlias ?? 'data'
                ] as unknown[]) ?? []),
              ];
              setData('external', module, externalData, d.count as number);

              if (!healthCheckMode && externalData.length !== externalCount)
                return;
            },
            onError: async (error) => {
              setLoading(module, false);
              setError(module, error);
              externalError = error;
            },
          }
        );

        await new Promise((resolve) => setTimeout(resolve, 200));
      }

      if (cancelRequested.has(module)) {
        setLoading(module, false);
        abortControllersRef.current.delete(module);
        return;
      }

      // Stage 2: Wait for internal data
      setStage(module, 'internal');
      existingInternalData = await internalFetchPromise;

      if (cancelRequested.has(module)) {
        setLoading(module, false);
        abortControllersRef.current.delete(module);
        return;
      }

      // Stage 3: Reconciliation
      setStage(module, 'reconciling');

      console.log(`[${module}] Starting reconciliation...`);
      console.log(`[${module}] External records: ${externalData.length}`);
      console.log(
        `[${module}] Existing records: ${existingInternalData.length}`
      );

      const { newRecords, updates, duplicates, mappedData } = reconcileData(
        module,
        externalData,
        existingInternalData,
        mapping,
        workspaceId
      );

      console.log(
        `[${module}] Mapped external data: ${mappedData.length} records`
      );
      console.log(
        `[${module}] Built existing map with ${existingInternalData.length} entries using ${usesCompositeKey(module) ? 'composite key' : 'simple id'} strategy`
      );
      console.log(`[${module}] Reconciliation complete:`, {
        new: newRecords,
        updates,
        duplicates,
      });

      setDuplicates(module, duplicates);
      setUpdates(module, updates);
      setNewRecords(module, newRecords);

      if (cancelRequested.has(module)) {
        setLoading(module, false);
        abortControllersRef.current.delete(module);
        return;
      }

      // Stage 4: Sync to internal database
      setStage(module, 'syncing');

      const internalData: unknown[] = [];
      let internalError: unknown = null;

      if (skip) {
        console.log('Skipping migration for', module);
      } else if (internalPath && workspaceId) {
        await new Promise((resolve) => setTimeout(resolve, 200));

        if (externalData.length > 0) {
          for (let i = 0; i < externalData.length; i += chunkSize) {
            while (pauseRequested.has(module) && !cancelRequested.has(module)) {
              await new Promise((resolve) => setTimeout(resolve, 500));
            }

            if (cancelRequested.has(module) || internalError !== null) break;

            const chunkMax = Math.min(i + chunkSize, externalData.length);
            const chunk = externalData.slice(i, chunkMax);

            const newInternalData = mapping
              ? mapping(workspaceId, chunk)
              : chunk;

            try {
              const res = await fetch(
                internalPath.replace('[wsId]', workspaceId),
                {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    [internalAlias ?? externalAlias ?? 'data']: newInternalData,
                  }),
                }
              );

              const data = await res.json();

              if (!res.ok) {
                setLoading(module, false);
                setError(module, data);
                internalError = (data as Record<string, unknown>)?.error;
                return;
              }

              internalData.push(...newInternalData);
              setData('internal', module, internalData, internalData.length);
            } catch (error) {
              setLoading(module, false);
              setError(module, error);
              internalError = error;
              return;
            } finally {
              await new Promise((resolve) => setTimeout(resolve, 200));
            }
          }
        } else {
          console.log('No external data to migrate');
          setData('internal', module, internalData, 0);
        }
      }

      if (cancelRequested.has(module)) {
        setLoading(module, false);
        abortControllersRef.current.delete(module);
        return;
      }

      setCompleted(module, true);
      setLoading(module, false);
      abortControllersRef.current.delete(module);

      if (!externalError && !internalError) {
        toast.success('Migration completed', {
          description: `${module.replace(/-/g, ' ')} migration completed successfully`,
        });
      }
    },
    [
      workspaceId,
      apiEndpoint,
      cancelRequested,
      pauseRequested,
      resetData,
      fetchExternalData,
      setLoading,
      setStage,
      setData,
      setError,
      setExistingInternalData,
      setDuplicates,
      setUpdates,
      setNewRecords,
      setCompleted,
      healthCheckMode,
      abortControllersRef,
    ]
  );

  // Migrate all
  const handleMigrateAll = useCallback(async () => {
    for (const m of modules) {
      if (!m?.disabled) await handleMigrate(m);
    }
  }, [modules, handleMigrate]);

  // Stop all
  const handleStopAll = useCallback(() => {
    setConfirmDialog({
      open: true,
      title: 'Stop All Migrations',
      description:
        'Are you sure you want to stop all running migrations? This will cancel all current operations.',
      action: () => {
        const runningModules = modules.filter((m) => getLoading(m.module));
        runningModules.forEach((m) => {
          setCancelRequested((prev) => new Set(prev).add(m.module));
          abortControllersRef.current.get(m.module)?.abort();
          setLoading(m.module, false);
        });
        toast.warning('All migrations stopped', {
          description: `Stopped ${runningModules.length} running migration(s)`,
        });
        setConfirmDialog({
          open: false,
          title: '',
          description: '',
          action: () => {},
        });
      },
    });
  }, [
    modules,
    getLoading,
    setConfirmDialog,
    setCancelRequested,
    abortControllersRef,
    setLoading,
  ]);

  // Clear all
  const handleClearAll = useCallback(() => {
    setConfirmDialog({
      open: true,
      title: 'Clear All Migration Data',
      description:
        'Are you sure you want to clear all migration data? This will remove all fetched and synchronized data for all modules. This action cannot be undone.',
      action: () => {
        modules.forEach((m) => {
          resetData(m.module);
        });
        toast.success('All data cleared', {
          description: 'Migration data has been cleared for all modules',
        });
        setConfirmDialog({
          open: false,
          title: '',
          description: '',
          action: () => {},
        });
      },
    });
  }, [modules, resetData, setConfirmDialog]);

  // Export summary
  const exportSummary = useCallback(() => {
    const summary = modules
      .map((m) => {
        const data = migrationData[m.module];
        return {
          module: m.name,
          status: data?.completed
            ? 'Completed'
            : data?.loading
              ? data?.paused
                ? 'Paused'
                : 'Running'
              : data?.error
                ? 'Error'
                : 'Pending',
          externalTotal: data?.externalTotal ?? 0,
          internalTotal:
            (data?.internalData as unknown[] | undefined)?.length ?? 0,
          existingTotal: data?.existingInternalTotal ?? 0,
          newRecords: data?.newRecords ?? 0,
          updates: data?.updates ?? 0,
          duplicates: data?.duplicates ?? 0,
          stage: data?.stage ?? 'N/A',
          error:
            ((data?.error as Record<string, { message?: string }>)?.error
              ?.message as string) ||
            (data?.error as Record<string, string>)?.message ||
            'N/A',
        };
      })
      .filter((m) => !modules.find((mod) => mod.module === m.module)?.disabled);

    const csv = [
      [
        'Module',
        'Status',
        'External Total',
        'Internal Synced',
        'Existing Records',
        'New Records',
        'Updates',
        'Duplicates',
        'Current Stage',
        'Error',
      ].join(','),
      ...summary.map((s) =>
        [
          s.module,
          s.status,
          s.externalTotal,
          s.internalTotal,
          s.existingTotal,
          s.newRecords,
          s.updates,
          s.duplicates,
          s.stage,
          `"${s.error}"`,
        ].join(',')
      ),
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `migration-summary-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    toast.success('Summary exported', {
      description: 'Migration summary has been downloaded as CSV',
    });
  }, [modules, migrationData]);

  return {
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
  };
}
