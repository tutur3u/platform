'use client';

import { useLocalStorage } from '@mantine/hooks';
import { createClient } from '@tuturuuu/supabase/next/client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { MigrationModule } from '../modules';
import type {
  ConfirmDialogState,
  DataSource,
  MigrationData,
  MigrationStage,
  ModuleState,
} from '../utils/types';
import { DEFAULT_MODULE_STATE } from '../utils/types';

export type MigrationMode = 'tuturuuu' | 'legacy';

interface MigrationConfig {
  mode: MigrationMode;
  // Legacy mode settings
  legacyApiEndpoint: string;
  legacyApiKey: string;
  // Tuturuuu mode settings
  tuturuuuApiEndpoint: string;
  tuturuuuApiKey: string;
  sourceWorkspaceId: string;
  // Target workspace ID (where to push data TO - current workspace)
  targetWorkspaceId: string;
  healthCheckMode: boolean;
}

// Default Tuturuuu API endpoint (production v2)
const DEFAULT_TUTURUUU_API_ENDPOINT = 'https://tuturuuu.com/api/v2';

interface MigrationStateReturn {
  // Config
  config: MigrationConfig;
  configLoading: boolean; // True until localStorage values are loaded
  setMode: (value: MigrationMode) => void;
  setLegacyApiEndpoint: (value: string) => void;
  setLegacyApiKey: (value: string) => void;
  setTuturuuuApiEndpoint: (value: string) => void;
  setTuturuuuApiKey: (value: string) => void;
  setSourceWorkspaceId: (value: string) => void;
  setTargetWorkspaceId: (value: string) => void;
  setHealthCheckMode: (value: boolean) => void;
  configComplete: boolean;
  // User-defined skip modules (persisted in localStorage)
  skippedModules: string[];
  toggleSkipModule: (module: MigrationModule) => void;
  isModuleSkipped: (module: MigrationModule) => boolean;
  skipAllModules: (modules: MigrationModule[]) => void;
  unskipAllModules: () => void;
  // Effective API endpoint (computed based on mode)
  effectiveApiEndpoint: string;
  // Effective API key (computed based on mode)
  effectiveApiKey: string;

  // Workspace names
  sourceWorkspaceName: string | null;
  loadingSourceWorkspaceName: boolean;
  targetWorkspaceName: string | null;
  loadingTargetWorkspaceName: boolean;

  // Migration data
  migrationData: MigrationData;
  loading: boolean;
  hasData: boolean;

  // Control sets
  cancelRequested: Set<MigrationModule>;
  setCancelRequested: React.Dispatch<
    React.SetStateAction<Set<MigrationModule>>
  >;
  pauseRequested: Set<MigrationModule>;
  setPauseRequested: React.Dispatch<React.SetStateAction<Set<MigrationModule>>>;

  // Abort controllers
  abortControllersRef: React.MutableRefObject<
    Map<MigrationModule, AbortController>
  >;

  // Dialog
  confirmDialog: ConfirmDialogState;
  setConfirmDialog: React.Dispatch<React.SetStateAction<ConfirmDialogState>>;

  // Module state accessors
  getModuleState: (module: MigrationModule) => ModuleState;
  getData: (source: DataSource, module: MigrationModule) => unknown[] | null;
  getCount: (source: DataSource, module: MigrationModule) => number;
  getLoading: (module: MigrationModule) => boolean;

  // Module state setters
  setLoading: (module: MigrationModule, loading: boolean) => void;
  setData: (
    source: DataSource,
    module: MigrationModule,
    data: unknown[] | null,
    count: number
  ) => void;
  setError: (module: MigrationModule, error: unknown) => void;
  setPaused: (module: MigrationModule, paused: boolean) => void;
  setCompleted: (module: MigrationModule, completed: boolean) => void;
  setDuplicates: (module: MigrationModule, duplicates: number) => void;
  setUpdates: (module: MigrationModule, updates: number) => void;
  setNewRecords: (module: MigrationModule, newRecords: number) => void;
  setStage: (module: MigrationModule, stage: MigrationStage) => void;
  setExistingInternalData: (
    module: MigrationModule,
    data: unknown[],
    count: number
  ) => void;
  resetData: (module: MigrationModule) => void;

  // Computed stats
  stats: {
    totalExternal: number;
    totalSynced: number;
    totalNewRecords: number;
    totalUpdates: number;
    totalDuplicates: number;
    modulesWithData: number;
    completedModules: number;
    runningModules: number;
    pausedModules: number;
  };
}

