import { appPath } from '@tuturuuu/start-bridge/app-url';

export function isMailApiPath(path: string) {
  const pathname = path.split(/[?#]/u, 1)[0] ?? '';
  return (
    /^\/api\/v1\/workspaces\/[^/]+\/mail(?:\/|$)/u.test(pathname) ||
    /^\/api\/v1\/mail(?:\/|$)/u.test(pathname) ||
    pathname === '/api/ai/email-draft' ||
    pathname === '/api/auth/refresh-app-session'
  );
}
export function mailApiPath(path: string) {
  return isMailApiPath(path) ? appPath(path) : path;
}
