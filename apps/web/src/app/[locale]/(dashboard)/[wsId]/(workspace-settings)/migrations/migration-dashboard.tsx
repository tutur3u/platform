'use client';

import { useLocalStorage } from '@mantine/hooks';
import {
  AlertCircle,
  CheckCircle2,
  Download,
  Eye,
  EyeOff,
  MoreVertical,
  Pause,
  Play,
  RefreshCcw,
  StopCircle,
  Trash2,
} from '@tuturuuu/icons';
import { createClient } from '@tuturuuu/supabase/next/client';
import { Button } from '@tuturuuu/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { Progress } from '@tuturuuu/ui/progress';
import { toast } from '@tuturuuu/ui/sonner';
import { Switch } from '@tuturuuu/ui/switch';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@tuturuuu/ui/tooltip';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  generateModules,
  type MigrationModule,
  type ModulePackage,
} from './modules';

export default function MigrationDashboard() {
  const [apiEndpoint, setApiEndpoint] = useLocalStorage({
    key: 'migration-api-endpoint',
    defaultValue: '',
  });

  const [apiKey, setApiKey] = useLocalStorage({
    key: 'migration-api-key',
    defaultValue: '',
  });

  const [workspaceId, setWorkspaceId] = useLocalStorage({
    key: 'migration-workspace-id',
    defaultValue: '',
  });

  const [showApiKey, setShowApiKey] = useState(false);
  const [workspaceName, setWorkspaceName] = useState<string | null>(null);
  const [loadingWorkspaceName, setLoadingWorkspaceName] = useState(false);
  const [healthCheckMode, setHealthCheckMode] = useLocalStorage({
    key: 'migration-health-check-mode',
    defaultValue: false,
  });
  const [cancelRequested, setCancelRequested] = useState<Set<MigrationModule>>(
    new Set()
  );
  const [pauseRequested, setPauseRequested] = useState<Set<MigrationModule>>(
    new Set()
  );
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    title: string;
    description: string;
    action: () => void;
  }>({ open: false, title: '', description: '', action: () => {} });

  const abortControllersRef = useRef<Map<MigrationModule, AbortController>>(
    new Map()
  );

  const [migrationData, setMigrationData] =
    useState<{
      [key in MigrationModule]?: {
        externalData?: any[] | null;
        internalData?: any[] | null;
        existingInternalData?: any[] | null; // Existing data before migration
        externalTotal?: number | null;
        internalTotal?: number | null;
        existingInternalTotal?: number | null;
        loading?: boolean | null;
        paused?: boolean | null;
        completed?: boolean | null;
        error?: any | null;
        duplicates?: number | null;
        updates?: number | null;
        newRecords?: number | null;
        stage?: 'external' | 'internal' | 'reconciling' | 'syncing' | null;
      } | null;
    }>();

  const loading = migrationData
    ? Object.values(migrationData).some((v) => v?.loading)
    : false;

  const configComplete = useCallback(
    () => apiEndpoint && apiKey && workspaceId,
    [apiEndpoint, apiKey, workspaceId]
  );

  // Effect to fetch workspace name when ID changes
  useEffect(() => {
    const fetchWorkspaceName = async (wsId: string) => {
      if (!wsId) {
        setWorkspaceName(null);
        setLoadingWorkspaceName(false);
        return;
      }

      setLoadingWorkspaceName(true);
      setWorkspaceName(null); // Reset to null while loading

      try {
        const supabase = createClient();
        const { data, error } = await supabase
          .from('workspaces')
          .select('name')
          .eq('id', wsId)
          .single();

        if (error || !data) {
          setWorkspaceName(''); // Empty string means not found
        } else {
          setWorkspaceName(data.name || ''); // Set the actual name
        }
      } catch (error) {
        console.error('Failed to fetch workspace name:', error);
        setWorkspaceName(''); // Empty string means error/not found
      } finally {
        setLoadingWorkspaceName(false);
      }
    };

    const timeoutId = setTimeout(() => {
      if (workspaceId) {
        fetchWorkspaceName(workspaceId);
      } else {
        setWorkspaceName(null);
        setLoadingWorkspaceName(false);
      }
    }, 500);
    return () => clearTimeout(timeoutId);
  }, [workspaceId]);

  const fetchData = useCallback(
    async (
      url: string,
      {
        onSuccess,
        onError,
      }: {
        onSuccess?: (data: any) => void;
        onError?: (error: any) => void;
      }
    ) => {
      const res = await fetch(url, {
        headers: {
          'Content-Type': 'application/json',
          'TTR-API-KEY': apiKey,
        },
      });

      const data = await res.json();

      if (!res.ok || data?.error) {
        toast.error('API Error', {
          description:
            data?.error?.message || data?.message || 'Failed to fetch data',
        });
        onError?.(data);
        return;
      }

      onSuccess?.(data);
    },
    [apiKey]
  );

  const setLoading = useCallback(
    (module: MigrationModule, loading: boolean) => {
      setMigrationData((prev) => ({
        ...prev,
        [module]: {
          ...prev?.[module],
          loading,
        },
      }));
    },
    []
  );

  const getLoading = (module: MigrationModule) => {
    return migrationData?.[module]?.loading ?? false;
  };

  type DataSource = 'external' | 'internal';

  const getCount = (source: DataSource, module: MigrationModule) => {
    return migrationData?.[module]?.[`${source}Total`] ?? 0;
  };

  const getData = (
    source: DataSource,
    module: MigrationModule
  ): any[] | null => {
    return migrationData?.[module]?.[`${source}Data`] ?? null;
  };

  const setData = useCallback(
    (
      source: DataSource,
      module: MigrationModule,
      data: any[] | null,
      count: number
    ) => {
      setMigrationData((prev) => ({
        ...prev,
        [module]: {
          ...prev?.[module],
          [`${source}Data`]: data,
          [`${source}Total`]: count,
        },
      }));
    },
    []
  );

  const setError = useCallback((module: MigrationModule, error: any) => {
    setMigrationData((prev) => ({
      ...prev,
      [module]: {
        ...prev?.[module],
        error,
      },
    }));
  }, []);

  const setPaused = useCallback((module: MigrationModule, paused: boolean) => {
    setMigrationData((prev) => ({
      ...prev,
      [module]: {
        ...prev?.[module],
        paused,
      },
    }));
  }, []);

  const setCompleted = useCallback(
    (module: MigrationModule, completed: boolean) => {
      setMigrationData((prev) => ({
        ...prev,
        [module]: {
          ...prev?.[module],
          completed,
        },
      }));
    },
    []
  );

  const setDuplicates = useCallback(
    (module: MigrationModule, duplicates: number) => {
      setMigrationData((prev) => ({
        ...prev,
        [module]: {
          ...prev?.[module],
          duplicates,
        },
      }));
    },
    []
  );

  const setUpdates = useCallback((module: MigrationModule, updates: number) => {
    setMigrationData((prev) => ({
      ...prev,
      [module]: {
        ...prev?.[module],
        updates,
      },
    }));
  }, []);

  const setNewRecords = useCallback(
    (module: MigrationModule, newRecords: number) => {
      setMigrationData((prev) => ({
        ...prev,
        [module]: {
          ...prev?.[module],
          newRecords,
        },
      }));
    },
    []
  );

  const setStage = useCallback(
    (
      module: MigrationModule,
      stage: 'external' | 'internal' | 'reconciling' | 'syncing' | null
    ) => {
      setMigrationData((prev) => ({
        ...prev,
        [module]: {
          ...prev?.[module],
          stage,
        },
      }));
    },
    []
  );

  const setExistingInternalData = useCallback(
    (module: MigrationModule, data: any[], count: number) => {
      setMigrationData((prev) => ({
        ...prev,
        [module]: {
          ...prev?.[module],
          existingInternalData: data,
          existingInternalTotal: count,
        },
      }));
    },
    []
  );

  const resetData = useCallback(
    (module: MigrationModule) => {
      setData('external', module, null, 0);
      setData('internal', module, null, 0);
      setExistingInternalData(module, [], 0);
      setError(module, null);
      setPaused(module, false);
      setCompleted(module, false);
      setDuplicates(module, 0);
      setUpdates(module, 0);
      setNewRecords(module, 0);
      setStage(module, null);
      setCancelRequested((prev) => {
        const next = new Set(prev);
        next.delete(module);
        return next;
      });
      setPauseRequested((prev) => {
        const next = new Set(prev);
        next.delete(module);
        return next;
      });
    },
    [
      setData,
      setExistingInternalData,
      setError,
      setPaused,
      setCompleted,
      setDuplicates,
      setUpdates,
      setNewRecords,
      setStage,
    ]
  );

  const handlePause = (module: MigrationModule) => {
    setPauseRequested((prev) => new Set(prev).add(module));
    setPaused(module, true);
    toast.info('Migration paused', {
      description: `${module} migration has been paused`,
    });
  };

  const handleResume = (module: MigrationModule) => {
    setPauseRequested((prev) => {
      const next = new Set(prev);
      next.delete(module);
      return next;
    });
    setPaused(module, false);
    toast.info('Migration resumed', {
      description: `${module} migration has been resumed`,
    });
  };

  const handleStop = (module: MigrationModule) => {
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
  };

  const handleClearData = (module: MigrationModule) => {
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
  };

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
      // Create abort controller for this migration
      const abortController = new AbortController();
      abortControllersRef.current.set(module, abortController);

      setLoading(module, true);
      resetData(module);

      const externalUrl = `${apiEndpoint}${externalPath}`;
      const chunkSize = 1000;
      const healthCheckLimit = 1001;

      // ========== STAGE 1 & 2: FETCH EXTERNAL AND INTERNAL DATA IN PARALLEL ==========
      setStage(module, 'external');

      let externalCount = -1;
      let externalData: any[] = [];
      let externalError: any = null;
      let existingInternalData: any[] = [];

      // Prepare internal fetch function with batching
      const fetchInternalData = async () => {
        if (!skip && internalPath && workspaceId) {
          // Fetch existing data from internal database to compare
          // Convert migration endpoint to read endpoint
          // Example: /api/v1/infrastructure/migrate/users -> /api/v1/infrastructure/users
          const internalFetchUrl = internalPath
            .replace('[wsId]', workspaceId)
            .replace('/migrate/', '/');

          console.log(
            `[${module}] Fetching existing internal data from:`,
            internalFetchUrl
          );

          const allInternalData: any[] = [];
          let offset = 0;
          const batchSize = 1000;
          const maxFetch = healthCheckMode ? healthCheckLimit : 100000;

          try {
            // Keep fetching in batches of 1000 until we get all data or hit the limit
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

                // Handle different response formats
                const batchData = Array.isArray(data)
                  ? data
                  : data?.data || data?.items || data?.records || [];

                if (batchData.length === 0) {
                  // No more data to fetch
                  break;
                }

                allInternalData.push(...batchData);
                console.log(
                  `[${module}] Fetched ${batchData.length} records (total: ${allInternalData.length})`
                );

                // Update progress
                setExistingInternalData(
                  module,
                  allInternalData,
                  allInternalData.length
                );

                // If we got less than batch size, we've reached the end
                if (batchData.length < batchSize) {
                  break;
                }

                offset += batchSize;

                // Small delay between batches
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
            // Continue anyway - might be first time migration
          }
        }
        return [];
      };

      // Start internal fetch immediately in parallel
      const internalFetchPromise = fetchInternalData();

      // Fetch external data
      while (
        !cancelRequested.has(module) &&
        externalError === null &&
        (externalData.length < externalCount || externalCount === -1) &&
        (!healthCheckMode || externalData.length < healthCheckLimit)
      ) {
        // Check for pause
        while (pauseRequested.has(module) && !cancelRequested.has(module)) {
          await new Promise((resolve) => setTimeout(resolve, 500));
        }

        // Check if cancelled during pause
        if (cancelRequested.has(module)) break;

        await fetchData(
          `${externalUrl}?from=${externalData.length}&limit=${chunkSize}`
            // if there are 2 or more '?' in url, replace the second and next ones with '&'
            .replace(/\?([^?]*)(\?)/g, '?$1&'),
          {
            onSuccess: (newData) => {
              if (externalCount === -1) externalCount = newData.count;
              externalData = [
                ...externalData,
                ...(newData?.[externalAlias ?? internalAlias ?? 'data'] ?? []),
              ];
              setData('external', module, externalData, newData.count);

              // If count does not match, stop fetching (unless in health check mode)
              if (!healthCheckMode && externalData.length !== externalCount)
                return;
            },
            onError: async (error) => {
              setLoading(module, false);
              setError(module, error);
              externalError = error;
              return;
            },
          }
        );

        // wait 200ms
        await new Promise((resolve) => setTimeout(resolve, 200));
      }

      // Check if cancelled
      if (cancelRequested.has(module)) {
        setLoading(module, false);
        abortControllersRef.current.delete(module);
        return;
      }

      // Wait for internal data to finish loading
      setStage(module, 'internal');
      existingInternalData = await internalFetchPromise;

      // Check if cancelled
      if (cancelRequested.has(module)) {
        setLoading(module, false);
        abortControllersRef.current.delete(module);
        return;
      }

      // ========== STAGE 3: RECONCILIATION ==========
      setStage(module, 'reconciling');

      let totalDuplicates = 0;
      let totalUpdates = 0;
      let totalNewRecords = 0;

      console.log(`[${module}] Starting reconciliation...`);
      console.log(`[${module}] External records: ${externalData.length}`);
      console.log(
        `[${module}] Existing records: ${existingInternalData.length}`
      );

      // Apply mapping to external data before comparison
      const mappedExternalData = mapping
        ? mapping(workspaceId, externalData)
        : externalData;
      console.log(
        `[${module}] Mapped external data: ${mappedExternalData.length} records`
      );

      // Define composite key strategies for tables without primary `id` field
      const compositeKeyStrategies: Record<
        string,
        (item: any) => string | null
      > = {
        'class-packages': (item) =>
          item.group_id && item.product_id && item.unit_id
            ? `${item.group_id}|${item.product_id}|${item.unit_id}`
            : null,
        'class-members': (item) =>
          item.user_id && item.group_id
            ? `${item.user_id}|${item.group_id}`
            : null,
        'class-scores': (item) =>
          item.user_id && item.indicator_id
            ? `${item.user_id}|${item.indicator_id}`
            : null,
        'class-attendance': (item) =>
          item.group_id && item.user_id && item.date
            ? `${item.group_id}|${item.user_id}|${item.date}`
            : null,
        'bill-packages': (item) =>
          item.invoice_id &&
          item.product_name &&
          item.product_unit &&
          item.warehouse
            ? `${item.invoice_id}|${item.product_name}|${item.product_unit}|${item.warehouse}`
            : null,
        'user-coupons': (item) =>
          item.user_id && item.promo_id
            ? `${item.user_id}|${item.promo_id}`
            : null,
        'product-prices': (item) =>
          item.product_id && item.unit_id && item.warehouse_id
            ? `${item.product_id}|${item.unit_id}|${item.warehouse_id}`
            : null,
        'bill-coupons': (item) =>
          item.invoice_id && item.code && item.value && item.use_ratio ? `${item.invoice_id}|${item.code}|${item.value}|${item.use_ratio}` : null,
        
      };

      // Helper to get unique key for an item (composite or simple id)
      const getItemKey = (item: any): string | null => {
        // Try composite key strategy first if module has one
        const compositeKeyFn = compositeKeyStrategies[module];
        if (compositeKeyFn) {
          return compositeKeyFn(item);
        }
        // Fallback to simple id
        return item.id || item._id || null;
      };

      // Build a map of existing records by key for quick lookup
      const existingMap = new Map();
      existingInternalData.forEach((item) => {
        const key = getItemKey(item);
        if (key) existingMap.set(key, item);
      });

      console.log(
        `[${module}] Built existing map with ${existingMap.size} entries using ${compositeKeyStrategies[module] ? 'composite key' : 'simple id'} strategy`
      );

      // Helper function to compare objects ignoring timestamps and metadata
      const hasSignificantChanges = (existing: any, external: any) => {
        // Fields to ignore in comparison
        const ignoreFields = [
          'created_at',
          'updated_at',
          'modified_at',
          'last_modified',
          'ws_id', // workspace context field
        ];

        // Get keys from external object (source of truth for comparison)
        const extKeys = Object.keys(external).filter(
          (k) => !ignoreFields.includes(k)
        );

        // Track first difference for debugging
        let firstDiff: { key: string; extVal: any; existVal: any } | null =
          null;

        // Compare only fields present in external data
        for (const key of extKeys) {
          const extVal = external[key];
          const existVal = existing[key];

          // Skip if key doesn't exist in existing (it's a new field, not a change)
          if (!(key in existing)) continue;

          // Normalize values for comparison
          const normalizeValue = (val: any) => {
            if (val === null || val === undefined) return null;
            if (typeof val === 'string') return val.trim();
            // Handle boolean stored as number
            if (typeof val === 'number' && (val === 0 || val === 1)) return val;
            return val;
          };

          const normalizedExt = normalizeValue(extVal);
          const normalizedExist = normalizeValue(existVal);

          // Deep comparison for nested objects/arrays
          if (
            JSON.stringify(normalizedExt) !== JSON.stringify(normalizedExist)
          ) {
            if (!firstDiff) {
              firstDiff = {
                key,
                extVal: normalizedExt,
                existVal: normalizedExist,
              };
            }
            return true;
          }
        }

        // Log first difference found for debugging
        if (firstDiff) {
          const key = existing.id || existing._id || 'composite-key-record';
          console.log(`[${module}] First diff in ${key}:`, firstDiff);
        }

        return false;
      };

      // Analyze mapped external data vs existing data
      for (const extItem of mappedExternalData) {
        const extKey = getItemKey(extItem);
        if (extKey && existingMap.has(extKey)) {
          // Check if data is different (needs update)
          const existing = existingMap.get(extKey);
          const hasChanges = hasSignificantChanges(existing, extItem);
          if (hasChanges) {
            totalUpdates++;
          } else {
            totalDuplicates++;
          }
        } else {
          totalNewRecords++;
        }
      }

      console.log(`[${module}] Reconciliation complete:`, {
        new: totalNewRecords,
        updates: totalUpdates,
        duplicates: totalDuplicates,
      });

      setDuplicates(module, totalDuplicates);
      setUpdates(module, totalUpdates);
      setNewRecords(module, totalNewRecords);

      // Check if cancelled
      if (cancelRequested.has(module)) {
        setLoading(module, false);
        abortControllersRef.current.delete(module);
        return;
      }

      // ========== STAGE 4: SYNC TO INTERNAL DATABASE ==========
      setStage(module, 'syncing');

      const internalData: any[] = [];
      let internalError: any = null;

      // Sync data
      if (skip) {
        console.log('Skipping migration for', module);
      } else if (internalPath && workspaceId) {
        await new Promise((resolve) => setTimeout(resolve, 200));

        if (externalData !== null && externalData.length > 0) {
          for (let i = 0; i < externalData.length; i += chunkSize) {
            // Check for pause or cancel
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
                  headers: {
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({
                    [internalAlias ?? externalAlias ?? 'data']: newInternalData,
                  }),
                }
              );

              const data = await res.json();

              if (!res.ok) {
                setLoading(module, false);
                setError(module, data);
                internalError = data?.error;
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

      // Check if cancelled
      if (cancelRequested.has(module)) {
        setLoading(module, false);
        abortControllersRef.current.delete(module);
        return;
      }

      // Mark as completed
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
      fetchData,
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
    ]
  );

  const generateModule = ({
    name,
    module,
    externalAlias,
    internalAlias,
    externalPath,
    internalPath,
    mapping,
    skip,
    disabled,
  }: ModulePackage) => {
    const externalData = getData('external', module);
    const internalData = getData('internal', module);
    const externalCount = getCount('external', module);
    const isLoading = getLoading(module);
    const isPaused = migrationData?.[module]?.paused ?? false;
    const isCompleted = migrationData?.[module]?.completed ?? false;
    const error = migrationData?.[module]?.error;
    const duplicates = migrationData?.[module]?.duplicates ?? 0;
    const updates = migrationData?.[module]?.updates ?? 0;
    const newRecords = migrationData?.[module]?.newRecords ?? 0;
    const stage = migrationData?.[module]?.stage;
    const existingInternalTotal =
      migrationData?.[module]?.existingInternalTotal ?? 0;

    const externalProgress =
      externalData !== null
        ? externalData.length === 0
          ? 100
          : ((externalData.length ?? 0) / externalCount) * 100
        : 0;

    const syncProgress =
      externalData !== null
        ? externalData.length === internalData?.length
          ? 100
          : skip
            ? 100
            : ((externalData ?? []).filter((v) =>
                (internalData ?? []).find(
                  (iv) => iv.id === v.id || iv._id === v.id
                )
              ).length /
                (externalData.length ?? 0)) *
              100
        : 0;

    return (
      <Card key={name} className={disabled ? 'opacity-50' : ''}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-base capitalize">
                {name.replace(/-/g, ' ')}
              </CardTitle>
              {skip && (
                <span className="rounded bg-dynamic-yellow/10 px-2 py-0.5 font-medium text-dynamic-yellow text-xs">
                  Skip
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
              {externalData !== null && (
                <div className="flex items-center gap-1 rounded-md border bg-muted px-2 py-1 font-mono font-semibold text-xs">
                  <span className="text-muted-foreground">
                    {internalData?.length ?? 0}
                  </span>
                  <span className="text-muted-foreground">/</span>
                  <span>
                    {healthCheckMode && externalCount > 1001
                      ? '1001+'
                      : externalCount}
                  </span>
                  {healthCheckMode && externalCount > 1001 && (
                    <Tooltip>
                      <TooltipTrigger>
                        <AlertCircle className="h-3 w-3 text-dynamic-orange" />
                      </TooltipTrigger>
                      <TooltipContent>
                        Health check mode limited to 1001 entries. Full count:{' '}
                        {externalCount.toLocaleString()}
                      </TooltipContent>
                    </Tooltip>
                  )}
                </div>
              )}

              {externalData !== null && (
                <Button
                  onClick={() => handleClearData(module)}
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  disabled={isLoading}
                  title="Clear data"
                >
                  <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                </Button>
              )}

              {isLoading && (
                <>
                  <Button
                    onClick={() =>
                      isPaused ? handleResume(module) : handlePause(module)
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
                    onClick={() => handleStop(module)}
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
                onClick={() =>
                  handleMigrate({
                    name,
                    module,
                    externalAlias,
                    internalAlias,
                    externalPath,
                    internalPath,
                    mapping,
                  })
                }
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                disabled={disabled || isLoading}
                title={externalData ? 'Re-run migration' : 'Start migration'}
              >
                {externalData ? (
                  <RefreshCcw className="h-4 w-4" />
                ) : (
                  <Play className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>

          {error && (
            <div className="mt-2 flex items-start gap-2 rounded-md border border-dynamic-red/20 bg-dynamic-red/5 p-2">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-dynamic-red" />
              <div className="flex-1">
                <p className="font-medium text-dynamic-red text-xs">
                  {error?.error?.message ||
                    error?.message ||
                    'Migration failed'}
                </p>
                {error?.error?.details && (
                  <p className="mt-1 text-muted-foreground text-xs">
                    {error.error.details}
                  </p>
                )}
              </div>
            </div>
          )}
        </CardHeader>

        {!disabled && externalData !== null && (
          <CardContent className="space-y-3 pt-0">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">External fetch</span>
                <span className="font-medium">
                  {externalData.length} / {externalCount}
                </span>
              </div>
              <Progress value={externalProgress} className="h-1.5" />
            </div>

            {/* Show reconciliation results prominently */}
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

                {/* Visual breakdown */}
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
                    {Math.round(syncProgress)}%
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
      </Card>
    );
  };

  const modules = generateModules();

  const handleMigrateAll = useCallback(async () => {
    for (const m of modules) if (!m?.disabled) await handleMigrate(m);
  }, [modules, handleMigrate]);

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
  }, [modules, resetData]);

  const generateModuleComponents = () => {
    return (
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {modules.map((m) => generateModule(m))}
      </div>
    );
  };

  const handleStopAll = () => {
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
  };

  const totalExternal = Object.values(migrationData ?? {}).reduce(
    (acc, v) => acc + (v?.externalTotal ?? 0),
    0
  );
  const totalSynced = Object.values(migrationData ?? {}).reduce(
    (acc, v) => acc + (v?.internalData?.length ?? 0),
    0
  );

  const modulesWithData = Object.values(migrationData ?? {}).filter(
    (v) => v?.externalData && v.externalData.length > 0
  ).length;

  const completedModules = Object.values(migrationData ?? {}).filter(
    (v) => v?.completed
  ).length;

  const runningModules = Object.values(migrationData ?? {}).filter(
    (v) => v?.loading
  ).length;

  const pausedModules = Object.values(migrationData ?? {}).filter(
    (v) => v?.paused
  ).length;

  const totalDuplicates = Object.values(migrationData ?? {}).reduce(
    (acc, v) => acc + (v?.duplicates ?? 0),
    0
  );

  const totalUpdates = Object.values(migrationData ?? {}).reduce(
    (acc, v) => acc + (v?.updates ?? 0),
    0
  );

  const totalNewRecords = Object.values(migrationData ?? {}).reduce(
    (acc, v) => acc + (v?.newRecords ?? 0),
    0
  );

  const hasData = totalExternal !== 0;

  const exportSummary = useCallback(() => {
    const summary = modules
      .map((m) => {
        const data = migrationData?.[m.module];
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
          internalTotal: data?.internalData?.length ?? 0,
          existingTotal: data?.existingInternalTotal ?? 0,
          newRecords: data?.newRecords ?? 0,
          updates: data?.updates ?? 0,
          duplicates: data?.duplicates ?? 0,
          stage: data?.stage ?? 'N/A',
          error: data?.error?.error?.message || data?.error?.message || 'N/A',
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

  return (
    <TooltipProvider>
      <div className="flex flex-col gap-6">
        {/* Configuration Section */}
        <Card>
          <CardHeader>
            <CardTitle>Migration Configuration</CardTitle>
            <CardDescription>
              Configure your external API connection and target workspace for
              data migration
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-4 flex items-center justify-between gap-4 rounded-lg border bg-muted/30 p-3">
              <Label
                htmlFor="health-check-mode"
                className="cursor-pointer font-normal text-sm"
              >
                Health Check Mode (limits to 1001 entries per module for quick
                verification)
              </Label>
              <Switch
                id="health-check-mode"
                checked={healthCheckMode}
                onCheckedChange={setHealthCheckMode}
              />
            </div>

            <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="api-endpoint">
                  API Endpoint <span className="text-dynamic-red">*</span>
                </Label>
                <Input
                  id="api-endpoint"
                  placeholder="https://example.com/api/v1"
                  value={apiEndpoint}
                  onChange={(e) => setApiEndpoint(e.currentTarget.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="api-key">
                  API Key <span className="text-dynamic-red">*</span>
                </Label>
                <div className="relative">
                  <Input
                    id="api-key"
                    type={showApiKey ? 'text' : 'password'}
                    placeholder="Enter your API key"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.currentTarget.value)}
                    className="pr-10"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute top-0 right-0 h-full px-3"
                    onClick={() => setShowApiKey(!showApiKey)}
                    tabIndex={-1}
                  >
                    {showApiKey ? (
                      <EyeOff className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <Eye className="h-4 w-4 text-muted-foreground" />
                    )}
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="workspace-id">
                  Workspace ID <span className="text-dynamic-red">*</span>
                </Label>
                <div className="space-y-1">
                  <Input
                    id="workspace-id"
                    placeholder="Enter workspace ID"
                    value={workspaceId}
                    onChange={(e) => setWorkspaceId(e.currentTarget.value)}
                  />
                  {workspaceId && (
                    <div className="flex items-center gap-2 text-xs">
                      {loadingWorkspaceName || workspaceName === null ? (
                        <span className="flex items-center gap-1 text-muted-foreground">
                          <div className="h-3 w-3 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
                          Loading workspace...
                        </span>
                      ) : workspaceName !== '' ? (
                        <span className="flex items-center gap-1 text-muted-foreground">
                          <CheckCircle2 className="h-3 w-3 text-green-600" />
                          {workspaceName}
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-destructive">
                          <AlertCircle className="h-3 w-3" />
                          Workspace not found
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Confirmation Dialog */}
        <Dialog
          open={confirmDialog.open}
          onOpenChange={(open) =>
            !open && setConfirmDialog({ ...confirmDialog, open: false })
          }
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{confirmDialog.title}</DialogTitle>
              <DialogDescription>{confirmDialog.description}</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() =>
                  setConfirmDialog({ ...confirmDialog, open: false })
                }
              >
                Cancel
              </Button>
              <Button variant="destructive" onClick={confirmDialog.action}>
                Confirm
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Detailed Summary */}
        {hasData && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Migration Summary</CardTitle>
                  <CardDescription>
                    Overview of all migration modules and their status
                  </CardDescription>
                </div>
                <Button onClick={exportSummary} variant="outline" size="sm">
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
                      <th className="pr-4 pb-3 text-left font-medium">
                        Module
                      </th>
                      <th className="px-4 pb-3 text-left font-medium">
                        Status
                      </th>
                      <th className="px-4 pb-3 text-right font-medium">
                        External
                      </th>
                      <th className="px-4 pb-3 text-right font-medium">
                        Synced
                      </th>
                      <th className="px-4 pb-3 text-right font-medium">New</th>
                      <th className="px-4 pb-3 text-right font-medium">
                        Updates
                      </th>
                      <th className="px-4 pb-3 text-right font-medium">
                        Duplicates
                      </th>
                      <th className="pb-3 pl-4 text-left font-medium">Stage</th>
                    </tr>
                  </thead>
                  <tbody>
                    {modules
                      .filter((m) => !m.disabled && migrationData?.[m.module])
                      .map((m) => {
                        const data = migrationData?.[m.module];
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
                              {data?.internalData?.length?.toLocaleString() ??
                                '-'}
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
        )}

        {/* Migration Statistics */}
        {hasData && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <p className="text-muted-foreground text-xs">
                      Total Records
                    </p>
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
                    <p className="text-muted-foreground text-xs">
                      Synchronized
                    </p>
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
                      totalExternal > 0
                        ? (totalSynced / totalExternal) * 100
                        : 0
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
                    <p className="text-muted-foreground text-xs">
                      Modules Active
                    </p>
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
        )}

        {/* Migration Overview */}
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <h2 className="flex items-center gap-2 font-semibold text-2xl">
              Migration Modules
              {!hasData && configComplete() && (
                <span className="font-normal text-muted-foreground text-sm">
                  ({modules.filter((m) => !m.disabled).length} modules
                  available)
                </span>
              )}
            </h2>
            <div className="flex items-center gap-2">
              <p className="text-muted-foreground text-sm">
                {configComplete()
                  ? `Migrate data from external source to workspace ${workspaceId}`
                  : 'Configure API settings above to begin migration'}
              </p>
              {(totalDuplicates > 0 || totalUpdates > 0) && (
                <div className="flex items-center gap-1">
                  {totalDuplicates > 0 && (
                    <span className="rounded-full bg-dynamic-yellow/10 px-2 py-0.5 text-dynamic-yellow text-xs">
                      {totalDuplicates} duplicates
                    </span>
                  )}
                  {totalUpdates > 0 && (
                    <span className="rounded-full bg-dynamic-blue/10 px-2 py-0.5 text-dynamic-blue text-xs">
                      {totalUpdates} updates
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
        {generateModuleComponents()}

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