export function useMigrationState(
  initialTargetWorkspaceId?: string
): MigrationStateReturn {
  // Config with localStorage persistence
  const [mode, setMode] = useLocalStorage<MigrationMode>({
    key: 'migration-mode',
    defaultValue: 'tuturuuu',
  });
  // Legacy mode settings
  const [legacyApiEndpoint, setLegacyApiEndpoint] = useLocalStorage({
    key: 'migration-legacy-api-endpoint',
    defaultValue: '',
  });
  const [legacyApiKey, setLegacyApiKey] = useLocalStorage({
    key: 'migration-legacy-api-key',
    defaultValue: '',
  });
  // Tuturuuu mode settings
  const [tuturuuuApiEndpoint, setTuturuuuApiEndpoint] = useLocalStorage({
    key: 'migration-tuturuuu-api-endpoint',
    defaultValue: DEFAULT_TUTURUUU_API_ENDPOINT,
  });
  const [tuturuuuApiKey, setTuturuuuApiKey] = useLocalStorage({
    key: 'migration-tuturuuu-api-key',
    defaultValue: '',
  });
  const [sourceWorkspaceId, setSourceWorkspaceId] = useLocalStorage({
    key: 'migration-source-workspace-id',
    defaultValue: '',
  });
  // Shared settings
  const [targetWorkspaceId, setTargetWorkspaceId] = useLocalStorage({
    key: 'migration-target-workspace-id',
    defaultValue: initialTargetWorkspaceId || '',
  });
  const [healthCheckMode, setHealthCheckMode] = useLocalStorage({
    key: 'migration-health-check-mode',
    defaultValue: false,
  });

  // User-defined skip modules (persisted in localStorage)
  const [skippedModules, setSkippedModules] = useLocalStorage<string[]>({
    key: 'migration-skipped-modules',
    defaultValue: [],
  });

  // Toggle skip state for a module
  const toggleSkipModule = useCallback(
    (module: MigrationModule) => {
      setSkippedModules((prev) => {
        if (prev.includes(module)) {
          return prev.filter((m) => m !== module);
        }
        return [...prev, module];
      });
    },
    [setSkippedModules]
  );

  // Check if a module is skipped
  const isModuleSkipped = useCallback(
    (module: MigrationModule) => {
      return skippedModules.includes(module);
    },
    [skippedModules]
  );

  // Skip all modules
  const skipAllModules = useCallback(
    (modules: MigrationModule[]) => {
      setSkippedModules(modules);
    },
    [setSkippedModules]
  );

  // Unskip all modules
  const unskipAllModules = useCallback(() => {
    setSkippedModules([]);
  }, [setSkippedModules]);

  // Track when localStorage values have been hydrated (client-side only)
  const [configLoading, setConfigLoading] = useState(true);
  useEffect(() => {
    // After first render, localStorage values are available
    setConfigLoading(false);
  }, []);

  // Set target workspace ID from initial value on mount only
  // Using a ref to track if initial value has been applied to avoid
  // resetting user edits when they manually change the field
  const initializedTargetRef = useRef(false);
  useEffect(() => {
    if (initialTargetWorkspaceId && !initializedTargetRef.current) {
      setTargetWorkspaceId(initialTargetWorkspaceId);
      initializedTargetRef.current = true;
    }
  }, [initialTargetWorkspaceId, setTargetWorkspaceId]);

  // Compute effective values based on mode
  const effectiveApiEndpoint =
    mode === 'tuturuuu'
      ? tuturuuuApiEndpoint || DEFAULT_TUTURUUU_API_ENDPOINT
      : legacyApiEndpoint;
  const effectiveApiKey = mode === 'tuturuuu' ? tuturuuuApiKey : legacyApiKey;

  // Source workspace name (for Tuturuuu mode, fetched from Tuturuuu production)
  const [sourceWorkspaceName, setSourceWorkspaceName] = useState<string | null>(
    null
  );
  const [loadingSourceWorkspaceName, setLoadingSourceWorkspaceName] =
    useState(false);

  // Target workspace name (current workspace)
  const [targetWorkspaceName, setTargetWorkspaceName] = useState<string | null>(
    null
  );
  const [loadingTargetWorkspaceName, setLoadingTargetWorkspaceName] =
    useState(false);

  // Control sets
  const [cancelRequested, setCancelRequested] = useState<Set<MigrationModule>>(
    new Set()
  );
  const [pauseRequested, setPauseRequested] = useState<Set<MigrationModule>>(
    new Set()
  );

  // Confirmation dialog
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState>({
    open: false,
    title: '',
    description: '',
    action: () => {},
  });

  // Abort controllers
  const abortControllersRef = useRef<Map<MigrationModule, AbortController>>(
    new Map()
  );

  // Migration data
  const [migrationData, setMigrationData] = useState<MigrationData>({});

  // Computed values
  // For Tuturuuu mode: need API key, source workspace ID, and target workspace ID
  // For Legacy mode: need API endpoint, API key, and target workspace ID
  const configComplete =
    mode === 'tuturuuu'
      ? !!(tuturuuuApiKey && sourceWorkspaceId && targetWorkspaceId)
      : !!(legacyApiEndpoint && legacyApiKey && targetWorkspaceId);
  const loading = Object.values(migrationData).some((v) => v?.loading);

  // Fetch source workspace name when ID changes (for Tuturuuu mode, uses proxy API)
  useEffect(() => {
    const fetchSourceWorkspaceName = async (wsId: string) => {
      if (!wsId || mode !== 'tuturuuu') {
        setSourceWorkspaceName(null);
        setLoadingSourceWorkspaceName(false);
        return;
      }

      if (!tuturuuuApiKey) {
        setSourceWorkspaceName(null);
        setLoadingSourceWorkspaceName(false);
        return;
      }

      setLoadingSourceWorkspaceName(true);
      setSourceWorkspaceName(null);

      try {
        // Use proxy API to avoid CORS issues when fetching from Tuturuuu production
        // Pass the configured API endpoint to the proxy
        const apiUrlParam = tuturuuuApiEndpoint
          ? `&apiUrl=${encodeURIComponent(tuturuuuApiEndpoint)}`
          : '';
        const response = await fetch(
          `/api/v1/proxy/tuturuuu?path=/api/v2/workspaces/${wsId}${apiUrlParam}`,
          {
            headers: {
              'X-Tuturuuu-Api-Key': tuturuuuApiKey,
            },
          }
        );

        if (!response.ok) {
          setSourceWorkspaceName('');
        } else {
          const data = await response.json();
          setSourceWorkspaceName(data.name || data.workspace?.name || '');
        }
      } catch {
        setSourceWorkspaceName('');
      } finally {
        setLoadingSourceWorkspaceName(false);
      }
    };

    const timeoutId = setTimeout(() => {
      if (sourceWorkspaceId && mode === 'tuturuuu') {
        fetchSourceWorkspaceName(sourceWorkspaceId);
      } else {
        setSourceWorkspaceName(null);
        setLoadingSourceWorkspaceName(false);
      }
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [sourceWorkspaceId, mode, tuturuuuApiKey, tuturuuuApiEndpoint]);

  // Fetch target workspace name (from local database)
  useEffect(() => {
    const fetchTargetWorkspaceName = async (wsId: string) => {
      if (!wsId) {
        setTargetWorkspaceName(null);
        setLoadingTargetWorkspaceName(false);
        return;
      }

      setLoadingTargetWorkspaceName(true);
      setTargetWorkspaceName(null);

      try {
        const supabase = createClient();
        const { data, error } = await supabase
          .from('workspaces')
          .select('name')
          .eq('id', wsId)
          .single();

        if (error || !data) {
          setTargetWorkspaceName('');
        } else {
          setTargetWorkspaceName(data.name || '');
        }
      } catch {
        setTargetWorkspaceName('');
      } finally {
        setLoadingTargetWorkspaceName(false);
      }
    };

    const timeoutId = setTimeout(() => {
      if (targetWorkspaceId) {
        fetchTargetWorkspaceName(targetWorkspaceId);
      } else {
        setTargetWorkspaceName(null);
        setLoadingTargetWorkspaceName(false);
      }
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [targetWorkspaceId]);

  // Module state accessors
  const getModuleState = useCallback(
    (module: MigrationModule): ModuleState => {
      return { ...DEFAULT_MODULE_STATE, ...migrationData[module] };
    },
    [migrationData]
  );

  const getData = useCallback(
    (source: DataSource, module: MigrationModule): unknown[] | null => {
      const key = source === 'external' ? 'externalData' : 'internalData';
      return (migrationData[module]?.[key] as unknown[] | null) ?? null;
    },
    [migrationData]
  );

  const getCount = useCallback(
    (source: DataSource, module: MigrationModule): number => {
      const key = source === 'external' ? 'externalTotal' : 'internalTotal';
      return (migrationData[module]?.[key] as number) ?? 0;
    },
    [migrationData]
  );

  const getLoading = useCallback(
    (module: MigrationModule): boolean => {
      return migrationData[module]?.loading ?? false;
    },
    [migrationData]
  );

  // Module state setters
  const updateModuleState = useCallback(
    (module: MigrationModule, updates: Partial<ModuleState>) => {
      setMigrationData((prev) => ({
        ...prev,
        [module]: { ...prev[module], ...updates },
      }));
    },
    []
  );

  const setLoading = useCallback(
    (module: MigrationModule, loading: boolean) => {
      updateModuleState(module, { loading });
    },
    [updateModuleState]
  );

  const setData = useCallback(
    (
      source: DataSource,
      module: MigrationModule,
      data: unknown[] | null,
      count: number
    ) => {
      if (source === 'external') {
        updateModuleState(module, { externalData: data, externalTotal: count });
      } else {
        updateModuleState(module, { internalData: data, internalTotal: count });
      }
    },
    [updateModuleState]
  );

  const setError = useCallback(
    (module: MigrationModule, error: unknown) => {
      updateModuleState(module, { error });
    },
    [updateModuleState]
  );

  const setPaused = useCallback(
    (module: MigrationModule, paused: boolean) => {
      updateModuleState(module, { paused });
    },
    [updateModuleState]
  );

  const setCompleted = useCallback(
    (module: MigrationModule, completed: boolean) => {
      updateModuleState(module, { completed });
    },
    [updateModuleState]
  );

  const setDuplicates = useCallback(
    (module: MigrationModule, duplicates: number) => {
      updateModuleState(module, { duplicates });
    },
    [updateModuleState]
  );

  const setUpdates = useCallback(
    (module: MigrationModule, updates: number) => {
      updateModuleState(module, { updates });
    },
    [updateModuleState]
  );

  const setNewRecords = useCallback(
    (module: MigrationModule, newRecords: number) => {
      updateModuleState(module, { newRecords });
    },
    [updateModuleState]
  );

  const setStage = useCallback(
    (module: MigrationModule, stage: MigrationStage) => {
      updateModuleState(module, { stage });
    },
    [updateModuleState]
  );

  const setExistingInternalData = useCallback(
    (module: MigrationModule, data: unknown[], count: number) => {
      updateModuleState(module, {
        existingInternalData: data,
        existingInternalTotal: count,
      });
    },
    [updateModuleState]
  );

  const resetData = useCallback((module: MigrationModule) => {
    setMigrationData((prev) => ({
      ...prev,
      [module]: { ...DEFAULT_MODULE_STATE },
    }));
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
  }, []);

  // Computed stats
  const stats = {
    totalExternal: Object.values(migrationData).reduce(
      (acc, v) => acc + (v?.externalTotal ?? 0),
      0
    ),
    totalSynced: Object.values(migrationData).reduce(
      (acc, v) =>
        acc + ((v?.internalData as unknown[] | undefined)?.length ?? 0),
      0
    ),
    totalNewRecords: Object.values(migrationData).reduce(
      (acc, v) => acc + (v?.newRecords ?? 0),
      0
    ),
    totalUpdates: Object.values(migrationData).reduce(
      (acc, v) => acc + (v?.updates ?? 0),
      0
    ),
    totalDuplicates: Object.values(migrationData).reduce(
      (acc, v) => acc + (v?.duplicates ?? 0),
      0
    ),
    modulesWithData: Object.values(migrationData).filter(
      (v) => v?.externalData && (v.externalData as unknown[]).length > 0
    ).length,
    completedModules: Object.values(migrationData).filter((v) => v?.completed)
      .length,
    runningModules: Object.values(migrationData).filter((v) => v?.loading)
      .length,
    pausedModules: Object.values(migrationData).filter((v) => v?.paused).length,
  };

  const hasData = stats.totalExternal > 0;

  return {
    config: {
      mode,
      legacyApiEndpoint,
      legacyApiKey,
      tuturuuuApiEndpoint,
      tuturuuuApiKey,
      sourceWorkspaceId,
      targetWorkspaceId,
      healthCheckMode,
    },
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
    skippedModules,
    toggleSkipModule,
    isModuleSkipped,
    skipAllModules,
    unskipAllModules,
    effectiveApiEndpoint,
    effectiveApiKey,
    sourceWorkspaceName,
    loadingSourceWorkspaceName,
    targetWorkspaceName,
    loadingTargetWorkspaceName,
    migrationData,
    loading,
    hasData,
    cancelRequested,
    setCancelRequested,
    pauseRequested,
    setPauseRequested,
    abortControllersRef,
    confirmDialog,
    setConfirmDialog,
    getModuleState,
    getData,
    getCount,
    getLoading,
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
    stats,
  };
}
