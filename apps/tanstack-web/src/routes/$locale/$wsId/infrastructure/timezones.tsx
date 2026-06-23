import { createFileRoute, redirect } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequestHeaders } from '@tanstack/react-start/server';
import {
  type BackendInfrastructureTimezone,
  type BackendInfrastructureTimezoneCreateRequest,
  type BackendInfrastructureTimezoneWriteRequest,
  createBackendInfrastructureTimezone,
  deleteBackendInfrastructureTimezone,
  getBackendInfrastructureTimezones,
  updateBackendInfrastructureTimezone,
  withForwardedBackendApiAuth,
} from '@tuturuuu/internal-api/backend';
import { InternalApiError } from '@tuturuuu/internal-api/client';
import type { Timezone } from '@tuturuuu/types/primitives/Timezone';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import bundledTimezones from '@tuturuuu/utils/timezones';
import { TimezonesClientPage } from '@/components/infrastructure/timezones/timezones-client-page';
import { withTanstackBackendRuntime } from '@/lib/cloudflare/backend';
import { requireCurrentUser } from '@/lib/platform/auth-gate';
import { createPageHead } from '@/lib/platform/head';
import { resolveMessagesLocale } from '@/lib/platform/messages';
import { resolveWorkspace } from '@/lib/platform/workspace';
import { hasWorkspacePermission } from '@/lib/platform/workspace-permission';

type TimezonesSearch = {
  page: number;
  pageSize: number;
  q: string;
};

type TimezonesData = {
  count: number;
  data: Timezone[];
  page: number;
  pageSize: number;
  q: string;
  workspaceId: string;
};

export type TimezonesActionResult =
  | {
      message: string;
      ok: true;
    }
  | {
      code?: string;
      message: string;
      ok: false;
      status?: number;
    };

function parsePositiveInteger(value: unknown, fallback: number, max?: number) {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number.parseInt(value, 10)
        : Number.NaN;

  if (!Number.isInteger(parsed) || parsed < 1) {
    return fallback;
  }

  return max ? Math.min(parsed, max) : parsed;
}

function validateTimezonesSearch(
  search: Record<string, unknown>
): TimezonesSearch {
  return {
    page: parsePositiveInteger(search.page, 1),
    pageSize: parsePositiveInteger(search.pageSize, 10, 100),
    q: typeof search.q === 'string' ? search.q : '',
  };
}

const loadServerTimezones = createServerFn({ method: 'GET' }).handler(
  async () => {
    const backendRuntime = await withTanstackBackendRuntime();

    return getBackendInfrastructureTimezones(
      withForwardedBackendApiAuth(getRequestHeaders(), backendRuntime)
    );
  }
);

const createTimezone = createServerFn({ method: 'POST' })
  .validator((data: BackendInfrastructureTimezoneCreateRequest) => data)
  .handler(async ({ data }): Promise<TimezonesActionResult> => {
    try {
      const backendRuntime = await withTanstackBackendRuntime();
      const response = await createBackendInfrastructureTimezone(
        data,
        withForwardedBackendApiAuth(getRequestHeaders(), backendRuntime)
      );

      return {
        message: response.message,
        ok: true,
      };
    } catch (error) {
      if (error instanceof InternalApiError) {
        return {
          code: error.code,
          message: error.message,
          ok: false,
          status: error.status,
        };
      }

      throw error;
    }
  });

const updateTimezone = createServerFn({ method: 'POST' })
  .validator(
    (data: {
      timezoneId: string;
      values: BackendInfrastructureTimezoneWriteRequest;
    }) => data
  )
  .handler(async ({ data }): Promise<TimezonesActionResult> => {
    try {
      const backendRuntime = await withTanstackBackendRuntime();
      const response = await updateBackendInfrastructureTimezone(
        data.timezoneId,
        data.values,
        withForwardedBackendApiAuth(getRequestHeaders(), backendRuntime)
      );

      return {
        message: response.message,
        ok: true,
      };
    } catch (error) {
      if (error instanceof InternalApiError) {
        return {
          code: error.code,
          message: error.message,
          ok: false,
          status: error.status,
        };
      }

      throw error;
    }
  });

