'use client';

import { useState } from 'react';
import {
  ActionIcon,
  Button,
  Divider,
  PasswordInput,
  Progress,
  Tooltip,
} from '@mantine/core';
import { ArrowPathIcon, PlayIcon } from '@heroicons/react/24/solid';
import { DEV_MODE } from '../../../../../constants/common';
import { useLocalStorage } from '@mantine/hooks';
import { IconGitMerge } from '@tabler/icons-react';

export default function PlatformMigrationsPage() {
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

  type MigrationModule =
    | 'users'
    | 'user-linked-coupons'
    | 'roles'
    | 'classes'
    | 'class-members'
    | 'class-score-names'
    | 'class-user-scores'
    | 'class-user-feedbacks'
    | 'class-user-attendances'
    | 'class-lessons'
    | 'class-linked-packages'
    | 'packages'
    | 'package-categories'
    | 'payment-methods'
    | 'coupons'
    | 'bills'
    | 'bill-packages'
    | 'bill-coupons';

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

  if (!DEV_MODE) return null;

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

  const handleMigrate = async ({
    module,
    externalPath,
    internalPath,
    externalAlias,
    internalAlias,
    mapping,
  }: ModulePackage) => {
    setLoading(module, true);

    const externalUrl = `${apiEndpoint}${externalPath}`;
    const limit = 1000;

    // Reset module data
    setData('external', module, null, 0);
    setData('internal', module, null, 0);

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
        `${externalUrl}?from=${externalData.length}&limit=${limit}`,
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
    if (internalPath && workspaceId) {
      while (
        internalError === null &&
        internalData.length < externalData.length
      ) {
        const newInternalData = mapping ? mapping(externalData) : externalData;
        const res = await fetch(internalPath.replace('[wsId]', workspaceId), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            [internalAlias ?? externalAlias ?? 'data']: newInternalData,
          }),
        });

        const data = await res.json();

        if (!res.ok) {
          setLoading(module, false);
          setError(module, data);
          internalError = data?.error;
          return;
        }

        internalData = [...internalData, ...newInternalData];
        setData('internal', module, internalData, internalData.length);

        // wait 200ms
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    }

    setLoading(module, false);
  };

  interface ModulePackage {
    name: string;
    module: MigrationModule;
    externalAlias?: string;
    internalAlias?: string;
    externalPath: string;
    internalPath?: string;
    mapping?: (data: any[]) => any[];
    disabled?: boolean;
  }

  const generateModule = ({
    name,
    module,
    externalAlias,
    internalAlias,
    externalPath,
    internalPath,
    mapping,
    disabled,
  }: ModulePackage) => {
    return (
      <div
        key={name}
        className="rounded border p-4 dark:border-zinc-300/10 dark:bg-zinc-900"
      >
        <div className="flex items-center justify-between gap-2">
          <div className="font-semibold">{name}</div>

          <div className="flex gap-1">
            {getData('external', module) ? (
              <Tooltip label="Total external items">
                <div className="flex items-center justify-center rounded border border-blue-500/10 bg-blue-500/10 px-2 text-center text-sm font-semibold text-blue-600 dark:border-blue-300/10 dark:bg-blue-300/10 dark:text-blue-300">
                  {getCount('external', module)}
                </div>
              </Tooltip>
            ) : null}

            <Tooltip label="Migrate data">
              <ActionIcon
                variant="subtle"
                color="grape"
                className={
                  disabled
                    ? ''
                    : 'border border-purple-600/10 bg-purple-600/10 hover:bg-purple-600/20 dark:border-purple-300/10 dark:bg-purple-300/10 dark:hover:bg-purple-300/20'
                }
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
                loading={getLoading(module)}
                disabled={disabled}
              >
                <IconGitMerge className="h-4 w-4" />
              </ActionIcon>
            </Tooltip>

            <Tooltip
              label={
                getData('external', module) ? 'Refresh data' : 'Fetch data'
              }
            >
              <ActionIcon
                variant="subtle"
                color="green"
                className={
                  disabled
                    ? ''
                    : 'border border-green-600/10 bg-green-600/10 hover:bg-green-600/20 dark:border-green-300/10 dark:bg-green-300/10 dark:hover:bg-green-300/20'
                }
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
                loading={getLoading(module)}
                disabled={disabled}
              >
                {getData('external', module) ? (
                  <ArrowPathIcon className="h-4 w-4" />
                ) : (
                  <PlayIcon className="h-4 w-4" />
                )}
              </ActionIcon>
            </Tooltip>
          </div>
        </div>

        {disabled || (
          <>
            <Divider className="my-2" />

            <div className="grid gap-2">
              <div className="grid gap-1">
                External Data
                <Progress
                  sections={[
                    {
                      value: getData('external', module)
                        ? ((getData('external', module)?.length ?? 0) /
                            getCount('external', module)) *
                          100
                        : 0,
                      color:
                        getData('external', module)?.length ===
                        getCount('external', module)
                          ? 'teal'
                          : 'blue',
                      tooltip: getData('external', module)
                        ? `Fetched (${
                            getData('external', module)?.length ?? 0
                          }/${getCount('external', module)})`
                        : 'Loading',
                    },
                  ]}
                  size="lg"
                />
              </div>

              <div className="grid gap-1">
                Synchronized
                <Progress
                  sections={[
                    {
                      value:
                        ((getData('external', module) ?? []).filter((v) =>
                          (getData('internal', module) ?? []).find(
                            (iv) => iv.id === v.id
                          )
                        ).length /
                          (getData('external', module)?.length ?? 0)) *
                        100,
                      color: 'teal',
                      tooltip: `Synchronized (${
                        (getData('external', module) ?? []).filter((v) =>
                          (getData('internal', module) ?? []).find(
                            (iv) => iv.id === v.id
                          )
                        ).length
                      }/${getData('external', module)?.length ?? 0})`,
                    },
                  ]}
                  size="lg"
                />
              </div>

              <Divider className="mt-2" />

              <Button
                variant="light"
                className="bg-blue-500/10 hover:bg-blue-500/20 dark:bg-blue-300/10 dark:hover:bg-blue-300/20"
              >
                View data
              </Button>
            </div>
          </>
        )}
      </div>
    );
  };

  const modules: ModulePackage[] = [
    {
      name: 'Virtual Users',
      module: 'users',
      externalAlias: 'users',
      externalPath: '/dashboard/data/users',
      internalPath: '/api/workspaces/[wsId]/migrate/users',
      mapping: (items) =>
        items.map((i) => ({
          id: i?.id,
          email: i?.email,
          name: i?.display_name,
          phone: i?.phone_number,
          gender: i?.gender,
          birthday: i?.birthday,
          created_at: i?.created_at,
          note: `${i?.nickname ? `Nickname: ${i.nickname}\n` : ''}${
            i?.relationship ? `Relationship: ${i.relationship}\n` : ''
          }${i?.notes ? `Notes: ${i.notes}\n` : ''}`,
        })),
    },
    {
      name: 'User Groups (Roles + Classes)',
      module: 'roles',
      externalAlias: 'roles',
      internalAlias: 'groups',
      externalPath: '/dashboard/data/users/roles',
      internalPath: '/api/workspaces/[wsId]/migrate/users/groups',
      mapping: (items) =>
        items.map((i) => ({
          id: i?.id,
          name: i?.name,
          created_at: i?.created_at,
        })),
    },
    {
      name: 'User Group Members',
      module: 'class-members',
      externalAlias: 'members',
      externalPath: '/migrate/members',
      internalPath: '/api/workspaces/[wsId]/migrate/users/groups/members',
      mapping: (items) =>
        items.map((i) => ({
          user_id: i?.user_id,
          group_id: i?.class_id,
          created_at: i?.created_at,
        })),
    },
    {
      name: 'User Group Indicator Groups',
      module: 'class-score-names',
      externalAlias: 'names',
      externalPath: '/dashboard/data/classes/score-names',
    },
    {
      name: 'User Group Indicators',
      module: 'class-user-scores',
      externalAlias: 'scores',
      externalPath: '/dashboard/data/classes/scores',
    },
    {
      name: 'User Group Feedbacks',
      module: 'class-user-feedbacks',
      externalAlias: 'feedbacks',
      externalPath: '/dashboard/data/classes/feedbacks',
    },
    {
      name: 'User Group Attendances',
      module: 'class-user-attendances',
      externalAlias: 'attendance',
      externalPath: '/dashboard/data/classes/attendance',
    },
    {
      name: 'User Group Content',
      module: 'class-lessons',
      externalAlias: 'lessons',
      externalPath: '/dashboard/data/classes/lessons',
    },
    {
      name: 'User Group Linked Products',
      module: 'class-linked-packages',
      externalAlias: 'packages',
      externalPath: '/dashboard/data/classes/packages',
    },
    {
      name: 'Products',
      module: 'packages',
      externalAlias: 'packages',
      externalPath: '/dashboard/data/packages',
    },
    {
      name: 'Product Categories',
      module: 'package-categories',
      externalAlias: 'categories',
      externalPath: '/dashboard/data/packages/categories',
    },
    {
      name: 'Wallets',
      module: 'payment-methods',
      externalAlias: 'methods',
      externalPath: '/dashboard/data/payment-methods',
    },
    {
      name: 'Invoices',
      module: 'bills',
      externalAlias: 'bills',
      externalPath: '/dashboard/data/bills',
    },
    {
      name: 'Invoice Products',
      module: 'bill-packages',
      externalAlias: 'packages',
      externalPath: '/dashboard/data/bills/packages',
    },
    {
      name: 'Promotions',
      module: 'coupons',
      externalAlias: 'coupons',
      externalPath: '/dashboard/data/coupons',
    },
    {
      name: 'Virtual Users Linked Promotions',
      module: 'user-linked-coupons',
      externalAlias: 'coupons',
      externalPath: '/dashboard/data/users/coupons',
    },
    {
      name: 'Invoice Promotions',
      module: 'bill-coupons',
      externalAlias: 'coupons',
      externalPath: '/dashboard/data/bills/coupons',
    },
  ];

  const generateModules = () => {
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
    <div className="flex flex-col gap-4 ">
      <div className="flex h-full flex-col gap-2">
        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
          <PasswordInput
            label="API endpoint"
            placeholder="https://tuturuuu.com/api/v1"
            value={apiEndpoint}
            onChange={(e) => setApiEndpoint(e.currentTarget.value)}
          />
          <PasswordInput
            label="API key"
            placeholder="API key"
            value={apiKey}
            onChange={(e) => setApiKey(e.currentTarget.value)}
          />
          <PasswordInput
            label="Workspace ID"
            placeholder="Workspace ID"
            value={workspaceId}
            onChange={(e) => setWorkspaceId(e.currentTarget.value)}
            className="col-span-full xl:col-span-1"
          />
        </div>

        <h2 className="mt-4 flex items-center gap-1 text-2xl font-semibold text-blue-500 dark:text-blue-300">
          <div className="mr-1">Migrate data</div>
          {Object.values(migrationData ?? {}).reduce(
            (acc, v) => acc + (v?.externalTotal ?? 0),
            0
          ) !== 0 && (
            <div className="rounded border border-blue-500/10 bg-blue-500/10 px-1 py-0.5 text-sm text-blue-600 dark:border-blue-300/10 dark:bg-blue-300/10 dark:text-blue-300">
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

          <ActionIcon
            variant="subtle"
            color="grape"
            className="border border-purple-600/10 bg-purple-600/10 hover:bg-purple-600/20 dark:border-purple-300/10 dark:bg-purple-300/10 dark:hover:bg-purple-300/20"
            onClick={handleMigrateAll}
            loading={loading}
          >
            <IconGitMerge className="h-4 w-4" />
          </ActionIcon>

          <ActionIcon
            variant="subtle"
            color="green"
            className="border border-green-600/10 bg-green-600/10 hover:bg-green-600/20 dark:border-green-300/10 dark:bg-green-300/10 dark:hover:bg-green-300/20"
            onClick={handleMigrateAll}
            loading={loading}
          >
            {Object.values(migrationData ?? {}).filter((v) => v?.externalData)
              .length ? (
              <ArrowPathIcon className="h-4 w-4" />
            ) : (
              <PlayIcon className="h-4 w-4" />
            )}
          </ActionIcon>
        </h2>

        <Divider className="mb-2" />
        {generateModules()}
      </div>
    </div>
  );
}
