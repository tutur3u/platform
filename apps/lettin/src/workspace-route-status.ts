import {
  InternalApiError,
  withForwardedInternalApiAuth,
} from '@tuturuuu/internal-api/client';
import {
  getWorkspaceInviteStatus,
  type WorkspaceInviteStatusResponse,
} from '@tuturuuu/internal-api/workspaces';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import en from '../messages/en.json';
import vi from '../messages/vi.json';

// These are the non-workspace pages alongside [wsId], not workspace aliases.
const standalonePages = new Set([
  'dashboard',
  'login',
  'verify-token',
  'spaces',
  'worlds',
  'creators',
]);

export async function getWorkspaceRouteStatus(
  request: NextRequest,
  pathname: string,
  verifiedHeaders: Headers,
  locale: string
): Promise<NextResponse | null> {
  const [workspaceId, section, worldId, ...rest] = pathname
    .split('/')
    .filter(Boolean);
  if (!workspaceId || standalonePages.has(workspaceId)) return null;

  let status: WorkspaceInviteStatusResponse;
  try {
    status = await getWorkspaceInviteStatus(
      workspaceId,
      withForwardedInternalApiAuth(verifiedHeaders)
    );
  } catch (error) {
    // This probe preserves HTTP status before streaming; it is not the access
    // guard. The workspace layout still verifies the actor and membership.
    // Let that guarded layout recover from a temporarily unavailable probe.
    if (
      error instanceof TypeError ||
      (error instanceof InternalApiError && error.status >= 500)
    )
      return null;
    if (
      !(error instanceof InternalApiError) ||
      ![401, 403, 404].includes(error.status)
    )
      throw error;
    if (error.status === 401 || error.code === 'MFA_REQUIRED') {
      const url = new URL('/login', request.url);
      url.searchParams.set(
        'next',
        `${request.nextUrl.pathname}${request.nextUrl.search}`
      );
      if (error.code === 'MFA_REQUIRED') url.searchParams.set('refresh', '1');
      return NextResponse.redirect(url);
    }
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  if (status.status === 'none')
    return NextResponse.redirect(new URL('/dashboard', request.url));
  // Invitations render their own layout instead of the requested child page.
  if (status.status === 'pending_invite') return null;
  if (
    section !== 'worlds' ||
    !worldId ||
    rest.length ||
    z.guid().safeParse(worldId).success
  )
    return null;

  // A direct response preserves 404 even when the page's loading shell streams.
  // Only static translations are interpolated; no request data enters the HTML.
  const messages = locale === 'vi' ? vi : en;
  const title = messages.route_errors.not_found_title;
  const html = `<!doctype html><html lang="${locale === 'vi' ? 'vi' : 'en'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>404 · Lettin</title><style>html{color-scheme:light dark}body{margin:0;min-height:100vh;display:grid;place-items:center;font-family:system-ui;background:Canvas;color:CanvasText}main{text-align:center;padding:2rem}h1{font-size:3rem;margin:0}a{color:LinkText}</style></head><body><main><h1>404</h1><p>${title}</p><a href="/dashboard">${messages.common.dashboard}</a></main></body></html>`;
  return new NextResponse(html, {
    status: 404,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'private, no-store',
      'x-robots-tag': 'noindex',
    },
  });
}
