import { matchPage } from '@tuturuuu/start-bridge/pages';
import { calendarBase } from './calendar-mount';
import { pages } from './page-registry.bridge.gen';
import '@tanstack/react-start/server-only';
import { getSatelliteAppSessionUser } from '@tuturuuu/satellite/auth';
import { isExactTuturuuuDotComEmail } from '@tuturuuu/utils/email/client';
import LoginPage from '../app/[locale]/(auth)/login/page';
import { PUBLIC_PATHS } from '../constants/common';
import { calendarPageModel } from './calendar-page-model.server';
import { labModel } from './lab-model.server';
import { loadLocaleContext } from './locale-context.server';
import { notFound, redirect } from './next-navigation';
import { calendarRequest, withCalendarRequest } from './request-context';
import { taskPageModel } from './task-page-model.server';
import { workspaceModel, workspaceShellModel } from './workspace-model.server';

export async function loadPageModel(path: string) {
  const current = calendarRequest();
  const url = new URL(path, current.request.url);
  if (url.origin !== new URL(current.request.url).origin)
    throw new Error('Invalid Calendar page origin');
  return withCalendarRequest(
    {
      ...current,
      request: new Request(url, {
        method: current.request.method,
        headers: current.request.headers,
      }),
    },
    () => loadResolvedPageModel(url)
  );
}

async function loadResolvedPageModel(url: URL) {
  const pathname = calendarBase(url)?.strip(url.pathname);
  if (pathname == null) notFound();
  const segments = pathname.split('/').filter(Boolean).map(decodeURIComponent);
  const locale = loadLocaleContext(`${url.pathname}${url.search}`);
  if (segments[0] === 'en' || segments[0] === 'vi') segments.shift();
  const request = calendarRequest().request;
  if (
    (request.method === 'GET' || request.method === 'HEAD') &&
    PUBLIC_PATHS.includes(pathname) &&
    !url.searchParams.has('token')
  )
    return {
      kind: 'verify-token' as const,
      locale,
      params: { locale, wsId: 'verify-token' },
      actorId: undefined,
      showVersionBadge: false,
    };
  const actor = await getSatelliteAppSessionUser('calendar');
  const params: Record<string, string> = { locale };
  if (segments[0]) params.wsId = segments[0];
  if (segments[1] === 'tasks' && segments[2] === 'boards' && segments[3])
    params.boardId = segments[3];
  else if (segments[1] === 'tasks' && segments[2]) params.taskId = segments[2];
  const common = {
    locale,
    params,
    actorId: actor?.id,
    showVersionBadge: isExactTuturuuuDotComEmail(actor?.email),
  };
  if (segments[0] === 'login' && segments.length === 1) {
    await LoginPage({
      searchParams: Promise.resolve(Object.fromEntries(url.searchParams)),
    });
    throw new Error('Calendar login must redirect');
  }
  if (segments[0] === 'verify-token' && segments.length === 1)
    return { ...common, kind: 'verify-token' as const };
  if (!actor?.id) redirect('/login');
  if (!segments.length) redirect('/personal');
  if (!matchPage(pages, `/${segments.join('/')}`)) notFound();
  const wsId = segments[0];
  if (!wsId) notFound();
  if (segments.length > 1 && segments[1] !== 'lab' && segments[1] !== 'tasks')
    notFound();
  if (segments[1] === 'lab' && segments.length !== 2) notFound();
  const scope = await workspaceModel(wsId);
  if (scope.kind === 'invitation')
    return {
      ...common,
      kind: 'invitation' as const,
      invitation: scope.invitation,
    };
  if (segments.length === 1) {
    const calendar = await calendarPageModel({
      params: Promise.resolve({ wsId, locale }),
      searchParams: Promise.resolve({
        date: url.searchParams.get('date') ?? undefined,
        eventId: url.searchParams.get('eventId') ?? undefined,
      }),
    });
    return {
      ...common,
      kind: 'calendar' as const,
      shell: await workspaceShellModel(scope),
      calendar,
    };
  }
  if (segments[1] === 'lab') {
    const lab = await labModel(wsId);
    return {
      ...common,
      kind: 'lab' as const,
      shell: await workspaceShellModel(scope),
      lab,
    };
  }
  const task = await taskPageModel({
    segments: segments.slice(1),
    workspace: scope.workspace,
    user: scope.user,
    search: url.searchParams,
  });
  return {
    ...common,
    kind: 'task' as const,
    shell: await workspaceShellModel(scope),
    task,
  };
}
export type CalendarPageModel = Awaited<ReturnType<typeof loadPageModel>>;
