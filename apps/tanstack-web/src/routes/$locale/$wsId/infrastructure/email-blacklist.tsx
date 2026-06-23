import { createFileRoute, notFound } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequestHeaders } from '@tanstack/react-start/server';
import {
  type BackendInfrastructureEmailBlacklistCreateRequest,
  type BackendInfrastructureEmailBlacklistEntry,
  type BackendInfrastructureEmailBlacklistEntryType,
  type BackendInfrastructureEmailBlacklistUpdateRequest,
  createBackendInfrastructureEmailBlacklistEntry,
  deleteBackendInfrastructureEmailBlacklistEntry,
  getBackendInfrastructureEmailBlacklistEntries,
  updateBackendInfrastructureEmailBlacklistEntry,
  withForwardedBackendApiAuth,
} from '@tuturuuu/internal-api/backend';
import { InternalApiError } from '@tuturuuu/internal-api/client';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import {
  type EmailBlacklistActionResult,
  EmailBlacklistClientPage,
} from '@/components/infrastructure/email-blacklist/email-blacklist-client-page';
import { withTanstackBackendRuntime } from '@/lib/cloudflare/backend';
import { requireCurrentUser } from '@/lib/platform/auth-gate';
import { createPageHead } from '@/lib/platform/head';
import { resolveMessagesLocale } from '@/lib/platform/messages';
import { resolveWorkspace } from '@/lib/platform/workspace';
import { hasWorkspacePermission } from '@/lib/platform/workspace-permission';

type EmailBlacklistSearch = {
  page: number;
  pageSize: number;
  q: string;
  type: BackendInfrastructureEmailBlacklistEntryType | '';
};

