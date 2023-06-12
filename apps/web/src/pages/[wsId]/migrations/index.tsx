import React, { ReactElement, useEffect, useState } from 'react';
import NestedLayout from '../../../components/layouts/NestedLayout';
import { useSegments } from '../../../hooks/useSegments';
import { ActionIcon, Divider, PasswordInput, Progress } from '@mantine/core';
import { enforceRootWorkspace } from '../../../utils/serverless/enforce-root-workspace';
import { useWorkspaces } from '../../../hooks/useWorkspaces';
import useTranslation from 'next-translate/useTranslation';
import { ArrowPathIcon, PlayIcon } from '@heroicons/react/24/solid';
import { DEV_MODE } from '../../../constants/common';
import { Segment } from '../../../types/primitives/Segment';
import { useLocalStorage } from '@mantine/hooks';

export const getServerSideProps = enforceRootWorkspace;

const WorkspaceAIPlaygroundPage = () => {
  const { t } = useTranslation('sidebar-tabs');
  const { ws } = useWorkspaces();
  const { setRootSegment } = useSegments();

  const aiLabel = t('migrations');

  useEffect(() => {
    setRootSegment(
      ws
        ? ([
            {
              content: ws?.name || 'Tổ chức không tên',
              href: `/${ws.id}`,
            },
            DEV_MODE
              ? { content: aiLabel, href: `/${ws.id}/migrations` }
              : undefined,
          ].filter((v) => v) as Segment[])
        : []
    );

    return () => setRootSegment([]);
  }, [aiLabel, ws, setRootSegment]);

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
    | 'user-linked-packages'
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
    | 'bills';

  const [migrationData, setMigrationData] = useState<{
    [key in MigrationModule]?: {
      data?: any | null;
      count?: number | null;
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
      // may have CORS issue
      headers: {
        'Content-Type': 'application/json',
        'TTR-API-KEY': apiKey,
      },
    });

    const data = await res.json();

    if (!res.ok) {
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

  const getCount = (module: MigrationModule) => {
    return migrationData?.[module]?.count ?? 0;
  };

  const getData = (module: MigrationModule) => {
    return migrationData?.[module]?.data ?? null;
  };

  const setData = (module: MigrationModule, data: any, alias?: string) => {
    setMigrationData((prev) => ({
      ...prev,
      [module]: {
        ...prev?.[module],
        data: data?.[alias || 'data'],
        count: data?.count,
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

  const handleMigrate = async (
    module: MigrationModule,
    path: string,
    alias?: string
  ) => {
    setLoading(module, true);

    const url = `${apiEndpoint}${path}`;
    await fetchData(url, {
      onSuccess: (data) => setData(module, data, alias),
      onError: (error) => setError(module, error),
    });

    setLoading(module, false);
  };

  interface ModulePackage {
    name: string;
    alias?: string;
    module: MigrationModule;
    path: string;
    functional?: boolean;
  }

  const generateModule = ({
    name,
    module,
    path,
    alias,
    functional,
  }: ModulePackage) => {
    return (
      <div className="rounded border p-4 dark:border-zinc-300/10 dark:bg-zinc-900">
        <div className="flex items-center justify-between gap-2">
          <div className="font-semibold">{name}</div>

          <div className="flex gap-1">
            {getData(module) ? (
              <div className="flex items-center justify-center rounded border border-purple-500/10 bg-purple-500/10 px-2 text-center text-sm font-semibold text-purple-600 dark:border-purple-300/10 dark:bg-purple-300/10 dark:text-purple-300">
                {getCount(module)}
              </div>
            ) : null}
            <ActionIcon
              variant="subtle"
              color="green"
              className={
                functional
                  ? 'border border-green-600/10 bg-green-600/10 hover:bg-green-600/20 dark:border-green-300/10 dark:bg-green-300/10 dark:hover:bg-green-300/20'
                  : ''
              }
              onClick={() => handleMigrate(module, path, alias)}
              loading={getLoading(module)}
              disabled={!functional}
            >
              {getData(module) ? (
                <ArrowPathIcon className="h-4 w-4" />
              ) : (
                <PlayIcon className="h-4 w-4" />
              )}
            </ActionIcon>
          </div>
        </div>

        {functional && (
          <>
            <Divider className="my-2" />

            <div className="grid gap-2">
              <div className="grid gap-1">
                External Data
                <Progress
                  color="cyan"
                  sections={[
                    {
                      value: getData(module)
                        ? (getData(module).length / getCount(module)) * 100
                        : 0,
                      color: 'cyan',
                      tooltip: getData(module)
                        ? `${getData(module).length} / ${getCount(module)}`
                        : '0 / 0',
                    },
                  ]}
                  size="lg"
                />
              </div>

              <div className="grid gap-1">
                Synchronized
                <Progress
                  color="green"
                  sections={[
                    {
                      value: 0,
                      color: 'pink',
                      tooltip: 'Synchronized',
                    },
                  ]}
                  size="lg"
                />
              </div>
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
      alias: 'users',
      path: '/dashboard/data/users',
      functional: true,
    },
    {
      name: 'Virtual Users Linked Products',
      module: 'user-linked-packages',
      path: '/dashboard/data/users/packages',
    },
    {
      name: 'User Groups',
      module: 'classes',
      alias: 'classes',
      path: '/dashboard/data/classes',
      functional: true,
    },
    {
      name: 'User Group Members',
      module: 'class-members',
      alias: 'members',
      path: '/dashboard/data/classes/members',
      functional: true,
    },
    {
      name: 'User Group Vital Categories',
      module: 'class-score-names',
      path: '/dashboard/data/classes/score-names',
    },
    {
      name: 'User Group Vitals',
      module: 'class-user-scores',
      path: '/dashboard/data/classes/scores',
    },
    {
      name: 'User Group Feedbacks',
      module: 'class-user-feedbacks',
      alias: 'feedbacks',
      path: '/dashboard/data/classes/feedbacks',
      functional: true,
    },
    {
      name: 'User Group Attendances',
      module: 'class-user-attendances',
      path: '/dashboard/data/classes/attendances',
    },
    {
      name: 'User Group Content',
      module: 'class-lessons',
      path: '/dashboard/data/classes/lessons',
    },
    {
      name: 'User Group Linked Products',
      module: 'class-linked-packages',
      alias: 'packages',
      path: '/dashboard/data/classes/packages',
      functional: true,
    },
    {
      name: 'Products',
      module: 'packages',
      alias: 'packages',
      path: '/dashboard/data/packages',
      functional: true,
    },
    {
      name: 'Product categories',
      module: 'package-categories',
      alias: 'categories',
      path: '/dashboard/data/packages/categories',
      functional: true,
    },
    {
      name: 'Wallets',
      module: 'payment-methods',
      alias: 'methods',
      path: '/dashboard/data/payment-methods',
      functional: true,
    },
    {
      name: 'Promotions',
      module: 'coupons',
      alias: 'coupons',
      path: '/dashboard/data/coupons',
      functional: true,
    },
    {
      name: 'Invoices',
      module: 'bills',
      alias: 'bills',
      path: '/dashboard/data/bills',
      functional: true,
    },
  ];

  const generateModules = () => {
    return (
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {modules
          .sort((a, b) => (a.functional ? -1 : 1) - (b.functional ? -1 : 1))
          .map((m) => generateModule(m))}
      </div>
    );
  };

  const handleMigrateAll = async () => {
    for (const m of modules)
      if (m.functional) await handleMigrate(m.module, m.path, m.alias);
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

        <h2 className="mt-4 flex items-center gap-2 text-2xl font-semibold text-blue-500 dark:text-blue-300">
          <div>Migrate data</div>
          {Object.values(migrationData ?? {}).reduce(
            (acc, v) => acc + (v?.count ?? 0),
            0
          ) !== 0 && (
            <div className="rounded border border-blue-500/10 bg-blue-500/10 px-1 py-0.5 text-sm text-blue-600 dark:border-blue-300/10 dark:bg-blue-300/10 dark:text-blue-300">
              {Object.values(migrationData ?? {}).reduce(
                (acc, v) => acc + (v?.data?.length ?? 0),
                0
              )}
              {' / '}
              {Object.values(migrationData ?? {}).reduce(
                (acc, v) => acc + (v?.count ?? 0),
                0
              )}
            </div>
          )}
          <ActionIcon
            variant="subtle"
            color="green"
            className="border border-green-600/10 bg-green-600/10 hover:bg-green-600/20 dark:border-green-300/10 dark:bg-green-300/10 dark:hover:bg-green-300/20"
            onClick={handleMigrateAll}
            loading={loading}
          >
            {Object.values(migrationData ?? {}).filter((v) => v?.data)
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
};

WorkspaceAIPlaygroundPage.getLayout = function getLayout(page: ReactElement) {
  return <NestedLayout noTabs>{page}</NestedLayout>;
};

export default WorkspaceAIPlaygroundPage;
