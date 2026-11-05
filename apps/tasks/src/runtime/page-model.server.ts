import '@tanstack/react-start/server-only';
import { notFound, redirect } from '@tuturuuu/start-bridge/next/navigation';
import { matchPage } from '@tuturuuu/start-bridge/pages';
import { bridgeRequest } from '@tuturuuu/start-bridge/request-context';
import { runtimeAppBase } from '@tuturuuu/start-bridge/start/base-path';
import { PAGE_REWRITE_HEADER } from '../lib/page-rewrite';
import { resolvePathLocale } from './locale';
import { type PagePattern, pages } from './page-registry.bridge.gen';
import {
  loginModel,
  publicBoardModel,
  sharedTaskModel,
} from './public-page-model.server';
import { rootEntry } from './root-page-model.server';
import {
  type TasksWorkspaceModel,
  workspaceModel,
} from './workspace-model.server';
import {
  boardModel,
  calendarModel,
  cyclePlanningModel,
  cyclesModel,
  entrypointRedirect,
  legacyBoardRedirect,
  newTaskModel,
  progressModel,
  progressViewModel,
} from './workspace-page-model.server';

interface PageContext {
  params: Record<string, string>;
  search: URLSearchParams;
  locale: 'en' | 'vi';
}

/** The `[wsId]` layout around a page: invitation, or shell plus page. */
async function inWorkspace<Page>(
  { params }: PageContext,
  page: (scope: TasksWorkspaceModel) => Page | Promise<Page>
) {
  const scope = await workspaceModel(params.wsId ?? '');
  if (scope.kind === 'invitation') return scope;
  return { kind: 'workspace' as const, shell: scope, page: await page(scope) };
}

const loaders = {
  '/login': (ctx: PageContext) => loginModel(ctx.search),
  '/verify-token': async () => ({ kind: 'verify-token' as const }),
  '/[wsId]/analytics': (ctx: PageContext) =>
    inWorkspace(ctx, () => progressModel(ctx.params.wsId ?? '', 'stats')),
  '/[wsId]/boards/[boardId]': (ctx: PageContext) =>
    inWorkspace(ctx, (scope) => boardModel(scope, ctx.params.boardId ?? '')),
  '/[wsId]/boards': (ctx: PageContext) => inWorkspace(ctx, entrypointRedirect),
  '/[wsId]/calendar': (ctx: PageContext) => inWorkspace(ctx, calendarModel),
  '/[wsId]/cycles/planning': (ctx: PageContext) =>
    inWorkspace(ctx, cyclePlanningModel),
  '/[wsId]/cycles': (ctx: PageContext) => inWorkspace(ctx, cyclesModel),
  '/[wsId]/goals': (ctx: PageContext) =>
    inWorkspace(ctx, () => progressModel(ctx.params.wsId ?? '', 'goals')),
  '/[wsId]/leaderboard': (ctx: PageContext) =>
    inWorkspace(ctx, () =>
      progressModel(ctx.params.wsId ?? '', 'leaderboards')
    ),
  '/[wsId]/progress/[view]': (ctx: PageContext) =>
    inWorkspace(ctx, () =>
      progressViewModel(ctx.params.wsId ?? '', ctx.params.view ?? '')
    ),
  '/[wsId]/progress': (ctx: PageContext) =>
    inWorkspace(ctx, () => progressModel(ctx.params.wsId ?? '', 'progress')),
  '/[wsId]/tasks/[taskId]': (ctx: PageContext) =>
    inWorkspace(ctx, () => ({
      kind: 'task-detail' as const,
      wsId: ctx.params.wsId ?? '',
      taskId: ctx.params.taskId ?? '',
    })),
  '/[wsId]/tasks/boards/[boardId]': (ctx: PageContext) =>
    inWorkspace(ctx, () =>
      legacyBoardRedirect(
        ctx.params.wsId ?? '',
        ctx.params.boardId ?? '',
        ctx.search
      )
    ),
  '/[wsId]/tasks/new': (ctx: PageContext) =>
    inWorkspace(ctx, (scope) =>
      newTaskModel(scope, ctx.params.wsId ?? '', ctx.locale, ctx.search)
    ),
  '/[wsId]/tasks': (ctx: PageContext) => inWorkspace(ctx, entrypointRedirect),
  '/shared/task-boards/[code]': (ctx: PageContext) =>
    publicBoardModel(ctx.params.code ?? ''),
  '/shared/task/[shareCode]': (ctx: PageContext) =>
    sharedTaskModel(ctx.params.shareCode ?? ''),
  '/task-link-preview': async () => ({ kind: 'link-preview' as const }),
} satisfies Record<PagePattern, (ctx: PageContext) => Promise<unknown>>;

export type TasksPage = Awaited<
  ReturnType<(typeof loaders)[keyof typeof loaders]>
>;

/** The app-relative pathname of a router path, without its locale prefix. */
function appPathname(path: string) {
  const base = runtimeAppBase();
  let pathname = new URL(path, 'http://app.invalid').pathname;
  if (base && (pathname === base || pathname.startsWith(`${base}/`)))
    pathname = pathname.slice(base.length) || '/';
  const localeless = pathname.replace(/^\/(?:en|vi)(?=\/|$)/u, '') || '/';
  return { pathname: localeless, localePrefixed: localeless !== pathname };
}

export async function loadPageModel(path: string) {
  // A proxy rewrite (crawler preview, root fallback) names the page to load.
  const rewrite = bridgeRequest().request.headers.get(PAGE_REWRITE_HEADER);
  const target =
    rewrite?.startsWith('/') && !rewrite.startsWith('//') ? rewrite : path;
  const url = new URL(target, 'http://app.invalid');
  const locale = resolvePathLocale(target);
  let { pathname, localePrefixed } = appPathname(target);
  if (pathname === '/') {
    const entry = await rootEntry({
      locale,
      localePrefixed,
      search: url.searchParams,
    });
    if (entry.kind === 'board') redirect(entry.path);
    // No board yet: the localized task entrypoint, as the proxy rewrites it.
    pathname = `/${entry.target}/tasks`;
  }
  const match = matchPage(pages, pathname);
  if (!match) notFound();
  const params = { ...match.params, locale } as Record<string, string>;
  const page = await loaders[match.page.pattern as PagePattern]({
    params,
    search: url.searchParams,
    locale,
  });
  return {
    locale,
    params,
    actorId: page.kind === 'workspace' ? page.shell.user.id : undefined,
    page,
  };
}

export type TasksPageModel = Awaited<ReturnType<typeof loadPageModel>>;