const deleteTimezone = createServerFn({ method: 'POST' })
  .validator((data: { timezoneId: string }) => data)
  .handler(async ({ data }): Promise<TimezonesActionResult> => {
    try {
      const backendRuntime = await withTanstackBackendRuntime();
      const response = await deleteBackendInfrastructureTimezone(
        data.timezoneId,
        withForwardedBackendApiAuth(getRequestHeaders(), backendRuntime)
      );

      return {
        message: response.message,
        ok: true,
      };
    } catch (error) {
      if (error instanceof InternalApiError) {
        return {
          code: error.code,
          message: error.message,
          ok: false,
          status: error.status,
        };
      }

      throw error;
    }
  });

function redirectToWorkspaceSettings(locale: string, wsId: string): never {
  throw redirect({
    href: `/${locale}/${wsId}/settings`,
    statusCode: 307,
  });
}

function persistedTimezoneRows(
  rows: BackendInfrastructureTimezone[]
): Timezone[] {
  return rows.map((row) => ({
    ...row,
    status: 'synced' as const,
  }));
}

function filterBundledTimezones(q: string) {
  const localTimezones = bundledTimezones as Timezone[];

  if (!q) {
    return localTimezones;
  }

  const normalizedQuery = q.toLowerCase();

  return localTimezones.filter(
    (timezone) =>
      timezone.value.toLowerCase().includes(normalizedQuery) ||
      timezone.abbr.toLowerCase().includes(normalizedQuery) ||
      timezone.text.toLowerCase().includes(normalizedQuery)
  );
}

function mergeTimezoneRows(localData: Timezone[], serverData: Timezone[]) {
  const serverByValue = new Map(
    serverData.map((timezone) => [timezone.value, timezone])
  );

  return localData.map((timezone) => {
    const serverRow = serverByValue.get(timezone.value);

    if (serverRow) {
      return {
        ...serverRow,
        ...timezone,
        status: 'synced' as const,
      };
    }

    return {
      ...timezone,
      status: 'outdated' as const,
    };
  });
}

async function loadTimezonesData({
  page,
  pageSize,
  q,
}: TimezonesSearch): Promise<Pick<TimezonesData, 'count' | 'data'>> {
  const filteredTimezones = filterBundledTimezones(q);
  const count = filteredTimezones.length;
  const start = (page - 1) * pageSize;
  const end = page * pageSize;
  const localData = filteredTimezones.slice(start, end);
  const serverData = persistedTimezoneRows(await loadServerTimezones());

  return {
    count,
    data: mergeTimezoneRows(localData, serverData),
  };
}

export const Route = createFileRoute('/$locale/$wsId/infrastructure/timezones')(
  {
    component: TimezonesRoutePage,
    validateSearch: validateTimezonesSearch,
    loaderDeps: ({ search }) => ({
      page: search.page,
      pageSize: search.pageSize,
      q: search.q,
    }),
    head: ({ params }) => {
      const locale = resolveMessagesLocale(params.locale);

      return createPageHead({
        description: 'Manage infrastructure timezones.',
        locale,
        title: 'Timezones',
      });
    },
    loader: async ({ params, deps }): Promise<TimezonesData> => {
      await requireCurrentUser({
        locale: params.locale,
        nextPath: `/${params.wsId}/infrastructure/timezones`,
      });

      const workspace = await resolveWorkspace({ data: { wsId: params.wsId } });
      if (!workspace.exists) {
        redirectToWorkspaceSettings(params.locale, params.wsId);
      }

      if (workspace.workspaceId !== ROOT_WORKSPACE_ID) {
        redirectToWorkspaceSettings(params.locale, params.wsId);
      }

      const canManageWorkspaceRoles = await hasWorkspacePermission({
        data: {
          permission: 'manage_workspace_roles',
          wsId: ROOT_WORKSPACE_ID,
        },
      });
      if (!canManageWorkspaceRoles) {
        redirectToWorkspaceSettings(params.locale, params.wsId);
      }

      const result = await loadTimezonesData(deps);

      return {
        count: result.count,
        data: result.data,
        page: deps.page,
        pageSize: deps.pageSize,
        q: deps.q,
        workspaceId: workspace.workspaceId,
      };
    },
  }
);

function TimezonesRoutePage() {
  const data = Route.useLoaderData() as TimezonesData;

  return (
    <TimezonesClientPage
      count={data.count}
      createTimezone={(values) => createTimezone({ data: values })}
      data={data.data}
      deleteTimezone={(timezoneId) => deleteTimezone({ data: { timezoneId } })}
      page={data.page}
      pageSize={data.pageSize}
      q={data.q}
      updateTimezone={(timezoneId, values) =>
        updateTimezone({
          data: {
            timezoneId,
            values,
          },
        })
      }
      workspaceId={data.workspaceId}
    />
  );
}
