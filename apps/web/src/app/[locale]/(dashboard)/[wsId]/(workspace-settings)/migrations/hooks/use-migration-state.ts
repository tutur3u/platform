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

interface MigrationConfig {
  apiEndpoint: string;
  apiKey: string;
  workspaceId: string;
  healthCheckMode: boolean;
}

interface MigrationStateReturn {
  // Config
  config: MigrationConfig;
  setApiEndpoint: (value: string) => void;
  setApiKey: (value: string) => void;
  setWorkspaceId: (value: string) => void;
  setHealthCheckMode: (value: boolean) => void;
  configComplete: boolean;

  // Workspace
  workspaceName: string | null;
  loadingWorkspaceName: boolean;

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

export function useMigrationState(): MigrationStateReturn {
  // Config with localStorage persistence
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
  const [healthCheckMode, setHealthCheckMode] = useLocalStorage({
    key: 'migration-health-check-mode',
    defaultValue: false,
  });

  // Workspace name
  const [workspaceName, setWorkspaceName] = useState<string | null>(null);
  const [loadingWorkspaceName, setLoadingWorkspaceName] = useState(false);

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
  const configComplete = !!(apiEndpoint && apiKey && workspaceId);
  const loading = Object.values(migrationData).some((v) => v?.loading);

  // Fetch workspace name when ID changes
  useEffect(() => {
    const fetchWorkspaceName = async (wsId: string) => {
      if (!wsId) {
        setWorkspaceName(null);
        setLoadingWorkspaceName(false);
        return;
      }

      setLoadingWorkspaceName(true);
      setWorkspaceName(null);

      try {
        const supabase = createClient();
        const { data, error } = await supabase
          .from('workspaces')
          .select('name')
          .eq('id', wsId)
          .single();

        if (error || !data) {
          setWorkspaceName('');
        } else {
          setWorkspaceName(data.name || '');
        }
      } catch {
        setWorkspaceName('');
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
    config: { apiEndpoint, apiKey, workspaceId, healthCheckMode },
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
