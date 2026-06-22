import { createFileRoute, redirect } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequestHeaders } from '@tanstack/react-start/server';
import {
  createInternalApiClient,
  withForwardedInternalApiAuth,
} from '@tuturuuu/internal-api';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import {
  SharedTaskContent,
  type SharedTaskContentProps,
} from '../../../../components/shared/shared-task-content';
import {
  buildLoginRedirectHref,
  resolveCurrentUser,
} from '../../../../lib/platform/auth-gate';
import { createPageHead } from '../../../../lib/platform/head';
import type { Locale } from '../../../../lib/platform/locale';
import { resolveMessagesLocale } from '../../../../lib/platform/messages';

type SharedTaskRouteParams = {
  shareCode: string;
  locale: string;
};

/**
 * Shape returned by the legacy `/api/v1/shared/tasks/{shareCode}` endpoint.
 * The endpoint itself performs all per-share authorization (membership,
 * task_shares, public_access) and effective-permission resolution; this route
 * only forwards the authenticated user's request to it.
 */
type SharedTaskApiResponse = {
  task: Task;
  permission: 'view' | 'edit';
  workspace: { id: string; name: string };
  board: { id: string; name: string };
  list: { id: string; name: string };
  boardConfig: SharedTaskContentProps['boardConfig'];
  availableLists: TaskList[];
  workspaceLabels: SharedTaskContentProps['workspaceLabels'];
  workspaceProjects: SharedTaskContentProps['workspaceProjects'];
  workspaceMembers: SharedTaskContentProps['workspaceMembers'];
};

/**
 * Server-resolved result for the shared-task page.
 * - 200: ok, `data` carries the API payload plus the resolved current user.
 * - 401: visitor is not authenticated. `data` is null — NO task data is
 *   exposed (fail closed); the loader redirects to login.
 * - 404: the share link is missing / revoked / the visitor is not eligible
 *   (the API answers non-2xx). Render the unavailable shell.
 */
type SharedTaskPageResult =
  | {
      status: 200;
      data: SharedTaskApiResponse & {
        shareCode: string;
        currentUser: SharedTaskContentProps['currentUser'];
      };
    }
  | { status: 401 | 404; data: null };

/**
 * Faithful port of the legacy `SharedTaskPage` server load (apps/web).
 *
 * Fail-closed auth: the legacy page resolves the Supabase session server-side
 * and redirects to `/login?nextUrl=/shared/task/{shareCode}` when there is no
 * authenticated user.
 * This server function mirrors that exactly — it resolves the current user via
 * the shared auth gate and returns `{ status: 401, data: null }` BEFORE any
 * task fetch when the visitor is not authenticated, so no task data is ever
 * read or exposed for an unauthenticated request.
 *
 * Authorization for the share itself (membership / task_shares / public_access)
 * is owned by the `/api/v1/shared/tasks/{shareCode}` endpoint; we forward the
 * authenticated user's request to it, exactly as the legacy page did with the
 * user's cookies.
 */
const loadSharedTask = createServerFn({ method: 'GET' })
  .validator((data: { shareCode: string }) => data)
  .handler(async ({ data }): Promise<SharedTaskPageResult> => {
    const shareCode = data.shareCode.trim();

    if (!shareCode) {
      return { status: 404, data: null };
    }

    // Auth gate — fail closed before touching any task data.
    const user = await resolveCurrentUser();
    if (!user) {
      return { status: 401, data: null };
    }

    const client = createInternalApiClient(
      withForwardedInternalApiAuth(getRequestHeaders())
    );

    let payload: SharedTaskApiResponse;
    try {
      payload = await client.json<SharedTaskApiResponse>(
        `/api/v1/shared/tasks/${encodeURIComponent(shareCode)}`,
        { cache: 'no-store' }
      );
    } catch {
      // Revoked, missing, or the user is not eligible — the endpoint answers
      // non-2xx. Mirror the legacy "Share link not found" shell.
      return { status: 404, data: null };
    }

    const currentUser: SharedTaskContentProps['currentUser'] = {
      id: user.id,
      display_name: user.display_name ?? undefined,
      avatar_url: user.avatar_url ?? undefined,
      email: user.email ?? undefined,
    };

    return {
      status: 200,
      data: { ...payload, shareCode, currentUser },
    };
  });

type SharedTaskLoaderData =
  | {
      status: 'ok';
      payload: SharedTaskApiResponse & {
        shareCode: string;
        currentUser: SharedTaskContentProps['currentUser'];
      };
    }
  | { status: 'unavailable' };

export const Route = createFileRoute('/$locale/shared/task/$shareCode')({
  component: SharedTaskRoutePage,
  head: ({ params }) => {
    const { locale: routeLocale } = params as SharedTaskRouteParams;
    const locale = resolveMessagesLocale(routeLocale);
    const title = locale === 'vi' ? 'Công việc được chia sẻ' : 'Shared task';

    return createPageHead({
      locale,
      robots: 'noindex, nofollow',
      title,
    });
  },
  loader: async ({ params }): Promise<SharedTaskLoaderData> => {
    const { shareCode = '', locale = '' } =
      params as Partial<SharedTaskRouteParams>;

    const result = await loadSharedTask({ data: { shareCode } });

    if (result.status === 401) {
      // Mirror legacy redirect to /login?nextUrl=/shared/task/{shareCode}.
      // No task data is exposed before this redirect (fail closed).
      throw redirect({
        href: buildLoginRedirectHref(locale, `/shared/task/${shareCode}`),
        statusCode: 307,
      });
    }

    if (result.status !== 200) {
      // 404 — render the unavailable shell (do not throw).
      return { status: 'unavailable' };
    }

    return { status: 'ok', payload: result.data };
  },
});

const unavailableMessagesByLocale: Record<
  Locale,
  { title: string; description: string }
> = {
  en: {
    title: 'Share link not found',
    description: "This share link may have been revoked or doesn't exist.",
  },
  vi: {
    title: 'Không tìm thấy liên kết chia sẻ',
    description:
      'Liên kết chia sẻ này có thể đã bị thu hồi hoặc không tồn tại.',
  },
};

function UnavailableShell({ locale }: { locale: Locale }) {
  const messages = unavailableMessagesByLocale[locale];

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <h1 className="mb-2 font-semibold text-2xl text-dynamic-red">
          {messages.title}
        </h1>
        <p className="text-muted-foreground">{messages.description}</p>
      </div>
    </div>
  );
}

function SharedTaskRoutePage() {
  const { locale } = Route.useParams() as SharedTaskRouteParams;
  const data = Route.useLoaderData() as SharedTaskLoaderData;
  const messagesLocale = resolveMessagesLocale(locale);

  if (data.status !== 'ok') {
    return <UnavailableShell locale={messagesLocale} />;
  }

  const { payload } = data;

  return (
    <SharedTaskContent
      task={payload.task}
      permission={payload.permission}
      workspace={payload.workspace}
      board={payload.board}
      list={payload.list}
      shareCode={payload.shareCode}
      currentUser={payload.currentUser}
      boardConfig={payload.boardConfig}
      availableLists={payload.availableLists}
      workspaceLabels={payload.workspaceLabels}
      workspaceProjects={payload.workspaceProjects}
      workspaceMembers={payload.workspaceMembers}
    />
  );
}
