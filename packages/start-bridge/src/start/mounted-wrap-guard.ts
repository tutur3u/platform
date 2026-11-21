import {
  isolateMountedCookieHeader,
  type MountIsolationConfig,
  reduceMountedSessionCookieHeader,
  scopeMountedResponseCookies,
  stripMountedSupabaseWrites,
} from '../core/mount-isolation';
import {
  isMountedLogoutPath,
  stripMountedSessionWrites,
} from './mounted-session-guard';

/**
 * A body-less copy of a mounted request with the mount's cookie view: an
 * isolated mount's own cookies, or the baseline reduction. The body may
 * already have been read by the time responses are wrapped.
 */
function reducedView(request: Request, isolation?: MountIsolationConfig) {
  const headers = new Headers(request.headers);
  const raw = headers.get('cookie');
  const cookie = isolation
    ? isolateMountedCookieHeader(raw, isolation)
    : reduceMountedSessionCookieHeader(raw);
  if (cookie === null) headers.delete('cookie');
  else headers.set('cookie', cookie);
  return new Request(request.url, { method: request.method, headers });
}

/**
 * Runs an app's `wrapResponse` on a mounted request with the reduced request,
 * then guards what it returns: no Supabase or first-party session writes, no
 * `Clear-Site-Data`, and (with isolation) no cookie the app does not own
 * outside its base.
 */
export async function guardMountedWrap<Context extends { request: Request }>(
  wrap: (response: Response, context: Context) => Response | Promise<Response>,
  response: Response,
  context: Context,
  mount: { basePath: string; isolation?: MountIsolationConfig }
): Promise<Response> {
  const appPath =
    new URL(context.request.url).pathname.slice(mount.basePath.length) || '/';
  const logout = isMountedLogoutPath(appPath);
  const wrapped = await wrap(response, {
    ...context,
    request: reducedView(context.request, mount.isolation),
  });
  const guarded = stripMountedSupabaseWrites(
    stripMountedSessionWrites(wrapped),
    logout
  );
  return mount.isolation
    ? scopeMountedResponseCookies(
        guarded,
        mount.basePath,
        mount.isolation,
        logout
      )
    : guarded;
}
