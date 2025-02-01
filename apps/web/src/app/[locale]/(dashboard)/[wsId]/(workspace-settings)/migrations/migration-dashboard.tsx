'use client';

import { ConfigurationPanel } from './components/ConfigurationPanel';
import { KeyboardHelp } from './components/KeyboardHelp';
import { MigrationHistory } from './components/MigrationHistory';
import { ModuleCard } from './components/ModuleCard';
import { ModuleSearch } from './components/ModuleSearch';
import { ModuleStats } from './components/ModuleStats';
import { MigrationModule, ModulePackage, generateModules } from './modules';
import { useKeyboardShortcuts } from './utils/keyboard';
import { logger } from './utils/logging';
import { rateLimiter } from './utils/rate-limiter';
import { sanitizeApiEndpoint, validateModuleData } from './utils/validation';
import { Button } from '@repo/ui/components/ui/button';
import { Separator } from '@repo/ui/components/ui/separator';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@repo/ui/components/ui/tooltip';
import { GitMerge, Play, RefreshCcw } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';

export default function MigrationDashboard() {
  const [config, setConfig] = useState<{
    apiEndpoint: string;
    apiKey: string;
    workspaceId: string;
    isValid: boolean;
  }>({
    apiEndpoint: '',
    apiKey: '',
    workspaceId: '',
    isValid: false,
  });

  const [migrationData, setMigrationData] = useState<{
    [key in MigrationModule]?: {
      externalData?: any[] | null;
      internalData?: any[] | null;
      externalTotal?: number | null;
      internalTotal?: number | null;
      loading?: boolean | null;
      error?: any | null;
    } | null;
  }>();

  // Generate modules once and memoize
  const allModules = useMemo(() => generateModules(), []);
  const [filteredModules, setFilteredModules] =
    useState<ModulePackage[]>(allModules);

  const loading = migrationData
    ? Object.values(migrationData).some((v) => v?.loading)
    : false;

  const handleMigrateAll = useCallback(async () => {
    for (const m of filteredModules) {
      if (!m?.disabled) {
        await handleMigrate(m);
      }
    }
  }, [filteredModules]);

  // Register keyboard shortcuts
  useKeyboardShortcuts([
    {
      key: 'r',
      description: 'Refresh all',
      action: () => {
        if (!loading && config.isValid) {
          handleMigrateAll();
        }
      },
    },
  ]);

  const fetchData = async (
    url: string,
    {
      onSuccess,
      onError,
    }: {
      onSuccess?: (data: any) => void;
      onError?: (error: any) => void;
    }
  ) => {
    try {
      // Check rate limit before making request
      await rateLimiter.checkRateLimit('external');

      const res = await fetch(url, {
        headers: {
          'Content-Type': 'application/json',
          'TTR-API-KEY': config.apiKey,
        },
      });

      const data = await res.json();

      if (!res.ok || data?.error) {
        onError?.(data);
        return;
      }

      onSuccess?.(data);
    } catch (error) {
      onError?.(error);
    }
  };

  const setLoading = (module: MigrationModule, loading: boolean) => {
    setMigrationData((prev) => ({
      ...prev,
      [module]: {
        ...prev?.[module],
        loading,
      },
    }));
  };

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

  const setData = (
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
  };

  const setError = (module: MigrationModule, error: any) => {
    setMigrationData((prev) => ({
      ...prev,
      [module]: {
        ...prev?.[module],
        error,
      },
    }));
  };

  const resetData = (module: MigrationModule) => {
    setData('external', module, null, 0);
    setData('internal', module, null, 0);
  };

  const handleMigrate = async ({
    module,
    externalPath,
    internalPath,
    externalAlias,
    internalAlias,
    mapping,
    skip,
  }: ModulePackage) => {
    const startTime = logger.startMigration(module);
    setLoading(module, true);
    resetData(module);

    try {
      const externalUrl = `${sanitizeApiEndpoint(config.apiEndpoint)}${externalPath}`;
      const chunkSize = 1000;

      // Initialize external variables
      let externalCount = -1;
      let externalData: any[] = [];
      let externalError: any = null;

      // Fetch external data
      while (
        externalError === null &&
        (externalData.length < externalCount || externalCount === -1)
      ) {
        await fetchData(
          `${externalUrl}?from=${externalData.length}&limit=${chunkSize}`.replace(
            /\?([^?]*)(\?)/g,
            '?$1&'
          ),
          {
            onSuccess: (newData) => {
              if (externalCount === -1) externalCount = newData.count;
              externalData = [
                ...externalData,
                ...newData?.[externalAlias ?? internalAlias ?? 'data'],
              ];
              setData('external', module, externalData, newData.count);

              if (externalData.length !== externalCount) return;
            },
            onError: async (error) => {
              setLoading(module, false);
              setError(module, error);
              externalError = error;
              logger.endMigration(module, startTime, false, 0, error);
              return;
            },
          }
        );

        await new Promise((resolve) => setTimeout(resolve, 200));
      }

      // Validate external data
      if (!validateModuleData(externalData)) {
        throw new Error('Invalid external data structure');
      }

      // Initialize internal variables
      let internalData: any[] = [];

      // Fetch internal data
      if (skip) {
        logger.log('info', module, 'Skipping migration');
      } else if (internalPath && config.workspaceId) {
        await new Promise((resolve) => setTimeout(resolve, 200));

        if (externalData?.length > 0) {
          for (let i = 0; i < externalData.length; i += chunkSize) {
            const chunkMax = Math.min(i + chunkSize, externalData.length);
            const chunk = externalData.slice(i, chunkMax);
            const newInternalData = mapping
              ? mapping(config.workspaceId, chunk)
              : chunk;

            try {
              await rateLimiter.checkRateLimit('internal');

              const res = await fetch(
                internalPath.replace('[wsId]', config.workspaceId),
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
                throw data;
              }

              internalData.push(...newInternalData);
              setData('internal', module, internalData, internalData.length);
            } catch (error) {
              throw error;
            } finally {
              await new Promise((resolve) => setTimeout(resolve, 200));
            }
          }
        } else {
          logger.log('info', module, 'No external data to migrate');
          setData('internal', module, internalData, 0);
        }
      }

      setLoading(module, false);
      logger.endMigration(
        module,
        startTime,
        true,
        internalData.length,
        undefined
      );
    } catch (error) {
      setLoading(module, false);
      setError(module, error);
      logger.endMigration(module, startTime, false, 0, error);
    }
  };

  const generateModuleComponents = () => {
    return (
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {filteredModules.map((m) => (
          <ModuleCard
            key={m.name}
            module={m}
            onMigrate={handleMigrate}
            externalCount={getCount('external', m.module)}
            internalCount={getCount('internal', m.module)}
            isLoading={getLoading(m.module)}
            error={migrationData?.[m.module]?.error}
            externalData={getData('external', m.module)}
            internalData={getData('internal', m.module)}
          />
        ))}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <ConfigurationPanel onConfigChange={setConfig} />

      <ModuleStats migrationData={migrationData} />

      <div className="flex h-full flex-col gap-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="flex items-center gap-1 text-2xl font-semibold">
              <div className="mr-1">Migrate data</div>
              {Object.values(migrationData ?? {}).reduce(
                (acc, v) => acc + (v?.externalTotal ?? 0),
                0
              ) !== 0 && (
                <div className="rounded border px-2 py-0.5 text-sm font-semibold">
                  {Object.values(migrationData ?? {}).reduce(
                    (acc, v) => acc + (v?.externalData?.length ?? 0),
                    0
                  )}
                  {' / '}
                  {Object.values(migrationData ?? {}).reduce(
                    (acc, v) => acc + (v?.externalTotal ?? 0),
                    0
                  )}
                </div>
              )}
            </h2>
            <p className="text-muted-foreground text-sm">
              Migrate data from external system to internal system
            </p>
          </div>

          <div className="flex items-center gap-2">
            <KeyboardHelp />

            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    data-migrate-button
                    onClick={handleMigrateAll}
                    variant="secondary"
                    size="icon"
                    disabled={loading || !config.isValid}
                  >
                    <GitMerge className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Migrate all modules (M)</TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    data-refresh-button
                    onClick={handleMigrateAll}
                    variant="secondary"
                    size="icon"
                    disabled={loading || !config.isValid}
                  >
                    {Object.values(migrationData ?? {}).filter(
                      (v) => v?.externalData
                    ).length ? (
                      <RefreshCcw
                        className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`}
                      />
                    ) : (
                      <Play className="h-4 w-4" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Refresh all modules (R)</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>

        <ModuleSearch
          modules={allModules}
          onFilterChange={setFilteredModules}
        />

        <Separator className="mb-2" />
        {generateModuleComponents()}
      </div>

      <MigrationHistory />
    </div>
  );
}
