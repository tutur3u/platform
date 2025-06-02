'use client';

import { MigrationModule, ModulePackage, generateModules } from './modules';
import { useLocalStorage } from '@mantine/hooks';
import { Button } from '@tuturuuu/ui/button';
import { Card } from '@tuturuuu/ui/card';
import { GitMerge, Play, RefreshCcw } from '@tuturuuu/ui/icons';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { Progress } from '@tuturuuu/ui/progress';
import { Separator } from '@tuturuuu/ui/separator';
import { useState } from 'react';

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

  const loading = migrationData
    ? Object.values(migrationData).some((v) => v?.loading)
    : false;

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
    const res = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        'TTR-API-KEY': apiKey,
      },
    });

    const data = await res.json();

    if (!res.ok || data?.error) {
      onError?.(data);
      return;
    }

    onSuccess?.(data);
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
    setLoading(module, true);
    resetData(module);

    const externalUrl = `${apiEndpoint}${externalPath}`;
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
        `${externalUrl}?from=${externalData.length}&limit=${chunkSize}`
          // if there are 2 or more '?' in url, replace the second and next ones with '&'
          .replace(/\?([^?]*)(\?)/g, '?$1&'),
        {
          onSuccess: (newData) => {
            if (externalCount === -1) externalCount = newData.count;
            externalData = [
              ...externalData,
              ...newData?.[externalAlias ?? internalAlias ?? 'data'],
            ];
            setData('external', module, externalData, newData.count);

            // If count does not match, stop fetching
            if (externalData.length !== externalCount) return;
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

    // Initialize internal variables
    let internalData: any[] = [];
    let internalError: any = null;

    // Fetch internal data
    if (skip) {
      console.log('Skipping migration for', module);
    } else if (internalPath && workspaceId) {
      await new Promise((resolve) => setTimeout(resolve, 200));

      if (externalData !== null && externalData.length > 0) {
        for (let i = 0; i < externalData.length; i += chunkSize) {
          if (internalError !== null) break;

          const chunkMax = Math.min(i + chunkSize, externalData.length);
          const chunk = externalData.slice(i, chunkMax);

          const newInternalData = mapping ? mapping(workspaceId, chunk) : chunk;

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

    setLoading(module, false);
  };

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
    return (
      <Card key={name} className="p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="font-semibold">{name}</div>

          <div className="flex gap-1">
            {getData('external', module) !== null ? (
              <div className="flex items-center justify-center rounded border px-2 py-0.5 text-sm font-semibold">
                {getCount('external', module)}
              </div>
            ) : null}

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
              variant="secondary"
              size="icon"
              disabled={disabled || getLoading(module)}
            >
              <GitMerge className="h-4 w-4" />
            </Button>

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
              variant="secondary"
              size="icon"
              disabled={disabled || getLoading(module)}
            >
              {getData('external', module) ? (
                <RefreshCcw className="h-4 w-4" />
              ) : (
                <Play className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>

        {disabled || (
          <>
            <Separator className="my-2" />

            <div className="grid gap-2">
              <div className="grid gap-1">
                External
                <Progress
                  value={
                    getData('external', module) !== null
                      ? getData('external', module)?.length === 0
                        ? 100
                        : ((getData('external', module)?.length ?? 0) /
                            getCount('external', module)) *
                          100
                      : 0
                  }
                />
              </div>

              <div className="mb-2 grid gap-1">
                Synchronized
                <Progress
                  value={
                    getData('external', module) !== null
                      ? getData('external', module)?.length ===
                        getData('internal', module)?.length
                        ? 100
                        : skip
                          ? 100
                          : ((getData('external', module) ?? []).filter((v) =>
                              (getData('internal', module) ?? []).find(
                                (iv) => iv.id === v.id || iv._id === v.id
                              )
                            ).length /
                              (getData('external', module)?.length ?? 0)) *
                            100
                      : 0
                  }
                />
              </div>

              {/* <Button variant="outline" disabled>
                View data
              </Button> */}
            </div>
          </>
        )}
      </Card>
    );
  };

  const modules = generateModules();

  const generateModuleComponents = () => {
    return (
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {modules.map((m) => generateModule(m))}
      </div>
    );
  };

  const handleMigrateAll = async () => {
    for (const m of modules) if (!m?.disabled) await handleMigrate(m);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex h-full flex-col gap-2">
        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
          <div className="grid w-full items-center gap-1.5">
            <Label>API endpoint</Label>
            <Input
              placeholder="https://tuturuuu.com/api/v1"
              value={apiEndpoint}
              onChange={(e) => setApiEndpoint(e.currentTarget.value)}
            />
          </div>

          <div className="grid w-full items-center gap-1.5">
            <Label>API key</Label>
            <Input
              placeholder="API key"
              value={apiKey}
              onChange={(e) => setApiKey(e.currentTarget.value)}
            />
          </div>

          <div className="grid w-full items-center gap-1.5">
            <Label>Workspace ID</Label>
            <Input
              placeholder="Workspace ID"
              value={workspaceId}
              onChange={(e) => setWorkspaceId(e.currentTarget.value)}
              className="col-span-full xl:col-span-1"
            />
          </div>
        </div>

        <h2 className="mt-4 flex items-center gap-1 text-2xl font-semibold">
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

          <Button
            onClick={handleMigrateAll}
            variant="secondary"
            size="icon"
            disabled={loading}
          >
            <GitMerge className="h-4 w-4" />
          </Button>

          <Button
            onClick={handleMigrateAll}
            variant="secondary"
            size="icon"
            disabled={loading}
          >
            {Object.values(migrationData ?? {}).filter((v) => v?.externalData)
              .length ? (
              <RefreshCcw className="h-4 w-4" />
            ) : (
              <Play className="h-4 w-4" />
            )}
          </Button>
        </h2>

        <Separator className="mb-2" />
        {generateModuleComponents()}
      </div>
    </div>
  );
}
