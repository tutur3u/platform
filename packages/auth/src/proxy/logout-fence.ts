import { hasAppLogoutFence, type AppSessionRequest } from '../app-session-core';
import type { AppSessionRefreshState } from './signed-refresh';
export { hasAppLogoutFence } from '../app-session-core';

export async function withAppLogoutFence(
  request: AppSessionRequest,
  resolve: () => Promise<AppSessionRefreshState>
): Promise<AppSessionRefreshState> {
  if (hasAppLogoutFence(request)) return { ok: false, error: 'App signed out' };
  try {
    return await resolve();
  } catch {
    return { ok: false, error: 'Account assurance unavailable' };
  }
}
