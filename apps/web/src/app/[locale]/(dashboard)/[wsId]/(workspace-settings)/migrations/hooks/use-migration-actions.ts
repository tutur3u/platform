'use client';

import { toast } from '@tuturuuu/ui/sonner';
import { useCallback } from 'react';
import {
  generateModules,
  type MigrationModule,
  type ModulePackage,
} from '../modules';
import { buildProxyUrl, parseUrlForProxy } from '../utils/api-path';
import {
  type ReconciliationResult,
  reconcileData,
  usesCompositeKey,
} from '../utils/reconciliation';
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
    setRecordsToSync,
    setStage,
    setExistingInternalData,
    resetData,
    getLoading,
    isModuleSkipped,
  } = state;

  const { mode, sourceWorkspaceId, targetWorkspaceId, healthCheckMode } =
    config;
  const { effectiveApiEndpoint, effectiveApiKey } = state;

  // Generate modules and sort: available first, disabled/skipped last
  const modules = generateModules().sort((a, b) => {
    const isDisabledA =
      a.disabled ||
      (a.tuturuuuOnly && mode !== 'tuturuuu') ||
      (a.legacyOnly && mode === 'tuturuuu');
    const isDisabledB =
      b.disabled ||
      (b.tuturuuuOnly && mode !== 'tuturuuu') ||
      (b.legacyOnly && mode === 'tuturuuu');

    const isSkippedA = isModuleSkipped(a.module);
    const isSkippedB = isModuleSkipped(b.module);

    // Available modules first, skipped second, disabled last
    const priorityA = isDisabledA ? 2 : isSkippedA ? 1 : 0;
    const priorityB = isDisabledB ? 2 : isSkippedB ? 1 : 0;

    return priorityA - priorityB;
  });

  // Fetch external data helper
  // For Tuturuuu mode, routes through local proxy to avoid CORS issues
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
      let fetchUrl = url;
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (mode === 'tuturuuu') {
        // Route through local proxy to avoid CORS
        const { relativePath, queryString } = parseUrlForProxy(
          url,
          effectiveApiEndpoint
        );

        fetchUrl = buildProxyUrl({
          path: relativePath,
          wsId: targetWorkspaceId,
          apiEndpoint: effectiveApiEndpoint,
          queryString,
        });
        headers['X-Tuturuuu-Api-Key'] = effectiveApiKey;
      } else {
        // Legacy mode uses TTR-API-KEY header
        headers['TTR-API-KEY'] = effectiveApiKey;
      }

      const MAX_429_RETRIES = 8;

      let res = await fetch(fetchUrl, { headers });
      let data = (await res.json()) as Record<string, unknown>;
      let retries = 0;

      // 429 Rate limit — backoff and retry (external fetch can hit proxy/upstream limits)
      while (res.status === 429 && retries < MAX_429_RETRIES) {
        retries++;
        const retryAfterSec =
          Number.parseInt(res.headers.get('Retry-After') ?? '0', 10) ||
          Math.min(2 ** retries, 60);
        await new Promise((resolve) =>
          setTimeout(resolve, retryAfterSec * 1000)
        );
        res = await fetch(fetchUrl, { headers });
        data = (await res.json()) as Record<string, unknown>;
      }

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
    [effectiveApiKey, effectiveApiEndpoint, mode, targetWorkspaceId]
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
      tuturuuuOnly,
      legacyOnly,
    }: ModulePackage) => {
      // Skip tuturuuuOnly modules in legacy mode
      if (tuturuuuOnly && mode !== 'tuturuuu') {
        console.log(`Skipping ${module} - only available in Tuturuuu mode`);
        return;
      }

      // Skip legacyOnly modules in Tuturuuu mode
      if (legacyOnly && mode === 'tuturuuu') {
        console.log(`Skipping ${module} - only available in Legacy mode`);
        return;
      }

      const abortController = new AbortController();
      abortControllersRef.current.set(module, abortController);

      setLoading(module, true);
      resetData(module);

      // Build external URL based on mode
      let externalUrl: string;
      if (mode === 'tuturuuu' && sourceWorkspaceId) {
        // Tuturuuu API format: {apiEndpoint}/workspaces/{wsId}/migrate/{module}
        // externalPath is like "/migrate/warehouses" - extract the module name
        const modulePath = externalPath.replace('/migrate/', '');
        externalUrl = `${effectiveApiEndpoint}/workspaces/${sourceWorkspaceId}/migrate/${modulePath}`;
      } else {
        // Legacy mode uses the effectiveApiEndpoint directly
        externalUrl = `${effectiveApiEndpoint}${externalPath}`;
      }
      const chunkSize = 1000;
      // Sync chunk size kept under 200KB (MAX_PAYLOAD_SIZE) to avoid 413 from middleware
      const syncChunkSize = 100;
      // Separate limits for internal vs external fetch in health check mode (each starts at 1000, decreases individually)
      const externalHealthCheckLimit = 1000;
      const internalHealthCheckLimit = 1000;

      // Stage 1: Fetch external data
      setStage(module, 'external');

      let externalCount = -1;
      let externalData: unknown[] = [];
      let externalError: unknown = null;
      let existingInternalData: unknown[] = [];

      // Fetch internal data in parallel
      const fetchInternalData = async () => {
        if (!skip && internalPath && targetWorkspaceId) {
          // Keep the /migrate/ path - endpoints are at /api/v1/infrastructure/migrate/{module}
          const internalFetchUrl = internalPath.replace(
            '[wsId]',
            targetWorkspaceId
          );

          console.log(
            `[${module}] Fetching existing internal data from:`,
            internalFetchUrl
          );

          const allInternalData: unknown[] = [];
          let offset = 0;
          const batchSize = 1000;
          const maxFetch = healthCheckMode ? internalHealthCheckLimit : 100000;

          try {
            while (offset < maxFetch) {
              const res = await fetch(
                `${internalFetchUrl}?ws_id=${targetWorkspaceId}&offset=${offset}&limit=${batchSize}`
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
        (!healthCheckMode || externalData.length < externalHealthCheckLimit)
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

      // For Tuturuuu mode, skip mapping (1:1 sync with matching schemas)
      // Also enable skipDuplicates to avoid unnecessary upserts
      const effectiveMapping = mode === 'tuturuuu' ? undefined : mapping;
      const skipDuplicatesInSync = mode === 'tuturuuu';

      const reconciliationResult: ReconciliationResult = reconcileData(
        module,
        externalData,
        existingInternalData,
        effectiveMapping,
        targetWorkspaceId,
        { skipDuplicates: skipDuplicatesInSync }
      );

      const { newRecords, updates, duplicates, mappedData, recordsToSync } =
        reconciliationResult;

      // Use filtered data (recordsToSync) in Tuturuuu mode to skip duplicates
      const dataToSync = recordsToSync ?? mappedData;

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

      if (skipDuplicatesInSync && duplicates > 0) {
        console.log(
          `[${module}] Skipping ${duplicates} duplicate records (${((duplicates / mappedData.length) * 100).toFixed(1)}% efficiency)`
        );
        console.log(
          `[${module}] Records to sync: ${dataToSync.length} (${newRecords} new + ${updates} updates)`
        );
      }

      setDuplicates(module, duplicates);
      setUpdates(module, updates);
      setNewRecords(module, newRecords);
      setRecordsToSync(module, dataToSync.length);

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
      } else if (internalPath && targetWorkspaceId) {
        // For Tuturuuu mode, ensure platform users exist before syncing
        // This creates placeholder users for any missing user IDs to satisfy foreign key constraints
        // Use dataToSync (filtered) for user extraction to avoid unnecessary lookups
        if (mode === 'tuturuuu' && dataToSync.length > 0) {
          const platformUserFields = [
            'creator_id',
            'updated_by',
            'user_id',
            'created_by',
            'assigned_to',
            'owner_id',
            'platform_user_id', // workspace_user_linked_users table
            'sender_platform_user_id', // post_email_queue table
            'sender_id', // sent_emails table
            'added_by_user_id', // email_blacklist table
          ];

          // Extract all unique platform user IDs from the data to sync
          const userIds = new Set<string>();
          for (const item of dataToSync) {
            const record = item as Record<string, unknown>;
            for (const field of platformUserFields) {
              const value = record[field];
              if (value && typeof value === 'string' && value.length > 0) {
                userIds.add(value);
              }
            }
          }

          if (userIds.size > 0) {
            console.log(
              `[${module}] Ensuring ${userIds.size} platform users exist...`
            );
            try {
              const res = await fetch(
                '/api/v1/infrastructure/migrate/ensure-platform-users',
                {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ user_ids: Array.from(userIds) }),
                }
              );
              const result = await res.json();
              if (res.ok) {
                console.log(
                  `[${module}] Platform users: ${result.created} created, ${result.existing} existing`
                );
              } else {
                console.warn(
                  `[${module}] Warning: Failed to ensure platform users:`,
                  result
                );
              }
            } catch (error) {
              console.warn(
                `[${module}] Warning: Error ensuring platform users:`,
                error
              );
              // Continue anyway - the sync might still work if users exist
            }
          }
        }

        await new Promise((resolve) => setTimeout(resolve, 200));

        // Sync only records that need syncing (new + updates), skipping duplicates
        // Uses while loop to support retries: 413 triggers batch size reduction, 429 triggers backoff+retry
        const MIN_SYNC_CHUNK = 10;
        const MAX_429_RETRIES = 8;
        if (dataToSync.length > 0) {
          let i = 0;
          let currentChunkSize = syncChunkSize;

          while (i < dataToSync.length) {
            while (pauseRequested.has(module) && !cancelRequested.has(module)) {
              await new Promise((resolve) => setTimeout(resolve, 500));
            }

            if (cancelRequested.has(module) || internalError !== null) break;

            const chunkMax = Math.min(i + currentChunkSize, dataToSync.length);
            let chunk = dataToSync.slice(i, chunkMax);

            // Tables that don't have ws_id column - RLS validates via foreign keys
            const tablesWithoutWsId = [
              // Junction tables
              'workspace-user-groups-users',
              'workspace-user-group-tag-groups',
              // Inventory tables (ws_id via warehouse_id)
              'inventory-products',
              'inventory-batches',
              'inventory-batch-products',
              'product-prices', // maps to inventory_products
              'package-stock-changes', // maps to product_stock_changes
              // Finance invoice related (ws_id via invoice_id)
              'finance-invoice-products',
              'finance-invoice-promotions',
              'finance-invoice-user-groups', // junction table (invoice_id, user_group_id)
              'finance-invoice-transaction-links', // update-only module, ws_id already set
              // Wallet related
              'credit-wallets', // ws_id via wallet_id
              'wallet-types', // global table, no ws_id at all
              'wallet-transactions', // ws_id via wallet_id
              'wallet-transaction-tags', // ws_id via transaction_id -> wallet_id
              'workspace-wallet-transfers', // ws_id via transaction_id -> wallet_id
              // User group related (ws_id via group_id)
              'lessons', // maps to user_group_posts
              'class-packages', // maps to user_group_linked_products
              'class-attendance', // maps to user_group_attendance
              'user-monthly-reports', // maps to external_user_monthly_reports
              'user-monthly-report-logs', // maps to external_user_monthly_report_logs
              // User related (ws_id via user_id)
              'user-coupons', // maps to user_linked_promotions
              'class-scores', // maps to user_indicators
              'student-feedbacks', // maps to user_feedbacks
              'user-group-post-checks', // maps to user_group_post_checks (no ws_id)
              'email-blacklist', // global table, no ws_id at all
            ];
            const hasNoWsIdColumn = tablesWithoutWsId.includes(module);

            // Helper to build internal payload from chunk (reused when reducing batch on 413)
            const buildInternalData = (c: unknown[]) =>
              mode === 'tuturuuu'
                ? c.map((item) => {
                    const record = item as Record<string, unknown>;
                    if (hasNoWsIdColumn) return record;
                    return { ...record, ws_id: targetWorkspaceId };
                  })
                : mapping
                  ? mapping(targetWorkspaceId, c)
                  : c;

            let newInternalData = buildInternalData(chunk);
            let chunkSynced = false;
            let rateLimitRetries = 0;

            while (!chunkSynced) {
              try {
                const res = await fetch(
                  internalPath.replace('[wsId]', targetWorkspaceId),
                  {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      [internalAlias ?? externalAlias ?? 'data']:
                        newInternalData,
                    }),
                  }
                );

                const data = (await res.json().catch(() => ({}))) as Record<
                  string,
                  unknown
                >;

                if (res.ok) {
                  internalData.push(...newInternalData);
                  setData(
                    'internal',
                    module,
                    internalData,
                    internalData.length
                  );
                  i += chunk.length;
                  chunkSynced = true;
                  break;
                }

                // 413 Payload Too Large — reduce batch size and retry same position
                if (res.status === 413) {
                  currentChunkSize = Math.max(
                    MIN_SYNC_CHUNK,
                    Math.floor(currentChunkSize / 2)
                  );
                  const newChunkLen = Math.min(
                    currentChunkSize,
                    dataToSync.length - i
                  );
                  chunk = dataToSync.slice(i, i + newChunkLen);
                  newInternalData = buildInternalData(chunk);
                  rateLimitRetries = 0;
                  console.log(
                    `[${module}] 413 Payload Too Large — reducing chunk to ${chunk.length}, retrying`
                  );
                  continue;
                }

                // 429 Rate Limit — backoff and retry
                if (res.status === 429 && rateLimitRetries < MAX_429_RETRIES) {
                  rateLimitRetries++;
                  const retryAfterSec =
                    Number.parseInt(
                      res.headers.get('Retry-After') ?? '0',
                      10
                    ) || Math.min(2 ** rateLimitRetries, 60);
                  console.log(
                    `[${module}] 429 Rate limit — waiting ${retryAfterSec}s (retry ${rateLimitRetries}/${MAX_429_RETRIES})`
                  );
                  await new Promise((resolve) =>
                    setTimeout(resolve, retryAfterSec * 1000)
                  );
                  continue;
                }

                // Fatal error
                setLoading(module, false);
                setError(module, data);
                internalError = (data as Record<string, unknown>)?.error;
                return;
              } catch (error) {
                setLoading(module, false);
                setError(module, error);
                internalError = error;
                return;
              } finally {
                if (chunkSynced) {
                  await new Promise((resolve) => setTimeout(resolve, 200));
                }
              }
            }
          }
        } else {
          console.log(
            `[${module}] No records to sync (${duplicates} duplicates skipped)`
          );
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
      mode,
      targetWorkspaceId,
      sourceWorkspaceId,
      effectiveApiEndpoint,
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
      setRecordsToSync,
      setCompleted,
      healthCheckMode,
      abortControllersRef,
    ]
  );

  // Migrate all
  const handleMigrateAll = useCallback(async () => {
    for (const m of modules) {
      // Skip disabled modules, mode-incompatible modules, and user-skipped modules
      const isDisabledOrIncompatible =
        m?.disabled ||
        (m?.tuturuuuOnly && mode !== 'tuturuuu') ||
        (m?.legacyOnly && mode === 'tuturuuu');
      if (!isDisabledOrIncompatible && !isModuleSkipped(m.module)) {
        await handleMigrate(m);
      }
    }
  }, [modules, handleMigrate, isModuleSkipped, mode]);

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
