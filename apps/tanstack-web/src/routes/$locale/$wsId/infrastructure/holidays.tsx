import { createFileRoute, redirect } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequestHeaders } from '@tanstack/react-start/server';
import {
  type BackendInternalHolidayBulkImportRequest,
  type BackendInternalHolidayCreateRequest,
  type BackendInternalHolidayUpdateRequest,
  bulkImportBackendInternalHolidays,
  createBackendInternalHoliday,
  deleteBackendInternalHoliday,
  getBackendInternalHolidays,
  updateBackendInternalHoliday,
  withForwardedBackendApiAuth,
} from '@tuturuuu/internal-api/backend';
import { InternalApiError } from '@tuturuuu/internal-api/client';
import type { VietnameseHoliday } from '@tuturuuu/types';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import {
  type HolidaysActionResult,
  HolidaysClientPage,
} from '@/components/infrastructure/holidays/holidays-client-page';
import { withTanstackBackendRuntime } from '@/lib/cloudflare/backend';
import { requireCurrentUser } from '@/lib/platform/auth-gate';
import { createPageHead } from '@/lib/platform/head';
import { resolveMessagesLocale } from '@/lib/platform/messages';
import { resolveWorkspace } from '@/lib/platform/workspace';
import { hasWorkspacePermission } from '@/lib/platform/workspace-permission';

type HolidaysSearch = {
  year: string;
};

type HolidaysData = {
  currentYear: number;
  holidays: VietnameseHoliday[];
  selectedYear: string;
  workspaceId: string;
};

function currentCalendarYear() {
  return new Date().getFullYear();
}

function validateHolidayYear(value: unknown, fallback: number) {
  if (value === 'all') {
    return 'all';
  }

  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number.parseInt(value, 10)
        : Number.NaN;

  if (!Number.isInteger(parsed) || parsed < 1900 || parsed > 9999) {
    return String(fallback);
  }

  return String(parsed);
}

function validateHolidaysSearch(
  search: Record<string, unknown>
): HolidaysSearch {
  const currentYear = currentCalendarYear();

  return {
    year: validateHolidayYear(search.year, currentYear),
  };
}

const loadServerHolidays = createServerFn({ method: 'GET' })
  .validator((data: { year: string }) => data)
  .handler(async ({ data }): Promise<VietnameseHoliday[]> => {
    const backendRuntime = await withTanstackBackendRuntime();

    return getBackendInternalHolidays(
      data.year === 'all' ? {} : { year: data.year },
      withForwardedBackendApiAuth(getRequestHeaders(), backendRuntime)
    );
  });

function toHolidayActionError(error: InternalApiError): HolidaysActionResult {
  return {
    code: error.code,
    message: error.message,
    ok: false,
    status: error.status,
  };
}

const createHoliday = createServerFn({ method: 'POST' })
  .validator((data: BackendInternalHolidayCreateRequest) => data)
  .handler(async ({ data }): Promise<HolidaysActionResult> => {
    try {
      await createBackendInternalHoliday(
        data,
        withForwardedBackendApiAuth(
          getRequestHeaders(),
          await withTanstackBackendRuntime()
        )
      );

      return {
        ok: true,
      };
    } catch (error) {
      if (error instanceof InternalApiError) {
        return toHolidayActionError(error);
      }

      throw error;
    }
  });

const updateHoliday = createServerFn({ method: 'POST' })
  .validator(
    (data: {
      holidayId: string;
      values: BackendInternalHolidayUpdateRequest;
    }) => data
  )
  .handler(async ({ data }): Promise<HolidaysActionResult> => {
    try {
      await updateBackendInternalHoliday(
        data.holidayId,
        data.values,
        withForwardedBackendApiAuth(
          getRequestHeaders(),
          await withTanstackBackendRuntime()
        )
      );

      return {
        ok: true,
      };
    } catch (error) {
      if (error instanceof InternalApiError) {
        return toHolidayActionError(error);
      }

      throw error;
    }
  });

const deleteHoliday = createServerFn({ method: 'POST' })
  .validator((data: { holidayId: string }) => data)
  .handler(async ({ data }): Promise<HolidaysActionResult> => {
    try {
      await deleteBackendInternalHoliday(
        data.holidayId,
        withForwardedBackendApiAuth(
          getRequestHeaders(),
          await withTanstackBackendRuntime()
        )
      );

      return {
        ok: true,
      };
    } catch (error) {
      if (error instanceof InternalApiError) {
        return toHolidayActionError(error);
      }

      throw error;
    }
  });

const bulkImportHolidays = createServerFn({ method: 'POST' })
  .validator((data: BackendInternalHolidayBulkImportRequest) => data)
  .handler(async ({ data }): Promise<HolidaysActionResult> => {
    try {
      const response = await bulkImportBackendInternalHolidays(
        data,
        withForwardedBackendApiAuth(
          getRequestHeaders(),
          await withTanstackBackendRuntime()
        )
      );

      return {
        imported: response.imported,
        ok: true,
        yearsAffected: response.yearsAffected,
      };
    } catch (error) {
      if (error instanceof InternalApiError) {
        return toHolidayActionError(error);
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

export const Route = createFileRoute('/$locale/$wsId/infrastructure/holidays')({
  component: HolidaysRoutePage,
  validateSearch: validateHolidaysSearch,
  loaderDeps: ({ search }) => ({
    year: search.year,
  }),
  head: ({ params }) => {
    const locale = resolveMessagesLocale(params.locale);

    return createPageHead({
      description:
        'Manage Vietnamese public holidays used for business day rules.',
      locale,
      title: 'Holidays',
    });
  },
  loader: async ({ params, deps }): Promise<HolidaysData> => {
    await requireCurrentUser({
      locale: params.locale,
      nextPath: `/${params.wsId}/infrastructure/holidays`,
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

    return {
      currentYear: currentCalendarYear(),
      holidays: await loadServerHolidays({ data: { year: deps.year } }),
      selectedYear: deps.year,
      workspaceId: workspace.workspaceId,
    };
  },
});

function HolidaysRoutePage() {
  const data = Route.useLoaderData() as HolidaysData;

  return (
    <HolidaysClientPage
      bulkImportHolidays={(values) => bulkImportHolidays({ data: values })}
      createHoliday={(values) => createHoliday({ data: values })}
      currentYear={data.currentYear}
      deleteHoliday={(holidayId) => deleteHoliday({ data: { holidayId } })}
      holidays={data.holidays}
      selectedYear={data.selectedYear}
      updateHoliday={(holidayId, values) =>
        updateHoliday({
          data: {
            holidayId,
            values,
          },
        })
      }
      workspaceId={data.workspaceId}
    />
  );
}
