import '@tanstack/react-start/server-only';
import { notFound, redirect } from '@tanstack/react-router';
import { getSatelliteAppSessionUser } from '@tuturuuu/satellite/auth';
import { normalizeAuthRedirectPath } from '@tuturuuu/auth/proxy';
import { createBasePath } from '@tuturuuu/start-bridge/base-path';
import {
  appBasePath,
  withAppBase,
} from '@tuturuuu/start-bridge/start/base-path';
import { isExactTuturuuuDotComEmail } from '@tuturuuu/utils/email/client';
import LoginPage from '../app/[locale]/(auth)/login/page';
import { proxy } from '../proxy';
import { getLocale } from './intl-server';
import { MAIL_FUNCTION_BASE } from './mail-api-policy';
import { loadMailWorkspace } from './mail-workspace-model.server';
import { resolveMailPage } from './page-policy';
import { dispatchThroughMailProxy } from './proxy-bridge';
import { mailRequest, withMailRequest } from './request-context';

/** URL parsing would silently resolve these into a different path. */
function hasDotSegment(value: string | null) {
  if (!value) return false;
  let decoded = value;
  for (let round = 0; round < 3; round += 1) {
    try {
      decoded = decodeURIComponent(decoded);
    } catch {
      return true;
    }
  }
  return decoded
    .split(/[/\\?#]/u)
    .some((part) => part === '.' || part === '..');
}

const RETURNABLE_PAGES = new Set(['home', 'workspace-index', 'folder']);

/**
 * The token handoff page is never served under the mount. Anything it carried
 * is dropped; only a normalized app-relative Mail path, with no query, can be
 * sent to the mounted login as `next`.
 */
function mountedLoginRedirect(url: URL, basePath: string) {
  const raw = url.searchParams.get('nextUrl') ?? url.searchParams.get('next');
  const normalized = normalizeAuthRedirectPath(raw, url.origin, '');
  const login = new URL(withAppBase('/login'), url.origin);
  if (normalized && !hasDotSegment(raw)) {
    const pathname = new URL(normalized, url.origin).pathname;
    const appPath =
      createBasePath({ app: 'mail', basePath }).strip(pathname) ?? pathname;
    if (
      appPath &&
      appPath !== '/' &&
      RETURNABLE_PAGES.has(resolveMailPage(appPath).kind)
    )
      login.searchParams.set('next', appPath);
  }
  return login.pathname + login.search;
}

export async function loadPageModel(path: string) {
  const current = mailRequest();
  const requestUrl = new URL(current.request.url);
  const base = createBasePath({ app: 'mail', basePath: appBasePath() });
  const url = new URL(base.withBase(path), requestUrl);
  if (url.origin !== requestUrl.origin)
    throw new Error('Invalid Mail page origin');
  // Start can reserialize the search while matching the first document.
  if (!base.isRoot && url.pathname === requestUrl.pathname)
    url.search = requestUrl.search;
  const logical = new Request(url, { headers: current.request.headers });
  const actualPath = base.strip(requestUrl.pathname) ?? requestUrl.pathname;
  if (
    actualPath !== MAIL_FUNCTION_BASE &&
    !actualPath.startsWith(`${MAIL_FUNCTION_BASE}/`)
  ) {
    return withMailRequest({ ...current, request: logical }, () =>
      loadResolvedPage(url)
    );
  }
  const result: {
    outcome?:
      | { kind: 'model'; model: Awaited<ReturnType<typeof loadResolvedPage>> }
      | { kind: 'error'; error: unknown };
  } = {};
  const response = await dispatchThroughMailProxy({
    request: logical,
    proxy,
    waitUntil: current.waitUntil,
    cloudflare: current.cloudflare,
    dispatch: async (forwarded) => {
      try {
        result.outcome = {
          kind: 'model',
          model: await loadResolvedPage(new URL(forwarded.url)),
        };
      } catch (error) {
        result.outcome = { kind: 'error', error };
      }
      return new Response(null);
    },
  });
  for (const [key, value] of response.headers)
    if (key !== 'set-cookie') current.responseHeaders.set(key, value);
  for (const cookie of response.headers.getSetCookie())
    current.responseHeaders.append('set-cookie', cookie);
  const location = response.headers.get('location');
  if (location) throw redirect({ href: location, statusCode: response.status });
  const outcome = result.outcome;
  if (!outcome) throw new Error('Mail page proxy terminated the request');
  if (outcome.kind === 'error') throw outcome.error;
  return outcome.model;
}
async function loadResolvedPage(url: URL) {
  let page: ReturnType<typeof resolveMailPage>;
  try {
    const path = createBasePath({ app: 'mail', basePath: appBasePath() }).strip(
      url.pathname
    );
    if (path === null) throw notFound();
    page = resolveMailPage(path);
  } catch (error) {
    if (error instanceof URIError) throw notFound();
    throw error;
  }
  const locale = /^\/(?:en|vi)(?:\/|$)/u.test(
    createBasePath({ app: 'mail', basePath: appBasePath() }).strip(
      url.pathname
    ) ?? ''
  )
    ? page.locale
    : await getLocale();
  const prefix = `${appBasePath()}${locale === 'vi' ? '/vi' : ''}`;
  const actor = await getSatelliteAppSessionUser('mail');
  const params: Record<string, string> = { locale };
  const common = {
    locale,
    actorId: actor?.id,
    showVersionBadge: isExactTuturuuuDotComEmail(actor?.email),
    params,
  };
  switch (page.kind) {
    case 'home':
      throw redirect({ href: `${prefix}/personal/inbox` });
    case 'login':
      await LoginPage({
        searchParams: Promise.resolve(Object.fromEntries(url.searchParams)),
      });
      throw new Error('Mail login did not redirect');
    case 'verify-token': {
      const basePath = appBasePath();
      if (basePath)
        throw redirect({ href: mountedLoginRedirect(url, basePath) });
      return { ...common, kind: 'verify-token' as const };
    }
    case 'not-available':
      return { ...common, kind: 'not-available' as const };
    case 'missing':
      throw notFound();
    case 'workspace-index':
    case 'folder': {
      const workspace = await loadMailWorkspace(page.wsId);
      const params = { locale, wsId: page.wsId };
      if (workspace.kind === 'invitation')
        return { ...common, params, ...workspace };
      if (page.kind === 'workspace-index')
        throw redirect({
          href: `${prefix}/${workspace.workspaceSlug}/inbox${url.search}`,
        });
      return {
        ...common,
        params,
        kind: 'folder' as const,
        folder: page.folder,
        workspace,
      };
    }
    default: {
      const exhaustive: never = page;
      return exhaustive;
    }
  }
}
export type MailPageModel = Awaited<ReturnType<typeof loadPageModel>>;
