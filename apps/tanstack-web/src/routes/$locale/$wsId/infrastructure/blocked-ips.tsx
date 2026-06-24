import { createFileRoute, notFound } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequestHeaders } from '@tanstack/react-start/server';
import {
  InternalApiError,
  withForwardedInternalApiAuth,
} from '@tuturuuu/internal-api/client';
import {
  type BlockBlockedIpPayload,
  type BlockedIpEntry,
  type BlockedIpStatus,
  blockBlockedIp,
  type ListBlockedIpsResponse,
  listBlockedIps,
  type UnblockBlockedIpPayload,
  unblockBlockedIp,
} from '@tuturuuu/internal-api/infrastructure';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import {
  type BlockedIpActionResult,
  BlockedIpsClientPage,
} from '@/components/infrastructure/blocked-ips/blocked-ips-client-page';
import { requireCurrentUser } from '@/lib/platform/auth-gate';
import { createPageHead } from '@/lib/platform/head';
import { resolveMessagesLocale } from '@/lib/platform/messages';
import { resolveWorkspace } from '@/lib/platform/workspace';
import { hasWorkspacePermission } from '@/lib/platform/workspace-permission';

type BlockedIpsSearch = {
  page: number;
  pageSize: number;
  q: string;
  status: BlockedIpStatus | '';
};

type BlockedIpsData = BlockedIpsSearch & {
  count: number;
  data: BlockedIpEntry[];
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

function parseBlockedIpStatus(value: unknown): BlockedIpStatus | '' {
  return value === 'active' ||
    value === 'expired' ||
    value === 'manually_unblocked'
    ? value
    : '';
}

function validateBlockedIpsSearch(
  search: Record<string, unknown>
): BlockedIpsSearch {
  return {
    page: parsePositiveInteger(search.page, 1),
    pageSize: parsePositiveInteger(search.pageSize, 10, 100),
    q: typeof search.q === 'string' ? search.q : '',
    status: parseBlockedIpStatus(search.status),
  };
}

const loadBlockedIps = createServerFn({ method: 'GET' })
  .validator((data: BlockedIpsSearch) => data)
  .handler(async ({ data }): Promise<ListBlockedIpsResponse> => {
    return listBlockedIps(
      {
        page: data.page,
        pageSize: data.pageSize,
        q: data.q,
        status: data.status,
      },
      withForwardedInternalApiAuth(getRequestHeaders())
    );
  });

function toBlockedIpActionError(
  error: InternalApiError
): BlockedIpActionResult {
  return {
    code: error.code,
    message: error.message,
    ok: false,
    status: error.status,
  };
}

const blockBlockedIpEntry = createServerFn({ method: 'POST' })
  .validator((data: BlockBlockedIpPayload) => data)
  .handler(async ({ data }): Promise<BlockedIpActionResult> => {
    try {
      const response = await blockBlockedIp(
        data,
        withForwardedInternalApiAuth(getRequestHeaders())
      );

      return { message: response.message, ok: true };
    } catch (error) {
      if (error instanceof InternalApiError) {
        return toBlockedIpActionError(error);
      }

      throw error;
    }
  });

const unblockBlockedIpEntry = createServerFn({ method: 'POST' })
  .validator((data: UnblockBlockedIpPayload) => data)
  .handler(async ({ data }): Promise<BlockedIpActionResult> => {
    try {
      const response = await unblockBlockedIp(
        data,
        withForwardedInternalApiAuth(getRequestHeaders())
      );

      return { message: response.message, ok: true };
    } catch (error) {
      if (error instanceof InternalApiError) {
        return toBlockedIpActionError(error);
      }

      throw error;
    }
  });

export const Route = createFileRoute(
  '/$locale/$wsId/infrastructure/blocked-ips'
)({
  component: BlockedIpsRoutePage,
  validateSearch: validateBlockedIpsSearch,
  loaderDeps: ({ search }) => ({
    page: search.page,
    pageSize: search.pageSize,
    q: search.q,
    status: search.status,
  }),
  head: ({ params }) => {
    const locale = resolveMessagesLocale(params.locale);

    return createPageHead({
      description: 'Manage blocked IP addresses for abuse prevention.',
      locale,
      title: 'Blocked IPs',
    });
  },
  loader: async ({ params, deps }): Promise<BlockedIpsData> => {
    await requireCurrentUser({
      locale: params.locale,
      nextPath: `/${params.wsId}/infrastructure/blocked-ips`,
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

    const result = await loadBlockedIps({
      data: {
        page: deps.page,
        pageSize: deps.pageSize,
        q: deps.q,
        status: deps.status,
      },
    });

    return {
      count: result.count ?? 0,
      data: result.data ?? [],
      page: result.page ?? deps.page,
      pageSize: result.pageSize ?? deps.pageSize,
      q: deps.q,
      status: deps.status,
      workspaceId: workspace.workspaceId,
    };
  },
});

function BlockedIpsRoutePage() {
  const data = Route.useLoaderData() as BlockedIpsData | undefined;

  if (!data) {
    throw notFound();
  }

  return (
    <BlockedIpsClientPage
      blockEntry={(values) => blockBlockedIpEntry({ data: values })}
      count={data.count}
      data={data.data}
      page={data.page}
      pageSize={data.pageSize}
      q={data.q}
      status={data.status}
      unblockEntry={(values) => unblockBlockedIpEntry({ data: values })}
      workspaceId={data.workspaceId}
    />
  );
}