type EmailBlacklistData = EmailBlacklistSearch & {
  count: number;
  data: BackendInfrastructureEmailBlacklistEntry[];
  workspaceId: string;
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

function parseEntryType(
  value: unknown
): BackendInfrastructureEmailBlacklistEntryType | '' {
  return value === 'email' || value === 'domain' ? value : '';
}

function validateEmailBlacklistSearch(
  search: Record<string, unknown>
): EmailBlacklistSearch {
  return {
    page: parsePositiveInteger(search.page, 1),
    pageSize: parsePositiveInteger(search.pageSize, 10, 100),
    q: typeof search.q === 'string' ? search.q : '',
    type: parseEntryType(search.type),
  };
}

function filterEmailBlacklistRows(
  rows: BackendInfrastructureEmailBlacklistEntry[],
  search: EmailBlacklistSearch
) {
  const normalizedQuery = search.q.trim().toLowerCase();

  if (!normalizedQuery && !search.type) {
    return rows;
  }

  return rows.filter((row) => {
    if (search.type && row.entry_type !== search.type) {
      return false;
    }

    if (!normalizedQuery) {
      return true;
    }

    return (
      row.value.toLowerCase().includes(normalizedQuery) ||
      (row.reason ?? '').toLowerCase().includes(normalizedQuery)
    );
  });
}

function paginateEmailBlacklistRows(
  rows: BackendInfrastructureEmailBlacklistEntry[],
  page: number,
  pageSize: number
) {
  const start = (page - 1) * pageSize;

  return rows.slice(start, start + pageSize);
}

const loadEmailBlacklistEntries = createServerFn({ method: 'GET' }).handler(
  async (): Promise<BackendInfrastructureEmailBlacklistEntry[]> => {
    const backendRuntime = await withTanstackBackendRuntime();

    return getBackendInfrastructureEmailBlacklistEntries(
      withForwardedBackendApiAuth(getRequestHeaders(), backendRuntime)
    );
  }
);

function toEmailBlacklistActionError(
  error: InternalApiError
): EmailBlacklistActionResult {
  return {
    code: error.code,
    message: error.message,
    ok: false,
    status: error.status,
  };
}

const createEmailBlacklistEntry = createServerFn({ method: 'POST' })
  .validator((data: BackendInfrastructureEmailBlacklistCreateRequest) => data)
  .handler(async ({ data }): Promise<EmailBlacklistActionResult> => {
    try {
      await createBackendInfrastructureEmailBlacklistEntry(
        data,
        withForwardedBackendApiAuth(
          getRequestHeaders(),
          await withTanstackBackendRuntime()
        )
      );

      return { ok: true };
    } catch (error) {
      if (error instanceof InternalApiError) {
        return toEmailBlacklistActionError(error);
      }

      throw error;
    }
  });

const updateEmailBlacklistEntry = createServerFn({ method: 'POST' })
  .validator(
    (data: {
      entryId: string;
      values: BackendInfrastructureEmailBlacklistUpdateRequest;
    }) => data
  )
  .handler(async ({ data }): Promise<EmailBlacklistActionResult> => {
    try {
      await updateBackendInfrastructureEmailBlacklistEntry(
        data.entryId,
        data.values,
        withForwardedBackendApiAuth(
          getRequestHeaders(),
          await withTanstackBackendRuntime()
        )
      );

      return { ok: true };
    } catch (error) {
      if (error instanceof InternalApiError) {
        return toEmailBlacklistActionError(error);
      }

      throw error;
    }
  });

const deleteEmailBlacklistEntry = createServerFn({ method: 'POST' })
  .validator((data: { entryId: string }) => data)
  .handler(async ({ data }): Promise<EmailBlacklistActionResult> => {
    try {
      await deleteBackendInfrastructureEmailBlacklistEntry(
        data.entryId,
        withForwardedBackendApiAuth(
          getRequestHeaders(),
          await withTanstackBackendRuntime()
        )
      );

      return { ok: true };
    } catch (error) {
      if (error instanceof InternalApiError) {
        return toEmailBlacklistActionError(error);
      }

      throw error;
    }
  });

export const Route = createFileRoute(
  '/$locale/$wsId/infrastructure/email-blacklist'
)({
  component: EmailBlacklistRoutePage,
  validateSearch: validateEmailBlacklistSearch,
  loaderDeps: ({ search }) => ({
    page: search.page,
    pageSize: search.pageSize,
    q: search.q,
    type: search.type,
  }),
  head: ({ params }) => {
    const locale = resolveMessagesLocale(params.locale);

    return createPageHead({
      description:
        'Manage email and domain blacklist entries for infrastructure controls.',
      locale,
      title: 'Email Blacklist',
    });
  },
  loader: async ({ params, deps }): Promise<EmailBlacklistData> => {
    await requireCurrentUser({
      locale: params.locale,
      nextPath: `/${params.wsId}/infrastructure/email-blacklist`,
    });

    const workspace = await resolveWorkspace({ data: { wsId: params.wsId } });
    if (!workspace.exists) {
      throw notFound();
    }

    const [canViewRootInfrastructure, canViewWorkspaceInfrastructure] =
      await Promise.all([
        hasWorkspacePermission({
          data: {
            permission: 'view_infrastructure',
            wsId: ROOT_WORKSPACE_ID,
          },
        }),
        hasWorkspacePermission({
          data: {
            permission: 'view_infrastructure',
            wsId: workspace.workspaceId,
          },
        }),
      ]);
    if (!canViewRootInfrastructure || !canViewWorkspaceInfrastructure) {
      throw notFound();
    }

    const rows = await loadEmailBlacklistEntries();
    const filteredRows = filterEmailBlacklistRows(rows, deps);

    return {
      count: filteredRows.length,
      data: paginateEmailBlacklistRows(filteredRows, deps.page, deps.pageSize),
      page: deps.page,
      pageSize: deps.pageSize,
      q: deps.q,
      type: deps.type,
      workspaceId: workspace.workspaceId,
    };
  },
});

function EmailBlacklistRoutePage() {
  const data = Route.useLoaderData() as EmailBlacklistData | undefined;

  if (!data) {
    throw notFound();
  }

  return (
    <EmailBlacklistClientPage
      count={data.count}
      createEntry={(values) => createEmailBlacklistEntry({ data: values })}
      data={data.data}
      deleteEntry={(entryId) =>
        deleteEmailBlacklistEntry({ data: { entryId } })
      }
      page={data.page}
      pageSize={data.pageSize}
      q={data.q}
      type={data.type}
      updateEntry={(entryId, values) =>
        updateEmailBlacklistEntry({
          data: {
            entryId,
            values,
          },
        })
      }
      workspaceId={data.workspaceId}
    />
  );
}
