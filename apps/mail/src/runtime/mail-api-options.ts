import type { InternalApiClientOptions } from '@tuturuuu/internal-api/client';
import { appPath } from '@tuturuuu/start-bridge/app-url';

export function mailApiPath(path: string) {
  const pathname = path.split(/[?#]/u, 1)[0] ?? '';
  const owned =
    /^\/api\/v1\/workspaces\/[^/]+\/mail(?:\/|$)/u.test(pathname) ||
    /^\/api\/v1\/mail(?:\/|$)/u.test(pathname) ||
    pathname === '/api/ai/email-draft' ||
    pathname === '/api/auth/refresh-app-session';
  return owned ? appPath(path) : path;
}
export const mailApiOptions = {
  appBaseResolver: mailApiPath,
} satisfies InternalApiClientOptions;
